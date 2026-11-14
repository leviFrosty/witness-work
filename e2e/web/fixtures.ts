import fs from 'node:fs'
import path from 'node:path'
import { expect, test as base, type Page } from '@playwright/test'
import { mockRevenueCat, type Catalog, type CustomerKind } from './revenueCat'
import { answerSessionRefresh, seedSession } from './session'

const PREFERENCES = ['mmkv.default', 'preferences'] as const

const SEEN = { onboardingComplete: true, scheduleIntroSeen: true }

type Violation = {
  directive: string
  blocked: string
  source: string
  sample: string
}

const cspFolder = process.env.WW_WEB_CSP

export const profile: {
  apiOrigin: string
  posthogOrigin: string
  mapsOrigin: string
  helpManifest: string
  helpSearchOrigin: string
} = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../config/web-environments.json'),
    'utf8'
  )
)[process.env.E2E_WORKER ?? 'local']

export const localApiOrigin = (() => {
  const origin = process.env.E2E_API_ORIGIN
  if (!origin) return undefined
  const { hostname } = new URL(origin)
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname))
    throw new Error(
      `E2E_API_ORIGIN must be a local ww-api (localhost, 127.0.0.1 or ::1), not ${hostname}`
    )
  return origin
})()

export const strings = (language: string): Record<string, string> =>
  JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../../src/locales', `${language}.json`),
      'utf8'
    )
  )

type Fixtures = {
  tolerateErrors: RegExp | null

  language: string

  preferences: Record<string, unknown>

  revenueCatCatalog: Catalog

  revenueCatCustomer: CustomerKind

  seed: {
    contacts?: Record<string, unknown>[]
    conversations?: Record<string, unknown>[]
  }

  storeState: Record<string, Record<string, unknown>>

  signedIn: boolean

  withoutAccountOnce: boolean

  app: Page

  shot: (name: string) => Promise<void>
}

export const readStoreRow = (page: Page, id: string, key: string) =>
  page.evaluate(
    ([id, key]) =>
      new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open('witnesswork-stores')
        request.onupgradeneeded = () => request.transaction?.abort()
        request.onerror = () => resolve(undefined)
        request.onsuccess = () => {
          const db = request.result
          if (!db.objectStoreNames.contains('entries')) {
            db.close()
            return resolve(undefined)
          }
          const get = db
            .transaction('entries')
            .objectStore('entries')
            .get([id, key])
          get.onsuccess = () => {
            db.close()
            resolve(get.result)
          }
          get.onerror = () => reject(get.error)
        }
      }),
    [id, key] as const
  )

export const writeStoreRow = (
  page: Page,
  id: string,
  key: string,
  value: string
) =>
  page.evaluate(
    ([id, key, value]) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('witnesswork-stores')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('entries', 'readwrite')
          tx.objectStore('entries').put(value, [id, key])
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
    [id, key, value] as const
  )

export async function openBlankOnOrigin(page: Page) {
  await page.route('**/__blank', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html>' })
  )
  await page.goto('/__blank')
}

