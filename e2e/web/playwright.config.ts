import { defineConfig, devices } from '@playwright/test'

const host = process.env.E2E_HOST ?? '127.0.0.1'
const port = Number(process.env.E2E_PORT ?? 8765)
const baseURL = `http://${host}:${port}`

const worker = process.env.E2E_WORKER

const browsers = {
  chromium: devices['Desktop Chrome'],
  webkit: devices['Desktop Safari'],
  firefox: {
    ...devices['Desktop Firefox'],

    launchOptions: {
      firefoxUserPrefs: { 'dom.securecontext.allowlist': host },
    },
  },
}
const sizes = {
  desktop: { width: 1280, height: 900 },
  phone: { width: 390, height: 844 },
}

export default defineConfig({
  testDir: '.',
  outputDir: '../../.verify/web-test-results',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',

    serviceWorkers: 'block',
  },
  webServer:
    !process.env.E2E_HOST && !process.env.E2E_EXTERNAL
      ? {
          command: worker
            ? `node scripts/web-host.mjs serve ${worker} --port ${port}`
            : `node e2e/web/serve.mjs dist ${port}`,
          cwd: '../..',
          url: `${baseURL}/index.html`,
          reuseExistingServer: false,
        }
      : undefined,
  projects: Object.entries(browsers).flatMap(([browser, device]) =>
    Object.entries(sizes).map(([size, viewport]) => ({
      name: `${browser}-${size}`,
      use: {
        ...device,
        viewport,

        launchOptions:
          browser === 'firefox'
            ? { firefoxUserPrefs: { 'dom.securecontext.allowlist': host } }
            : undefined,
      },
    }))
  ),
})
