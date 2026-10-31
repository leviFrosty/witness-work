import fs from 'node:fs'
import path from 'node:path'
import { expect, test as base, type Page } from '@playwright/test'
import { mockRevenueCat, type Catalog, type CustomerKind } from './revenueCat'

/** The preferences store's row in the store database (docs/web-storage.md). */
const PREFERENCES = ['mmkv.default', 'preferences'] as const

/**
 * Past onboarding and the Schedule's intro, so a run opens on Home. The
 * preferences the app saved on its first launch get these on top, so the
 * store's version and defaults stay the app's own.
 */
const SEEN = { onboardingComplete: true, scheduleIntroSeen: true }

/** A CSP or Trusted Types violation, as the page's event reports it. */
type Violation = {
  directive: string
  blocked: string
  source: string
  sample: string
}

/**
 * Every test fails on a CSP or Trusted Types violation its pages report. Only a
 * server that sends a CSP (the web host's Worker, `E2E_WORKER`) has any to
 * report. With `WW_WEB_CSP` set to a folder, each test also saves them there,
 * by project, for `csp-summary.mjs`.
 */
const cspFolder = process.env.WW_WEB_CSP

/**
 * The web profile the run serves (`config/web-environments.json`): the
 * Worker's, or `dev`, which `pnpm web:build` builds by default.
 */
export const profile: {
  helpManifest: string
  helpSearchOrigin: string
} = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../config/web-environments.json'),
    'utf8'
  )
)[process.env.E2E_WORKER ?? 'dev']

/** A language's app strings, by its `src/locales` file name. */
export const strings = (language: string): Record<string, string> =>
  JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../../src/locales', `${language}.json`),
      'utf8'
    )
  )

type Fixtures = {
  /** The app's language, by its `src/locales` file name. */
  language: string
  /** Saved preferences on top of the seed, e.g. a role. */
  preferences: Record<string, unknown>
  /** RevenueCat's offerings (`revenueCat.ts`); none by default. */
  revenueCatCatalog: Catalog
  /** What RevenueCat's customer info shows (`revenueCat.ts`); free by default. */
  revenueCatCustomer: CustomerKind
  /** The app on Home, seeded past onboarding. */
  app: Page
  /** Saves a screenshot to `$WW_WEB_SHOTS/<name>-<project>.png`, if set. */
  shot: (name: string) => Promise<void>
}

/**
 * A row of the app's store database, read in `page` (any page of the app's
 * origin). Undefined when it isn't there, or the database doesn't exist yet,
 * which this never creates.
 */
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

/** Writes a row of the store database while no tab of the app is open. */
const writeStoreRow = (page: Page, id: string, key: string, value: string) =>
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

/**
 * Opens a blank page on the app's origin, without the app, to read or write its
 * storage while no tab of it runs.
 */
export async function openBlankOnOrigin(page: Page) {
  await page.route('**/__blank', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html>' })
  )
  await page.goto('/__blank')
}

export const test = base.extend<Fixtures>({
  page: async (
    { page, baseURL, revenueCatCatalog, revenueCatCustomer },
    provide,
    testInfo
  ) => {
    // Nothing a smoke run does reaches a real service: everything but the
    // app's own server answers 503 here, as a service that's down would.
    const app = new URL(baseURL!).host
    // A `blob:` URL is the page's own object (a picked file, a download), which
    // WebKit reports to the router with no host.
    const isApp = (url: URL) =>
      url.host === app || url.protocol === 'blob:' || url.protocol === 'data:'
    await page.context().route(
      (url) => !isApp(url),
      (route) =>
        route.fulfill({
          status: route.request().method() === 'OPTIONS' ? 204 : 503,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': '*',
          },
        })
    )
    // A build with RevenueCat Billing's key sees a working RevenueCat.
    await mockRevenueCat(page.context(), revenueCatCatalog, revenueCatCustomer)
    await page.context().routeWebSocket(
      (url) => !isApp(url),
      (socket) => socket.close()
    )
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.stack ?? error.message))
    const violations: Violation[] = []
    // Every page in the test's context, across reloads. Report-only
    // violations fire the same event as enforced ones.
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
          // Trusted Types samples start with the sink's name.
          sample: event.sample.split('|')[0] ?? '',
        })
      )
    )
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
  preferences: [{}, { option: true }],
  revenueCatCatalog: [{}, { option: true }],
  revenueCatCustomer: ['free', { option: true }],
  app: async ({ page, language, preferences }, provide) => {
    // A first load in a tab of its own saves the app's preferences, which
    // get the seed on top once that tab is closed (it would save over them).
    // Leaving it, rather than reloading, keeps the requests it cancels (which
    // WebKit reports as page errors) out of the tab under test.
    const seeding = await page.context().newPage()
    await seeding.goto('/')
    await expect
      .poll(() => readStoreRow(seeding, ...PREFERENCES), { timeout: 60_000 })
      .toBeDefined()
    await seeding.close()
    await openBlankOnOrigin(page)
    const saved = JSON.parse(
      (await readStoreRow(page, ...PREFERENCES)) as string
    )
    Object.assign(saved.state, SEEN, preferences, {
      locale: language === 'en-US' ? undefined : language.toLowerCase(),
    })
    await writeStoreRow(page, ...PREFERENCES, JSON.stringify(saved))
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
      // Let entrance animations settle.
      await page.waitForTimeout(1000)
      await page.screenshot({
        path: path.join(directory, `${name}-${testInfo.project.name}.png`),
      })
    })
  },
})

export { expect }
