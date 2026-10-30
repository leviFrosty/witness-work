import { expect, strings, test } from './fixtures'

/**
 * The web is not iOS (ADR 0037). Nothing a User can reach on it names a phone
 * store or an Apple-only feature, and nothing it sends to a service says it's
 * an iPhone.
 */

const en = strings('en-US')

/** What a page must never show a web User: a phone store, or Apple's settings. */
const PHONE_ONLY_TEXT =
  /App Store|Google Play|iOS Settings|Face ID|Touch ID|iCloud|iPhone/

test('sends nothing that says iOS to a service, and links to no store', async ({
  app,
  page,
  shot,
}) => {
  const sent: { url: string; method: string; body: string }[] = []
  // Recorded here, then answered by the fixture's 503 for everything outside
  // the app's own server.
  const appHost = new URL(page.url()).host
  await page.route(
    (url) => url.host !== appHost,
    (route) => {
      const request = route.request()
      sent.push({
        url: request.url(),
        method: request.method(),
        body: request.postData() ?? '',
      })
      return route.fallback()
    }
  )

  // Home, then Settings and the screens reached from it.
  await app.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(app.getByText(en.preferences, { exact: true })).toBeVisible()
  await shot('settings-platform')

  // Rows for features a browser doesn't have are hidden, not shown broken,
  // while the rest of the Support section is there.
  await expect(app.getByText(en.becomeSupporter).first()).toBeAttached()
  for (const hidden of [
    en.security,
    en.shareApp_title,
    en.rateWitnessWorkOnAppStore,
  ])
    await expect(app.getByText(hidden, { exact: true })).toHaveCount(0)

  // The Audio & Haptics screen keeps sounds and drops haptics.
  await app.getByText(en.preferences, { exact: true }).first().click()
  await app.getByText(en.audioAndHaptics, { exact: true }).first().click()
  await expect(app.getByText(en.playSounds, { exact: true })).toBeVisible()
  await expect(app.getByText(en.haptics, { exact: true })).toHaveCount(0)
  await shot('audio-and-haptics-web')

  const text = await app.locator('body').innerText()
  expect(text).not.toMatch(PHONE_ONLY_TEXT)
  expect(
    await app
      .locator('a[href*="apps.apple.com"], a[href*="play.google.com"]')
      .count()
  ).toBe(0)

  for (const { url, method, body } of sent) {
    expect(`${method} ${url} ${body}`, 'a request that says iOS').not.toMatch(
      /"platform"\s*:\s*"(ios|android)"|iPhone/
    )
  }
})

test('asks the Help Center search for web answers', async ({ app, page }) => {
  const searches: URL[] = []
  await page.route(
    (url) => url.pathname.endsWith('/v1/search'),
    (route) => {
      searches.push(new URL(route.request().url()))
      return route.fallback()
    }
  )
  await app.getByRole('button', { name: 'Settings', exact: true }).click()
  await app.getByRole('button', { name: 'Help Center', exact: true }).click()
  await app
    .getByRole('textbox', { name: en.faq_searchPlaceholder })
    .fill('backup')
  await expect.poll(() => searches.length).toBeGreaterThan(0)
  expect(searches[0]!.searchParams.get('platform')).toBe('web')
})
