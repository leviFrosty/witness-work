import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 8899)

/** Tags: @api (requests only, one project), @desktop, @android, @ios. */
const PHONE_ONLY = /@android|@ios/

/**
 * End-to-end tests against the static build, served by `wrangler dev` exactly
 * as Workers Static Assets serves it (wrangler.jsonc: html_handling, the 404
 * page, `_headers`). Build first: `pnpm build` (or `pnpm build:dev` with
 * WW_SITE_ENV=dev, and run with WW_SITE_ENV=dev too). E2E_BASE_URL tests a
 * deployed site.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
      grepInvert: PHONE_ONLY,
    },
    {
      name: 'webkit-desktop',
      use: { ...devices['Desktop Safari'] },
      grepInvert: /@android|@ios|@api/,
    },
    {
      name: 'firefox-desktop',
      use: { ...devices['Desktop Firefox'] },
      grepInvert: /@android|@ios|@api/,
    },
    {
      name: 'chromium-phone',
      use: { ...devices['Pixel 7'] },
      grepInvert: /@ios|@desktop|@api/,
    },
    {
      name: 'webkit-phone',
      use: { ...devices['iPhone 15'] },
      grepInvert: /@android|@desktop|@api/,
    },
    {
      // Firefox has no mobile emulation: a phone-sized window with Firefox
      // for Android's user agent.
      name: 'firefox-phone',
      use: {
        browserName: 'firefox',
        viewport: { width: 412, height: 915 },
        hasTouch: true,
        userAgent:
          'Mozilla/5.0 (Android 15; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0',
      },
      grepInvert: /@ios|@desktop|@api/,
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm exec wrangler dev --port ${PORT}${process.env.WW_SITE_ENV === 'dev' ? ' --env dev' : ''}`,
        port: PORT,
        reuseExistingServer: !process.env.CI,
      },
})
