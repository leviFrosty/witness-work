import { expect, test } from '@playwright/test'
import enUS from '../../src/components/landing/i18n/en-US.ts'
import {
  DEFAULT_LOCALE,
  HELP_LOCALES,
  localeDirection,
} from '../../src/lib/help-center/locales.ts'
import { landingPath, supportPath } from '../../src/lib/paths.ts'
import { SITE } from '../../src/lib/site.ts'

const ORIGIN = SITE.origin

for (const locale of HELP_LOCALES) {
  test(`landing page in ${locale}`, async ({ page }) => {
    const path = landingPath(locale)
    const response = await page.goto(path)
    expect(response?.status()).toBe(200)
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      localeDirection(locale)
    )
    await expect(page).toHaveTitle(/WitnessWork/)
    await expect(page.locator('#main h1').first()).toBeVisible()
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      locale === DEFAULT_LOCALE ? `${ORIGIN}/` : `${ORIGIN}${path}`
    )
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(
      HELP_LOCALES.length + 1
    )
    await expect(
      page.locator('link[rel="alternate"][hreflang="x-default"]')
    ).toHaveAttribute('href', `${ORIGIN}/`)
    // The footer's contact link is the support page in the same language.
    await expect(
      page.locator(`footer a[href="${supportPath(locale)}"]`)
    ).toHaveCount(1)
  })
}

test("the landing page's download QR code points at /get", async ({
  request,
}) => {
  const qr = await request.get('/images/get-qr.svg')
  expect(qr.ok()).toBe(true)
  // A version-3 code, as the old one was, for https://witnesswork.app/get.
  expect(await qr.text()).toContain('viewBox="0 0 29 29"')
})

test('privacy policy', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Privacy Policy'
  )
  await expect(page.locator('main')).toContainText('support@witnesswork.app')
  await expect(page.locator('main')).not.toContainText('leviwilkerson.com')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `${ORIGIN}/privacy`
  )
})

test('terms of use', async ({ page }) => {
  await page.goto('/terms')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Terms of Use'
  )
  await expect(page.locator('main')).toContainText('support@witnesswork.app')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `${ORIGIN}/terms`
  )
})

test('support page offers the Help Center, email, and GitHub', async ({
  page,
}) => {
  await page.goto('/support')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    enUS.footer.contact
  )
  await expect(page.getByRole('link', { name: enUS.faq.more })).toHaveAttribute(
    'href',
    '/help'
  )
  await expect(
    page.getByRole('link', { name: 'support@witnesswork.app' })
  ).toHaveAttribute('href', 'mailto:support@witnesswork.app')
  await expect(page.getByRole('link', { name: 'Report Bug' })).toHaveAttribute(
    'href',
    /github\.com\/leviFrosty\/witness-work\/issues\/new\?.*labels=bug/
  )
  await expect(
    page.getByRole('link', { name: 'Feature Request' })
  ).toHaveAttribute('href', /labels=enhancement/)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `${ORIGIN}/support`
  )
})

test('a landing page opened at #support moves on to the support page', async ({
  page,
}) => {
  // The App Store's old Support URL ends in #support, which survives its 301.
  const path = () => new URL(page.url()).pathname + new URL(page.url()).hash
  await page.goto('/#support')
  await expect.poll(path).toBe(supportPath(DEFAULT_LOCALE))
  await page.goto('/de-DE#support')
  await expect.poll(path).toBe(supportPath('de-DE'))
  await page.goto('/ar#support')
  await expect.poll(path).toBe(supportPath('ar'))
  // Other pages keep the anchor.
  await page.goto('/get#support')
  await page.waitForLoadState('load')
  expect(path()).toBe('/get#support')
})

test('support page in Arabic, right to left', async ({ page }) => {
  await page.goto('/ar/support')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('main')).toContainText('support@witnesswork.app')
  await expect(page.locator('main a[href="/help/ar"]')).toBeVisible()
})

test("/get shows both stores on a computer and isn't indexed @desktop", async ({
  page,
}) => {
  await page.goto('/get')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex'
  )
  await expect(page.locator('a[href*="apps.apple.com"]')).toBeVisible()
  await expect(page.locator('a[href*="play.google.com"]')).toBeVisible()
})

test('/get forwards an Android phone to Google Play @android', async ({
  page,
}) => {
  await page.route('https://play.google.com/**', (route) =>
    route.fulfill({ body: 'Google Play' })
  )
  await page.goto('/get')
  await expect(page).toHaveURL(/^https:\/\/play\.google\.com\/store\/apps/)
})

test('/get forwards an iPhone to the App Store @ios', async ({ page }) => {
  await page.route('https://apps.apple.com/**', (route) =>
    route.fulfill({ body: 'App Store' })
  )
  await page.goto('/get')
  await expect(page).toHaveURL(/^https:\/\/apps\.apple\.com\/app\//)
})

test('an unknown path shows the 404 page', async ({ page }) => {
  const response = await page.goto('/no-such-page')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Page not found'
  )
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
    'content',
    'noindex'
  )
})

test('a Help Center article in Arabic reads right to left', async ({
  page,
}) => {
  await page.goto('/help/ar/time/time-rollover')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('main[data-help-center]')).toHaveAttribute(
    'dir',
    'rtl'
  )
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `${ORIGIN}/help/ar/time/time-rollover`
  )
})

test('the Help Center loads without breaking its Content-Security-Policy', async ({
  page,
}) => {
  const violations: string[] = []
  page.on('console', (message) => {
    if (/Content.Security.Policy|CSP/i.test(message.text()))
      violations.push(message.text())
  })
  await page.route(`${SITE.helpSearchOrigin}/**`, (route) =>
    route.fulfill({
      json: { results: [{ slug: 'time-rollover', score: 1 }] },
      headers: { 'access-control-allow-origin': '*' },
    })
  )
  await page.goto('/help')
  await page.getByRole('searchbox').fill('leftover minutes zzq')
  await expect(
    page.locator('[data-results-source="remote"] [data-result-slug]')
  ).toHaveAttribute('data-result-slug', 'time-rollover')
  expect(violations).toEqual([])
})

test('device filter defaults from the user agent @ios', async ({ page }) => {
  await page.goto('/help')
  await expect(page.locator('html')).toHaveAttribute('data-ww-platform', 'ios')
  await expect(
    page
      .locator('[data-section="categories"] [data-ww-platforms="android"]')
      .first()
  ).toBeHidden()
})
