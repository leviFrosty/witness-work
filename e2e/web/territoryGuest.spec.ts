import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { BrowserContext, Page } from '@playwright/test'
import { expect, strings, test } from './fixtures'

const SCRIPT = path.join(
  __dirname,
  '../../scripts/verify/territory-guest-link.mjs'
)
const SHOTS = process.env.E2E_GUEST_SHOTS
const BYPASS = process.env.E2E_GUEST_BYPASS ?? 'fake'
const en = strings('en-US') as unknown as {
  territories: { guest: Record<string, unknown>; share: Record<string, string> }
}

let api = process.env.E2E_GUEST_API ?? ''
let fake: ChildProcess | null = null

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  if (api) return
  const port =
    8796 + test.info().workerIndex * 100 + Math.floor(Math.random() * 100)
  fake = spawn('node', [SCRIPT, 'fake', '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'inherit'],
    detached: true,
  })
  api = await new Promise<string>((resolve, reject) => {
    fake!.stdout!.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim().split('\n')[0]
      try {
        resolve((JSON.parse(line ?? '') as { api: string }).api)
      } catch (error) {
        reject(error)
      }
    })
    fake!.on('exit', () => reject(new Error('fake API exited')))
  })
})

test.afterAll(() => {
  if (fake?.pid) process.kill(-fake.pid)
  fake = null
})

type Link = { url: string; fragment: string; state: string }

function owner(
  command: string,
  state: string,
  args: string[] = []
): Record<string, unknown> {
  const out = execFileSync(
    'node',
    [SCRIPT, command, '--state', state, '--bypass', BYPASS, ...args],
    { encoding: 'utf8' }
  )
  return JSON.parse(
    command === 'records' ? out : (out.trim().split('\n').pop() ?? '{}')
  )
}

function makeLink(name: string, args: string[] = []): Link {
  const state = test.info().outputPath(`${name}.json`)
  const made = owner('create', state, ['--api', api, ...args]) as {
    url: string
    fragment: string
  }
  return { ...made, state }
}

type Sent = { url: string; body: string; headers: string }

