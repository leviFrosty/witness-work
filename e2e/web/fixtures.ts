import fs from 'node:fs'
import path from 'node:path'
import { expect, test as base, type Page } from '@playwright/test'

const PREFERENCES_KEY = 'mmkv.default\\preferences'

/**
 * Past onboarding and the Schedule's intro, so a run opens on Home. The
 * preferences the app saved on its first launch get these on top, so the
 * store's version and defaults stay the app's own.
 */
const SEEN = { onboardingComplete: true, scheduleIntroSeen: true }

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
  /** The app on Home, seeded past onboarding. */
  app: Page
  /** Saves a screenshot to `$WW_WEB_SHOTS/<name>-<project>.png`, if set. */
  shot: (name: string) => Promise<void>
}

export const test = base.extend<Fixtures>({
  page: async ({ page, baseURL }, provide) => {
    // Nothing a smoke run does reaches a real service: everything but the
    // app's own server answers 503 here, as a service that's down would.
    const app = new URL(baseURL!).host
    const isApp = (url: URL) => url.host === app
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
    await page.context().routeWebSocket(
      (url) => !isApp(url),
      (socket) => socket.close()
    )
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.stack ?? error.message))
    await provide(page)
    expect(errors, 'uncaught errors on the page').toEqual([])
  },
  language: ['en-US', { option: true }],
  app: async ({ page, language }, provide) => {
    // A first load in a tab of its own saves the app's preferences, which
    // get the seed on top. Leaving it, rather than reloading, keeps the
    // requests it cancels (which WebKit reports as page errors) out of the
    // tab under test.
    const seeding = await page.context().newPage()
    await seeding.goto('/')
    await seeding.waitForFunction(
      (key) => localStorage.getItem(key) !== null,
      PREFERENCES_KEY
    )
    await seeding.evaluate(
      ([key, seen]) => {
        const saved = JSON.parse(localStorage.getItem(key)!)
        Object.assign(saved.state, seen)
        localStorage.setItem(key, JSON.stringify(saved))
      },
      [
        PREFERENCES_KEY,
        {
          ...SEEN,
          locale: language === 'en-US' ? undefined : language.toLowerCase(),
        },
      ] as const
    )
    await seeding.close()
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
