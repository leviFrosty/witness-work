import type { Page } from '@playwright/test'
import { expect, readStoreRow, strings, test } from './fixtures'

test.use({ signedIn: true, serviceWorkers: 'allow' })

const text = strings('en-US')
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

const offerInstall = (page: Page) =>
  page.evaluate(() => {
    const event = Object.assign(new Event('beforeinstallprompt'), {
      prompt: () => {
        ;(window as unknown as { __prompted: number }).__prompted =
          ((window as unknown as { __prompted?: number }).__prompted ?? 0) + 1
        return Promise.resolve()
      },
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    })
    window.dispatchEvent(event)
  })

const banner = (page: Page) =>
  page.getByText(text.webInstall_title, { exact: true })

test.describe('an Android phone', () => {
  test.use({ userAgent: ANDROID_UA })
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Chromium is the browser that offers the install prompt'
  )

  test('shows the banner once the browser offers install, and Install opens the prompt', async ({
    app,
    shot,
  }) => {
    await expect(banner(app)).toBeHidden()
    await offerInstall(app)
    await expect(banner(app)).toBeVisible()
    await expect(app.getByText(text.webInstall_message)).toBeVisible()
    await shot('install-banner')
    await app.getByTestId('install-app').click()
    await expect
      .poll(() =>
        app.evaluate(
          () => (window as unknown as { __prompted?: number }).__prompted
        )
      )
      .toBe(1)

    await app.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
    await expect(banner(app)).toBeHidden()
  })

  test('the X hides it for good, kept in the app’s stores and not localStorage', async ({
    app,
  }) => {
    await offerInstall(app)
    await expect(banner(app)).toBeVisible()
    const dismiss = app.getByTestId('install-dismiss')
    const box = await dismiss.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
    await dismiss.click()
    await expect(banner(app)).toBeHidden()
    await app.reload()
    await expect(
      app.getByRole('button', { name: 'Quick Action' })
    ).toBeVisible()
    await offerInstall(app)
    await app.waitForTimeout(1000)
    await expect(banner(app)).toBeHidden()
    expect(
      await readStoreRow(app, 'mmkv.default', 'webInstall.dismissed')
    ).toBeDefined()
    expect(
      await app.evaluate(() =>
        Object.keys(localStorage).filter((key) => /install/i.test(key))
      )
    ).toEqual([])
  })

  test('shows nothing when the browser never offers install', async ({
    app,
  }) => {
    await app.waitForTimeout(1500)
    await expect(banner(app)).toBeHidden()
  })
})

test.describe('an Android phone that isn’t signed in', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Chromium is the browser that offers the install prompt'
  )

  test('offers install on the sign-in screen, and not on the steps after it', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      userAgent: ANDROID_UA,
      viewport: { width: 412, height: 915 },
      isMobile: true,
      hasTouch: true,
    })
    const host = new URL(baseURL!).host
    await context.route(
      (url) => url.host !== host,
      (route) => route.fulfill({ status: 503 })
    )
    const app = await context.newPage()
    await app.goto('/')
    await expect(app.getByText(text.webSignIn_title)).toBeVisible()
    await offerInstall(app)
    await expect(banner(app)).toBeVisible()
    const directory = process.env.WW_WEB_SHOTS
    if (directory)
      await app.screenshot({ path: `${directory}/install-banner-sign-in.png` })

    await app.getByText(text.webSignIn_recoveryKey, { exact: true }).click()
    await expect(app.getByTestId('web-sign-in-back')).toBeVisible()
    await expect(banner(app)).toBeHidden()
    await app.getByTestId('web-sign-in-back').click()
    await expect(banner(app)).toBeVisible()

    await app.getByTestId('install-app').click()
    await expect
      .poll(() =>
        app.evaluate(
          () => (window as unknown as { __prompted?: number }).__prompted
        )
      )
      .toBe(1)
    await context.close()
  })
})

test.describe('an iPhone', () => {
  test.use({ userAgent: IPHONE_UA })
  test.skip(
    ({ browserName }) => browserName !== 'webkit',
    'Safari’s engine is the one that reads the Smart App Banner'
  )

  test('has Safari’s Smart App Banner and draws none of its own', async ({
    app,
  }) => {
    await expect(app.locator('meta[name="apple-itunes-app"]')).toHaveAttribute(
      'content',
      'app-id=6469723047'
    )
    await offerInstall(app)
    await app.waitForTimeout(1000)
    await expect(banner(app)).toBeHidden()
  })
})

test.describe('a computer', () => {
  test('shows no banner even when the browser offers install', async ({
    app,
  }) => {
    await offerInstall(app)
    await app.waitForTimeout(1000)
    await expect(banner(app)).toBeHidden()
  })
})
