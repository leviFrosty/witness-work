import fs from 'node:fs'
import path from 'node:path'
import type { Page, Route } from '@playwright/test'
import { expect, readStoreRow, strings, test } from './fixtures'

/**
 * Offline, updates and stale tabs (ADR 0037 §6, docs/web-offline.md). Run
 * through the Worker (`E2E_WORKER=dev`): the service worker needs a real
 * `sw.js`, and the CSP and Trusted Types must let it register. The update specs
 * need a second deploy (`node e2e/web/next-version.mjs`) and skip without
 * `E2E_NEXT_DIST`.
 */

// Signed in: a release build's sign-in screen keeps a signed-out tab out of the
// app, and Cloud Sync runs only with an account.
test.use({
  signedIn: true,
  preferences: { role: 'regularPioneer', roleHistory: null },
})

const text = strings('en-US')
const CHUNK_URL = (name: string) => `/_expo/static/js/web/${name}`

/** A service worker controls the page and has kept the app shell. */
async function waitForOfflineReady(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          await navigator.serviceWorker.ready
          return {
            controlled: navigator.serviceWorker.controller !== null,
            shell:
              (await caches.match('/index.html', { ignoreSearch: true })) !==
              undefined,
            canvaskit:
              (await caches.match('/canvaskit.wasm', {
                ignoreSearch: true,
              })) !== undefined,
          }
        }),
      { timeout: 60_000 }
    )
    .toEqual({ controlled: true, shell: true, canvaskit: true })
}

async function addTwoHours(page: Page) {
  await page.getByRole('button', { name: 'Quick Action' }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Add Time' })
    .click()
  await page.getByTestId('time-entry-duration-pill').click()
  await page.getByRole('listbox', { name: 'Hours' }).selectOption('2')
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByRole('heading', { name: 'Add Time' })).toBeHidden()
}

const timeEntries = (raw: unknown) =>
  Object.values(
    JSON.parse(raw as string).state.serviceReports as Record<
      string,
      Record<string, { hours: number; minutes: number }[]>
    >
  ).flatMap((month) => Object.values(month).flat())

test('registers the service worker on the first load and keeps the app', async ({
  app,
}) => {
  await waitForOfflineReady(app)
  const scope = await app.evaluate(
    async () => (await navigator.serviceWorker.ready).scope
  )
  expect(scope).toBe(new URL('/', app.url()).href)
  // The worker's file is fresh on every update check.
  const worker = await app.request.get('/sw.js')
  expect(worker.headers()['cache-control']).toBe('no-cache')
  expect(worker.headers()['content-type']).toMatch(/javascript/)
  // The manifest is typed, and the page links it.
  const manifest = await app.request.get('/manifest.webmanifest')
  expect(manifest.headers()['content-type']).toBe('application/manifest+json')
  expect(await app.locator('link[rel="manifest"]').getAttribute('href')).toBe(
    '/manifest.webmanifest'
  )
})

test('opens offline from the cache, with its data, shows the banner and syncs back online', async ({
  app,
  context,
  shot,
  browserName,
}) => {
  // Firefox's offline emulation fails a navigation (NS_ERROR_OFFLINE) before
  // the worker can answer it, so only the next spec covers it there.
  test.skip(
    browserName === 'firefox',
    'setOffline fails navigations in Firefox'
  )
  await waitForOfflineReady(app)
  await expect(app.getByText(text.webOffline_banner)).toBeHidden()

  await context.setOffline(true)
  await app.reload()
  // The app, from the cache; the seeded role, from IndexedDB.
  await expect(app.getByRole('button', { name: 'Quick Action' })).toBeVisible()
  await expect(app.getByText(text.webOffline_banner)).toBeVisible()
  // The packaged fonts come from the cache too, not a fallback face.
  await expect
    .poll(() =>
      app.evaluate(async () => {
        await document.fonts.ready
        await document.fonts.load('16px Inter_400Regular').catch(() => [])
        return [...document.fonts]
          .filter((face) =>
            /^"?Inter_(400Regular|700Bold)"?$/.test(face.family)
          )
          .map((face) => face.status)
      })
    )
    .toEqual(['loaded', 'loaded'])
  await shot('offline-banner')

  // An edit offline is saved on the device.
  await addTwoHours(app)
  const entries = timeEntries(
    await readStoreRow(app, 'mmkv.default', 'serviceReports')
  )
  expect(entries.some((entry) => entry.hours * 60 + entry.minutes > 0)).toBe(
    true
  )

  await context.setOffline(false)
  await expect(app.getByText(text.webOffline_banner)).toBeHidden()
})

