import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 8899)

const PHONE_ONLY = /@android|@ios/

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
        command: `pnpm exec wrangler dev --port ${PORT}${process.env.WW_SITE_ENV === 'beta' ? ' --env beta' : ''}`,
        port: PORT,
        reuseExistingServer: !process.env.CI,
      },
})