export const test = base.extend<Fixtures>({
  page: async (
    {
      page,
      baseURL,
      revenueCatCatalog,
      revenueCatCustomer,
      withoutAccountOnce,
      tolerateErrors,
      signedIn,
    },
    provide,
    testInfo
  ) => {
    const app = new URL(baseURL!).host

    const api = localApiOrigin && new URL(localApiOrigin).host

    const isApp = (url: URL) =>
      url.host === app ||
      (!!api && url.host === api) ||
      url.protocol === 'blob:' ||
      url.protocol === 'data:'
    await page.context().route(
      (url) => !isApp(url),
      (route) =>
        route.fulfill({
          status: route.request().method() === 'OPTIONS' ? 204 : 503,
          headers: {
            'Access-Control-Allow-Origin': '*',

            'Access-Control-Allow-Headers':
              route.request().headers()['access-control-request-headers'] ??
              '*',
            'Access-Control-Allow-Methods': '*',
          },
        })
    )

    await page.context().addInitScript((once) => {
      try {
        if (once) {
          if (sessionStorage.getItem('ww-e2e-opened')) return
          sessionStorage.setItem('ww-e2e-opened', '1')
        }
        sessionStorage.setItem('ww-web-sign-in-later', '1')
      } catch {}
    }, withoutAccountOnce)

    await mockRevenueCat(page.context(), revenueCatCatalog, revenueCatCustomer)
    await page.context().routeWebSocket(
      (url) => !isApp(url),
      (socket) => socket.close()
    )
    const errors: string[] = []
    page.on('pageerror', (error) => {
      const text = `${error.message}\n${error.stack ?? ''}`
      if (tolerateErrors?.test(text)) return
      errors.push(error.stack ?? error.message)
    })
    const violations: Violation[] = []

    await page
      .context()
      .exposeBinding('__wwCspViolation', (_source, violation: Violation) => {
        violations.push(violation)
      })
    await page.context().addInitScript(() =>
      document.addEventListener('securitypolicyviolation', (event) =>
        (
          window as unknown as {
            __wwCspViolation: (violation: Violation) => void
          }
        ).__wwCspViolation({
          directive: event.effectiveDirective,
          blocked: event.blockedURI,
          source: event.sourceFile
            ? `${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`
            : '',

          sample: event.sample.split('|')[0] ?? '',
        })
      )
    )

    if (signedIn) {
      await answerSessionRefresh(page.context(), profile.apiOrigin)
      await openBlankOnOrigin(page)
      await seedSession(page)
    }
    await provide(page)
    if (cspFolder) {
      const folder = path.join(cspFolder, testInfo.project.name)
      fs.mkdirSync(folder, { recursive: true })
      fs.writeFileSync(
        path.join(
          folder,
          `${testInfo.titlePath.slice(1).join(' ').replace(/\W+/g, '-')}.json`
        ),
        JSON.stringify(violations, null, 2)
      )
    }
    expect(errors, 'uncaught errors on the page').toEqual([])
    expect(violations, 'CSP violations').toEqual([])
  },
  language: ['en-US', { option: true }],
  tolerateErrors: [null, { option: true }],
  preferences: [{}, { option: true }],
  revenueCatCatalog: [{}, { option: true }],
  revenueCatCustomer: ['free', { option: true }],
  seed: [{}, { option: true }],
  storeState: [{}, { option: true }],
  signedIn: [false, { option: true }],
  withoutAccountOnce: [false, { option: true }],
  app: async ({ page, language, preferences, seed, storeState }, provide) => {
    const seeding = await page.context().newPage()
    await seeding.goto('/')
    await expect
      .poll(() => readStoreRow(seeding, ...PREFERENCES), { timeout: 60_000 })
      .toBeDefined()

    const seeded = Object.entries(seed).filter(([, items]) => items?.length)
    for (const [store] of seeded)
      await expect
        .poll(() => readStoreRow(seeding, 'mmkv.default', store), {
          timeout: 5_000,
        })
        .toBeDefined()
        .catch(() => undefined)
    await seeding.close()
    await openBlankOnOrigin(page)
    const saved = JSON.parse(
      (await readStoreRow(page, ...PREFERENCES)) as string
    )
    Object.assign(saved.state, SEEN, preferences, {
      locale: language === 'en-US' ? undefined : language.toLowerCase(),
    })
    await writeStoreRow(page, ...PREFERENCES, JSON.stringify(saved))

    for (const [store, items] of seeded) {
      const row = (await readStoreRow(page, 'mmkv.default', store)) as
        | string
        | undefined
      const stored = row ? JSON.parse(row) : { state: {}, version: 0 }
      stored.state[store] = [...(stored.state[store] ?? []), ...items!]
      await writeStoreRow(page, 'mmkv.default', store, JSON.stringify(stored))
    }
    for (const [store, state] of Object.entries(storeState)) {
      const row = (await readStoreRow(page, 'mmkv.default', store)) as
        | string
        | undefined
      const stored = row ? JSON.parse(row) : { state: {}, version: 0 }
      Object.assign(stored.state, state)
      await writeStoreRow(page, 'mmkv.default', store, JSON.stringify(stored))
    }
    await page.goto('/')
    await expect(
      page.getByRole('button', { name: strings(language).quickAction })
    ).toBeVisible()
    await provide(page)
  },
  shot: async ({ page }, provide, testInfo) => {
    const directory = process.env.WW_WEB_SHOTS
    await provide(async (name) => {
      if (!directory) return
      fs.mkdirSync(directory, { recursive: true })

      await page.waitForTimeout(1000)
      await page.screenshot({
        path: path.join(directory, `${name}-${testInfo.project.name}.png`),
      })
    })
  },
})

export { expect }