test('opens offline in the language the first visit loaded', async ({
  app,
  context,
  browserName,
}) => {
  await waitForOfflineReady(app)
  // Firefox's `setOffline` fails the navigation before the worker answers it;
  // there the network is cut by refusing every request instead.
  const refuse = (route: Route) => route.abort('internetdisconnected')
  if (browserName === 'firefox') await context.route('**/*', refuse)
  else await context.setOffline(true)
  await app.reload()
  await expect(
    app.getByRole('button', { name: text.quickAction })
  ).toBeVisible()
  if (browserName === 'firefox') await context.unroute('**/*', refuse)
  else await context.setOffline(false)
})

test.describe('a stored language that cannot download', () => {
  test.use({ language: 'de-DE' })

  test('opens in English instead of a blank page', async ({ app, context }) => {
    // The first load fetched German. Now the worker's copy is gone and the
    // network refuses the file, as offline in a language never cached would.
    await app.evaluate(async () => {
      for (const name of await caches.keys()) await caches.delete(name)
      for (const worker of await navigator.serviceWorker.getRegistrations())
        await worker.unregister()
    })
    await context.route(/\/de-DE-[0-9a-f]+\.js/, (route) => route.abort())
    await app.reload()
    await expect(
      app.getByRole('button', { name: text.quickAction })
    ).toBeVisible()
  })
})

const next = process.env.E2E_NEXT_DIST
const previous = process.env.E2E_PREV_DIST
const served = process.env.E2E_DIST ?? path.join(__dirname, '../../dist')

/** Makes `directory` what the host serves: its files, and none of the others'. */
function deploy(directory: string) {
  const files = (root: string) =>
    fs
      .readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) =>
        path.relative(root, path.join(entry.parentPath, entry.name))
      )
  const wanted = new Set(files(directory))
  for (const file of files(served))
    if (!wanted.has(file)) fs.rmSync(path.join(served, file))
  fs.cpSync(directory, served, { recursive: true, force: true })
}

/** Waits until the host serves `directory`'s page, worker and entry chunk. */
async function waitUntilServed(page: Page, directory: string) {
  const entry = /src="(\/_expo\/static\/js\/web\/index-[0-9a-f]+\.js)"/.exec(
    fs.readFileSync(path.join(directory, 'index.html'), 'utf8')
  )![1]
  const worker = fs.readFileSync(path.join(directory, 'sw.js'), 'utf8')
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8')
  const chunks = fs.readdirSync(path.join(directory, '_expo/static/js/web'))
  await expect
    .poll(
      async () => [
        (await page.request.get('/sw.js')).ok() &&
          (await (await page.request.get('/sw.js')).text()) === worker,
        (await page.request.get(entry)).ok(),
        // Every chunk of that deploy, so a reload doesn't meet a half-swapped host.
        (
          await Promise.all(
            chunks.map((chunk) => page.request.head(`${CHUNK_URL(chunk)}`))
          )
        ).every((response) => response.ok()),
        (await (await page.request.get('/index.html')).text()) === html,
      ],
      { timeout: 30_000 }
    )
    .toEqual([true, true, true, true])
}