async function routeGuestOps(context: BrowserContext, sent: Sent[]) {
  context.on('request', (request) =>
    sent.push({
      url: request.url(),
      body: request.postData() ?? '',
      headers: JSON.stringify(request.headers()),
    })
  )
  await context.route(
    (url) => url.pathname.startsWith('/spaces/v1/guest/'),
    async (route) => {
      const request = route.request()
      const cors = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers':
          request.headers()['access-control-request-headers'] ?? '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-expose-headers': 'Date, Retry-After',
      }
      if (request.method() === 'OPTIONS')
        return route.fulfill({ status: 204, headers: cors })
      const response = await fetch(`${api}${new URL(request.url()).pathname}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cf-connecting-ip': `10.9.${randomBytes(2).join('.')}`,
        },
        body: request.postData() ?? '',
      })
      const headers: Record<string, string> = {
        ...cors,
        'content-type': 'application/json',
      }
      for (const name of ['date', 'retry-after']) {
        const value = response.headers.get(name)
        if (value) headers[name] = value
      }
      await route.fulfill({
        status: response.status,
        headers,
        body: await response.text(),
      })
    }
  )
}

async function shot(page: Page, name: string) {
  const file = test.info().outputPath(`${name}.png`)
  await page.screenshot({ path: file })
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true })
    fs.copyFileSync(
      file,
      path.join(SHOTS, `${test.info().project.name}-${name}.png`)
    )
  }
}

const secretOf = (fragment: string) => fragment.split('.')[3] as string

test('a guest opens a link, names themself, records doors, and sees others’ records', async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(120_000)
  const sent: Sent[] = []
  await routeGuestOps(context, sent)
  page.on('dialog', (dialog) => void dialog.accept())
  const link = makeLink('live')
  await page.goto(`/territories/guest#${link.fragment}`)

  await expect(page.getByTestId('guest-name-card')).toBeVisible()
  expect(await page.evaluate(() => location.href)).toBe(
    `${baseURL}/territories/guest`
  )
  await expect(page.getByTestId('guest-title')).toHaveText(
    "Anna's Territory 12 · North Hill"
  )
  await expect(page.getByTestId('guest-ends')).toContainText('Ends')
  await shot(page, '1-name-step')

  await page.getByTestId('guest-name-input').fill('Maria')
  await page.getByTestId('guest-name-continue').click()
  await expect(page.getByTestId('door-recorder')).toBeVisible()
  await expect(page.getByTestId('door-row-4')).toContainText('Joe')

  await page.getByTestId('door-outcome-notHome').click()
  await expect(page.getByTestId('door-row-1')).toBeVisible()
  await page.getByTestId('door-outcome-spoke').click()
  await expect(page.getByTestId('door-row-3')).toBeVisible()

  owner('door', link.state, ['--label', '10', '--name', 'Joe'])
  await expect(page.getByTestId('door-row-10')).toBeVisible({
    timeout: 40_000,
  })
  await expect(page.getByTestId('door-row-10')).toContainText('Joe')
  await shot(page, '2-recorder')

  await expect
    .poll(
      () =>
        (owner('records', link.state) as unknown as Record<string, unknown>[])
          .filter((record) => record.kind === 'door')
          .map((record) => record.data as { label: string; byName?: string })
          .filter((door) => door.byName === 'Maria')
          .map((door) => door.label)
          .sort(),
      { timeout: 30_000 }
    )
    .toEqual(['1', '3'])
  const names = (
    owner('records', link.state) as unknown as Record<string, unknown>[]
  )
    .filter((record) => record.kind === 'guest')
    .map((record) => (record.data as { name: string }).name)
  expect(names).toEqual(['Maria'])

  const secret = secretOf(link.fragment)
  for (const request of sent) {
    expect(request.url).not.toContain(secret)
    expect(request.body).not.toContain(secret)
    expect(request.headers).not.toContain(secret)
    expect(request.url).not.toContain(link.fragment)
    expect(request.body).not.toContain(link.fragment)
  }
  const tokenBearing = sent.filter(
    (request) =>
      !request.url.startsWith(baseURL!) && request.body.includes('linkToken')
  )
  for (const request of tokenBearing)
    expect(request.url).toMatch(/\/spaces\/v1\/guest\/(sync|put)$/)

  await page.getByTestId('street-finish').click()
  await expect
    .poll(
      () =>
        (owner('records', link.state) as unknown as Record<string, unknown>[])
          .filter((record) => record.kind === 'worked')
          .map((record) => (record.data as { byName?: string }).byName),
      { timeout: 30_000 }
    )
    .toEqual(['Maria'])

  await page.reload()
  await expect(page.getByTestId('door-recorder')).toBeVisible()
  await expect(page.getByTestId('door-row-10')).toBeVisible()
})

test('the page says so when the link is ended, and keeps nothing', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000)
  await routeGuestOps(context, [])
  const link = makeLink('ended')
  await page.goto(`/territories/guest#${link.fragment}`)
  await expect(page.getByTestId('guest-name-card')).toBeVisible()
  owner('end', link.state)
  await expect(page.getByTestId('guest-state-ended')).toBeVisible({
    timeout: 40_000,
  })
  await expect(page.getByTestId('guest-state-ended')).toContainText(
    en.territories.guest.ended_title as string
  )
  await shot(page, '3-ended')
  const kept = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) =>
      key.startsWith('ww.territoryGuest.v1.')
    )
  )
  expect(kept).toEqual([])
})

test('an expired link says it expired', async ({ page, context }) => {
  await routeGuestOps(context, [])
  const link = makeLink('expired', ['--hours', '0.002'])
  await new Promise((resolve) => setTimeout(resolve, 8000))
  await page.goto(`/territories/guest#${link.fragment}`)
  await expect(page.getByTestId('guest-state-expired')).toBeVisible()
  await shot(page, '4-expired')
})

test('an unknown link says it doesn’t work, with the address cleared', async ({
  page,
  context,
}) => {
  const sent: Sent[] = []
  await routeGuestOps(context, sent)
  const unknown = `v1.${randomBytes(16).toString('base64url')}.${randomBytes(16).toString('base64url')}.${randomBytes(32).toString('base64url')}`
  await page.goto(`/territories/guest#${unknown}`)
  await expect(page.getByTestId('guest-state-invalid')).toBeVisible()
  expect(await page.evaluate(() => location.hash)).toBe('')
  expect(sent.some((request) => request.url.endsWith('/guest/sync'))).toBe(true)
  await shot(page, '5-invalid')
})

test('with the owner’s privacy mode on, a guest marks streets worked and notes do-not-calls only', async ({
  page,
  context,
}) => {
  await routeGuestOps(context, [])
  const link = makeLink('privacy', ['--privacy'])
  await page.goto(`/territories/guest#${link.fragment}`)
  await page.getByTestId('guest-name-input').fill('Maria')
  await page.getByTestId('guest-name-continue').click()
  await expect(page.getByTestId('guest-privacy')).toBeVisible()
  await expect(page.getByTestId('door-recorder')).toHaveCount(0)
  const [streetId] = (
    JSON.parse(fs.readFileSync(link.state, 'utf8')) as { streetIds: string[] }
  ).streetIds
  await page.getByTestId(`guest-worked-${streetId}`).click()
  await expect
    .poll(
      () =>
        (owner('records', link.state) as unknown as Record<string, unknown>[])
          .filter((record) => record.kind === 'worked')
          .map((record) => (record.data as { byName?: string }).byName),
      { timeout: 30_000 }
    )
    .toEqual(['Maria'])
  await shot(page, '6-privacy')
})

