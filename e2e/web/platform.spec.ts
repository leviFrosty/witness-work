import { expect, strings, test } from './fixtures'

const en = strings('en-US')

test.use({ signedIn: true })

const PHONE_ONLY_TEXT =
  /App Store|Google Play|iOS Settings|Face ID|Touch ID|iCloud|iPhone/

test('sends nothing that says iOS to a service, and links to no store', async ({
  app,
  page,
  shot,
}) => {
  const sent: { url: string; method: string; body: string }[] = []

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

  await app.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(app.getByText(en.preferences, { exact: true })).toBeVisible()
  await shot('settings-platform')

  await expect(app.getByText(en.becomeSupporter).first()).toBeAttached()
  for (const hidden of [en.shareApp_title, en.rateWitnessWorkOnAppStore])
    await expect(app.getByText(hidden, { exact: true })).toHaveCount(0)

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