test.describe('a second deploy', () => {
  test.skip(!next || !previous, 'needs E2E_NEXT_DIST and E2E_PREV_DIST')
  // On a page a service worker controls, WebKit and Firefox don't route its
  // requests through the harness (`context.route`): the account's session
  // refresh reaches the real API, fails its CORS check, and `fixtures.ts` fails
  // the test on the page error. Chromium routes them.
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'the harness only routes a worker-controlled page’s requests in Chromium'
  )
  test.describe.configure({ mode: 'serial' })
  // Each starts on the previous deploy.
  test.afterEach(async ({ page }) => {
    if (!previous) return
    deploy(previous)
    await waitUntilServed(page, previous)
  })

  test('offers the update, and Reload takes it once', async ({ app, shot }) => {
    await waitForOfflineReady(app)
    // Let the first load settle: WebKit reports requests a reload cancels as
    // page errors (`fixtures.ts`).
    await app.waitForTimeout(3000)
    // The page the User is working in; an automatic reload would lose this.
    await app.evaluate(() => {
      ;(window as unknown as { __wwTab: string }).__wwTab = 'working'
    })
    deploy(next!)
    // The host serves the new deploy: its worker and its entry chunk.
    await waitUntilServed(app, next!)
    // The tab comes back to the front, as the User would, and looks again;
    // the check repeats until the new worker has installed.
    const prompt = app.getByText(text.webUpdate_title)
    await expect(async () => {
      await app.evaluate(() =>
        navigator.serviceWorker.getRegistration().then((r) => r?.update())
      )
      await expect(prompt).toBeVisible({ timeout: 8_000 })
    }).toPass({ timeout: 90_000 })
    await shot('update-prompt')
    // Nothing reloaded by itself.
    expect(
      await app.evaluate(
        () => (window as unknown as { __wwTab?: string }).__wwTab
      )
    ).toBe('working')
    expect(
      await app.evaluate(
        () => (window as unknown as { __wwVersion?: string }).__wwVersion
      )
    ).toBeUndefined()

    const navigations: string[] = []
    // Page loads, not the router's own address changes.
    app.on('load', (loaded) => navigations.push(loaded.url()))
    await app.getByRole('button', { name: text.webUpdate_reload }).click()
    await expect
      .poll(() =>
        app
          .evaluate(
            () => (window as unknown as { __wwVersion?: string }).__wwVersion
          )
          .catch(() => undefined)
      )
      .toBe('next')
    await expect(
      app.getByRole('button', { name: 'Quick Action' })
    ).toBeVisible()
    expect(navigations).toHaveLength(1)
    await expect(app.getByText(text.webUpdate_title)).toBeHidden()
  })

  test('a stale tab that asks for a missing chunk reloads once per build, never in a loop', async ({
    app,
  }) => {
    // The tab runs the previous deploy; then the host serves the next one.
    await waitForOfflineReady(app)
    const old = fs
      .readdirSync(path.join(previous!, '_expo/static/js/web'))
      .find((file) => file.startsWith('de-DE-'))!
    deploy(next!)
    await waitUntilServed(app, next!)
    const navigations: string[] = []
    // Page loads, not the router's own address changes.
    app.on('load', (loaded) => navigations.push(loaded.url()))
    const askForOldChunk = () =>
      app
        .evaluate((url) => {
          const load = (globalThis as Record<string, unknown>)[
            '__loadBundleAsync'
          ] as ((path: string) => Promise<void>) | undefined
          return load?.(url).then(
            () => 'loaded',
            () => 'failed'
          )
        }, CHUNK_URL(old))
        .catch(() => 'navigated')
    // The tab found out it is stale: it reloads, into the next deploy.
    await askForOldChunk()
    await expect.poll(() => navigations.length, { timeout: 30_000 }).toBe(1)
    await expect(
      app.getByRole('button', { name: 'Quick Action' })
    ).toBeVisible()
    // The next deploy is also missing it (a broken deploy): one more reload,
    // for the new build, and then no more.
    await app.waitForTimeout(3000)
    await askForOldChunk()
    await expect.poll(() => navigations.length, { timeout: 30_000 }).toBe(2)
    await expect(
      app.getByRole('button', { name: 'Quick Action' })
    ).toBeVisible()
    await app.waitForTimeout(3000)
    await askForOldChunk()
    await app.waitForTimeout(4000)
    expect(navigations).toHaveLength(2)
  })
})