test.describe('a second visit', () => {
  test.use({ serviceWorkers: 'allow' })

  test('loads the page and the territory from the device', async ({
    page,
    context,
    baseURL,
    browserName,
  }) => {
    test.skip(
      !!process.env.E2E_EXTERNAL,
      'the dev server has no service worker'
    )
    test.skip(
      browserName === 'firefox',
      'setOffline fails navigations in Firefox'
    )
    test.setTimeout(120_000)
    const sent: Sent[] = []
    await routeGuestOps(context, sent)
    const network = { down: false, held: null as (() => void) | null }
    await context.route(
      (url) => url.pathname === '/spaces/v1/guest/sync',
      async (route) => {
        if (route.request().method() === 'OPTIONS') return route.fallback()
        if (network.down) return route.abort('internetdisconnected')
        if (network.held)
          await new Promise<void>((release) => {
            network.held = release
          })
        await route.fallback()
      }
    )
    const link = makeLink('second-visit')
    const secret = secretOf(link.fragment)
    await page.goto(`/territories/guest#${link.fragment}`)
    await expect(page.getByTestId('guest-title')).toBeVisible()

    const kept = () =>
      page.evaluate(async () => {
        const registrations = await navigator.serviceWorker.getRegistrations()
        const names = await caches.keys()
        const keys = (await (await caches.open('ww-guest')).keys()).map(
          (request) => request.url
        )
        return {
          scopes: registrations.map(({ scope }) => new URL(scope).pathname),
          caches: names,
          keys,
        }
      })
    await expect
      .poll(
        async () => {
          const { keys } = await kept()
          return {
            shell: keys.some((key) => key.endsWith('/index.html')),
            entry: keys.some((key) =>
              /\/_expo\/static\/js\/web\/index-[0-9a-f]{32}\.js$/.test(key)
            ),
            guest: keys.some((key) =>
              /\/startGuest-[0-9a-f]{32}\.js$/.test(key)
            ),
          }
        },
        { timeout: 60_000 }
      )
      .toEqual({ shell: true, entry: true, guest: true })
    const stored = await kept()
    expect(stored.scopes).toEqual(['/territories/guest'])
    expect(
      stored.caches.filter((name) => name.startsWith('workbox-precache'))
    ).toEqual([])
    for (const key of stored.keys) {
      expect(key).not.toContain(secret)
      expect(key).not.toContain('#')
      expect(new URL(key).pathname).not.toBe('/territories/guest')
    }
    expect(stored.keys.some((key) => /\/startApp-/.test(key))).toBe(false)
    await page.close()

    sent.length = 0
    network.held = () => {}
    const second = await context.newPage()
    const answers: { url: string; fromWorker: boolean }[] = []
    second.on('response', (response) => {
      const { origin, pathname } = new URL(response.url())
      if (
        origin === baseURL &&
        !pathname.startsWith('/icons/') &&
        !['/manifest.webmanifest', '/favicon.ico'].includes(pathname)
      )
        answers.push({
          url: response.url(),
          fromWorker: response.fromServiceWorker(),
        })
    })
    await second.goto(`/territories/guest#${link.fragment}`)
    await expect(second.getByTestId('guest-title')).toHaveText(
      "Anna's Territory 12 · North Hill"
    )
    expect(await second.evaluate(() => location.hash)).toBe('')
    expect(answers.length).toBeGreaterThan(3)
    expect(answers.filter((answer) => !answer.fromWorker)).toEqual([])
    await expect
      .poll(() => sent.filter((request) => request.url.endsWith('/guest/sync')))
      .not.toEqual([])
    const [sync] = sent.filter((request) => request.url.endsWith('/guest/sync'))
    expect((JSON.parse(sync!.body) as { since: number }).since).toBeGreaterThan(
      0
    )
    network.held()
    network.held = null
    for (const request of sent) {
      expect(request.url).not.toContain(secret)
      expect(request.url).not.toContain(link.fragment)
    }
    await second.close()

    network.down = true
    await context.setOffline(true)
    const offline = await context.newPage()
    await offline.goto('/territories/guest')
    await expect(offline.getByTestId('guest-title')).toHaveText(
      "Anna's Territory 12 · North Hill"
    )
    await expect(offline.getByTestId('guest-offline')).toBeVisible()
    await shot(offline, '7-offline-second-visit')
    await context.setOffline(false)
  })
})
