import { defineConfig, devices } from '@playwright/test'

// Where the app is served. A run starts its own server on 127.0.0.1; with
// another host (a browser in a container reaching yours), serve it yourself.
const host = process.env.E2E_HOST ?? '127.0.0.1'
const port = Number(process.env.E2E_PORT ?? 8765)
const baseURL = `http://${host}:${port}`

const browsers = {
  chromium: devices['Desktop Chrome'],
  webkit: devices['Desktop Safari'],
  firefox: devices['Desktop Firefox'],
}
const sizes = {
  desktop: { width: 1280, height: 900 },
  phone: { width: 390, height: 844 },
}

/**
 * Smoke tests for the web export in `dist/` (`pnpm web:build`), served the way
 * the web host serves it, in Chromium, WebKit and Firefox at desktop and phone
 * sizes. `pnpm web:test`; see `e2e/web/README.md`.
 */
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
  },
  webServer: ['127.0.0.1', 'localhost'].includes(host)
    ? {
        command: `node e2e/web/serve.mjs dist ${port}`,
        cwd: '../..',
        url: `${baseURL}/index.html`,
        reuseExistingServer: false,
      }
    : undefined,
  projects: Object.entries(browsers).flatMap(([browser, device]) =>
    Object.entries(sizes).map(([size, viewport]) => ({
      name: `${browser}-${size}`,
      use: { ...device, viewport },
    }))
  ),
})
