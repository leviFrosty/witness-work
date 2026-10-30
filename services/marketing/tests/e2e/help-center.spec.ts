import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { SITE } from '../../src/lib/site.ts'

const CATEGORY_COUNT: number = JSON.parse(
  readFileSync('content/help/order.json', 'utf8')
).categories.length

const HOME = '/help'
const ORIGIN = SITE.origin
const SEARCH_WORKER = `${SITE.helpSearchOrigin}/**`

async function choosePlatform(page: Page, platform: 'all' | 'ios' | 'android') {
  await page.locator(`[data-platform-option="${platform}"]`).click()
  await expect(page.locator('html')).toHaveAttribute(
    'data-ww-platform',
    platform
  )
}

test('home shows top questions and every category', async ({ page }) => {
  await page.goto(HOME)
  await expect(page).toHaveTitle('WitnessWork Help Center')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Help Center'
  )
  const pinned = page.locator('[data-section="pinned"] [data-question]')
  await expect(pinned.first()).toBeVisible()
  expect(await pinned.count()).toBeGreaterThan(3)
  await expect(
    page.locator('[data-section="categories"] [data-category]')
  ).toHaveCount(CATEGORY_COUNT)
  await expect(page.locator('#still-need-help')).toContainText(
    'support@witnesswork.app'
  )
})

test('question page renders the answer with SEO metadata', async ({ page }) => {
  await page.goto(`${HOME}/time/time-rollover`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Does my time automatically roll over to the next month?'
  )
  await expect(page.locator('article')).toContainText('Automatic time rollover')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `${ORIGIN}/help/time/time-rollover`
  )
  const alternates = page.locator('link[rel="alternate"][hreflang]')
  expect(await alternates.count()).toBeGreaterThan(10)
  await expect(
    page.locator('link[rel="alternate"][hreflang="x-default"]')
  ).toHaveAttribute('href', `${ORIGIN}/help/time/time-rollover`)
  await expect(
    page.locator('link[rel="alternate"][hreflang="pt-BR"]')
  ).toHaveAttribute('href', `${ORIGIN}/help/pt-BR/time/time-rollover`)
  const jsonLd = JSON.parse(
    (await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent()) ?? '{}'
  )
  expect(jsonLd['@type']).toBe('FAQPage')
  expect(jsonLd.mainEntity[0].name).toBe(
    'Does my time automatically roll over to the next month?'
  )
  expect(jsonLd.mainEntity[0].acceptedAnswer.text).toContain('Partial hours')
})

test('an untranslated answer shows English and points search engines at it', async ({
  page,
  request,
}) => {
  const bundle = await (await request.get(`${HOME}/bundle/de-DE.json`)).json()
  const fallback = bundle.entries.find(
    (entry: { fallback?: true }) => entry.fallback
  )
  test.skip(!fallback, 'every German answer is translated')
  await page.goto(new URL(fallback.url).pathname)
  await expect(page.locator('[data-fallback-notice]')).toBeVisible()
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `${ORIGIN}/help/${fallback.category}/${fallback.slug}`
  )
})

test('language switcher opens the same page in Arabic, right to left @desktop', async ({
  page,
}) => {
  await page.goto(`${HOME}/time/time-rollover`)
  await page.locator('[data-language-switcher] summary').click()
  await page.locator('[data-language-switcher] a[data-locale="ar"]').click()
  await expect(page).toHaveURL(/\/help\/ar\/time\/time-rollover$/)
  const main = page.locator('main[data-help-center]')
  await expect(main).toHaveAttribute('dir', 'rtl')
  await expect(main).toHaveAttribute('lang', 'ar')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'الشهر التالي'
  )
})

test("each page sets the document's language and direction", async ({
  page,
}) => {
  await page.goto(`${HOME}/ar/time/time-rollover`)
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.goto(`${HOME}/ja-JP`)
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja-JP')
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
  await expect(page.locator('html')).not.toHaveAttribute('dir', 'rtl')
  await expect(page).toHaveTitle(/WitnessWork/)
  await page.goto('/ar')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
})

test('device filter hides other-platform answers and is remembered', async ({
  page,
}) => {
  await page.goto(HOME)
  await choosePlatform(page, 'all')
  const android = page
    .locator('[data-section="categories"] [data-ww-platforms="android"]')
    .first()
  const ios = page
    .locator('[data-section="categories"] [data-ww-platforms="ios"]')
    .first()
  await expect(android).toBeVisible()
  await expect(ios).toBeVisible()

  await choosePlatform(page, 'ios')
  await expect(android).toBeHidden()
  await expect(ios).toBeVisible()

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-ww-platform', 'ios')
  await expect(page.locator('[data-platform-option="ios"]')).toHaveAttribute(
    'aria-checked',
    'true'
  )
  await expect(android).toBeHidden()

  await choosePlatform(page, 'android')
  await expect(ios).toBeHidden()
  await expect(android).toBeVisible()
})

