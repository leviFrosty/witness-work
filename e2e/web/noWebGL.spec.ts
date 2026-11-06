import type { BrowserContext, Page } from '@playwright/test'
import {
  expect,
  openBlankOnOrigin,
  profile,
  readStoreRow,
  strings,
  test,
  writeStoreRow,
} from './fixtures'
import { answerSessionRefresh, seedSession } from './session'

/**
 * Skia draws through WebGL and Skia's CanvasKit, which downloads on demand
 * (`src/lib/canvasKit`). A browser without WebGL (hardware acceleration off,
 * some locked-down machines), or one where CanvasKit can't download, still gets
 * the whole app: what draws with Skia falls back quietly (the welcome scene's
 * plain background, the button without its sheen, a chart's space), with no
 * error screen. Any uncaught error fails the test (`fixtures.ts`).
 */

const en = strings('en-US')
const PACE_TITLE = (en.serviceYearPace as unknown as { title: string }).title

test.skip(
  ({ browserName }) => browserName === 'webkit',
  'The stubs are the same everywhere; Chromium and Firefox cover them'
)

/** The page gets no WebGL context, as with hardware acceleration off. */
const withoutWebGL = (context: BrowserContext) =>
  context.addInitScript(() => {
    const prototypes = [
      HTMLCanvasElement.prototype,
      globalThis.OffscreenCanvas?.prototype,
    ].filter(Boolean) as { getContext: (...args: unknown[]) => unknown }[]
    for (const prototype of prototypes) {
      const getContext = prototype.getContext
      prototype.getContext = function (type: unknown, ...rest: unknown[]) {
        return /webgl/i.test(String(type))
          ? null
          : getContext.call(this, type, ...rest)
      }
    }
  })

/** CanvasKit's wasm can't download; returns whether the page asked for it. */
async function withoutCanvasKit(context: BrowserContext) {
  const asked = { canvasKit: false }
  await context.route('**/canvaskit.wasm', (route) => {
    asked.canvasKit = true
    return route.abort()
  })
  return asked
}

const PREFERENCES = ['mmkv.default', 'preferences'] as const

/**
 * A new, signed-in account on its first visit: the welcome scene first. Its
 * Cloud Sync is known to be for Supporters only, so onboarding doesn't wait for
 * the account's data (`useWebOnboardingHold`).
 */
async function newAccount(page: Page) {
  await answerSessionRefresh(page.context(), profile.apiOrigin)
  await openBlankOnOrigin(page)
  await seedSession(page)
  const first = await page.context().newPage()
  await first.goto('/')
  await expect
    .poll(() => readStoreRow(first, ...PREFERENCES), { timeout: 60_000 })
    .toBeDefined()
  await first.close()
  await openBlankOnOrigin(page)
  const saved = JSON.parse((await readStoreRow(page, ...PREFERENCES)) as string)
  Object.assign(saved.state, {
    role: 'regularPioneer',
    cloudSyncConfig: { enabled: true, entitlement: 'supporter' },
    cloudSyncEntitled: false,
  })
  await writeStoreRow(page, ...PREFERENCES, JSON.stringify(saved))
}

/** Home → Settings → Device Sync, the web's Cloud Sync settings. */
async function openCloudSync(page: Page) {
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: en.syncSettingsTitle }).click()
  await expect(
    page.getByRole('heading', { name: en.syncSettingsTitle })
  ).toBeVisible()
}

/** Progress → Year, whose service year pace card draws a Skia chart. */
async function openYearProgress(page: Page) {
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await page.getByText(en.year, { exact: true }).first().click()
  await expect(page.getByText(PACE_TITLE).first()).toBeVisible()
}

test.describe('without WebGL', () => {
  test('onboarding reaches Home, and Cloud Sync and a chart open', async ({
    page,
    shot,
  }) => {
    test.setTimeout(180_000)
    await withoutWebGL(page.context())
    const asked = await withoutCanvasKit(page.context())
    await newAccount(page)
    await page.goto('/')
    await shot('no-webgl-welcome')
    // The welcome intro plays before its buttons respond.
    await page
      .getByRole('button', { name: en.getStarted })
      .click({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Skip' }).click()
    await page.getByRole('button', { name: 'Start fresh' }).click()
    // The status the account already has.
    await page.getByRole('button', { name: /^Continue as / }).click()
    // The rest of onboarding, as it asks: each step's main button.
    const home = page.getByRole('button', { name: en.quickAction })
    const next = page
      .getByRole('button', {
        name: /^(Continue|Skip|Not Now|Done|Finish|I.ll plan later)/,
      })
      .last()
    for (let step = 0; step < 12 && !(await home.isVisible()); step++)
      await next.click({ timeout: 5_000 }).catch(() => undefined)
    await expect(home).toBeVisible()
    await shot('no-webgl-home')
    await openYearProgress(page)
    await shot('no-webgl-progress')
    await openCloudSync(page)
    await shot('no-webgl-cloud-sync')
    // Without WebGL there's nothing to draw with, so nothing downloads it.
    expect(asked.canvasKit).toBe(false)
  })
})

test.describe('when CanvasKit can’t download', () => {
  test.use({
    signedIn: true,
    preferences: { role: 'regularPioneer', roleHistory: null },
  })

  test('Home, Cloud Sync and a chart still open', async ({ app, shot }) => {
    const asked = await withoutCanvasKit(app.context())
    // Home may have loaded it already (the Scribe AI orb); start over.
    await app.reload()
    await openYearProgress(app)
    await shot('no-canvaskit-progress')
    await openCloudSync(app)
    // A browser with WebGL asks for it when the chart first draws.
    const hasWebGL = await app.evaluate(
      () => !!document.createElement('canvas').getContext('webgl')
    )
    expect(asked.canvasKit).toBe(hasWebGL)
  })
})