test('device filter defaults from the user agent @android', async ({
  page,
}) => {
  // The mobile project emulates a Pixel (Android).
  await page.goto(HOME)
  await expect(page.locator('html')).toHaveAttribute(
    'data-ww-platform',
    'android'
  )
  await expect(
    page
      .locator('[data-section="categories"] [data-ww-platforms="ios"]')
      .first()
  ).toBeHidden()
})

test('search falls back to local results when the search Worker is down', async ({
  page,
}) => {
  await page.route(SEARCH_WORKER, (route) => route.abort())
  await page.goto(HOME)
  await page.getByRole('searchbox').fill('rollover')
  const results = page.locator('[data-results-source]')
  await expect(results).toHaveAttribute('data-results-source', 'local')
  await expect(results.locator('[data-result-slug]').first()).toHaveAttribute(
    'data-result-slug',
    'time-rollover'
  )
  await results.locator('[data-result-slug="time-rollover"]').click()
  await expect(page).toHaveURL(/\/time\/time-rollover$/)
})

test("search uses the Worker's semantic results when it answers", async ({
  page,
}) => {
  let requested: URL | undefined
  await page.route(SEARCH_WORKER, (route) => {
    requested = new URL(route.request().url())
    return route.fulfill({
      json: {
        results: [
          { slug: 'icloud-sync', score: 0.9 },
          { slug: 'not-a-question', score: 0.5 },
        ],
      },
      headers: { 'access-control-allow-origin': '*' },
    })
  })
  await page.goto(HOME)
  await choosePlatform(page, 'all')
  await page.getByRole('searchbox').fill('move my data to my new iPhone')
  const results = page.locator('[data-results-source="remote"]')
  await expect(results).toBeVisible()
  await expect(results.locator('[data-result-slug]')).toHaveCount(1)
  await expect(results.locator('[data-result-slug]')).toHaveAttribute(
    'data-result-slug',
    'icloud-sync'
  )
  expect(requested?.pathname).toBe('/v1/search')
  expect(requested?.searchParams.get('locale')).toBe('en-US')
  expect(requested?.searchParams.has('platform')).toBe(false)
})

test('a slow Worker shows Searching… instead of no results, then its answer', async ({
  page,
}) => {
  let release!: () => void
  const answered = new Promise<void>((resolve) => (release = resolve))
  await page.route(SEARCH_WORKER, async (route) => {
    await answered
    await route.fulfill({
      json: { results: [{ slug: 'time-rollover', score: 1 }] },
      headers: { 'access-control-allow-origin': '*' },
    })
  })
  await page.goto(HOME)
  // Matches nothing locally; only the semantic search finds it.
  await page.getByRole('searchbox').fill('leftover minutes zzq')
  const state = page.locator('[data-search-state]')
  await expect(state).toHaveAttribute('data-search-state', 'searching')
  await expect(state).toHaveText('Searching…')
  await expect(page.locator('[data-search-pending]')).toBeVisible()
  release()
  const results = page.locator('[data-results-source="remote"]')
  await expect(results.locator('[data-result-slug]')).toHaveAttribute(
    'data-result-slug',
    'time-rollover'
  )
  await expect(page.locator('[data-search-pending]')).toHaveCount(0)
})

test('no results shows once the Worker fails', async ({ page }) => {
  await page.route(SEARCH_WORKER, (route) => route.abort())
  await page.goto(HOME)
  await page.getByRole('searchbox').fill('leftover minutes zzq')
  const state = page.locator('[data-search-state]')
  await expect(state).toHaveAttribute('data-search-state', 'empty')
  await expect(state).toHaveText('No questions match your search.')
  await expect(page.locator('[data-search-pending]')).toHaveCount(0)
})

test("search searches the page's language", async ({ page }) => {
  await page.route(SEARCH_WORKER, (route) => route.abort())
  await page.goto(`${HOME}/ar`)
  await page.getByRole('searchbox').fill('ترحيل')
  await expect(
    page.locator(
      '[data-results-source="local"] [data-result-slug="time-rollover"]'
    )
  ).toBeVisible()
})

test('landing page features top questions and links to the Help Center', async ({
  page,
}) => {
  await page.goto('/')
  await expect(
    page.getByRole('link', { name: 'Visit the Help Center' })
  ).toHaveAttribute('href', HOME)
  const question = page.locator('summary', {
    hasText: 'Is WitnessWork still free?',
  })
  await question.scrollIntoViewIfNeeded()
  await question.click()
  await expect(
    page.getByRole('link', { name: 'Read the full answer' }).first()
  ).toHaveAttribute('href', `${ORIGIN}/help/supporter/still-free`)
})
