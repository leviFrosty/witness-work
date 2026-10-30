import { expect, test } from '@playwright/test'
import { HELP_LOCALES } from '../../src/lib/help-center/locales.ts'
import {
  HELP_BASE,
  helpPageUrl,
  SITE_URL,
} from '../../src/lib/help-center/paths.ts'
import { SITE } from '../../src/lib/site.ts'
import type { HelpBundle } from '../../src/lib/help-center/types.ts'

test('sitemap submits every translated article and excludes English fallback copies @api', async ({
  page,
  request,
}) => {
  const response = await request.get('/sitemap.xml')
  expect(response.status()).toBe(200)
  const sitemap = await response.text()
  const entries = await page.evaluate((xml) => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    if (doc.querySelector('parsererror')) throw new Error('Invalid sitemap XML')
    return [...doc.getElementsByTagName('url')].map((entry) => ({
      loc: entry.getElementsByTagName('loc')[0]!.textContent!,
      alternates: [
        ...entry.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'link'),
      ].map((link) => ({
        hreflang: link.getAttribute('hreflang'),
        href: link.getAttribute('href'),
      })),
    }))
  }, sitemap)
  const bundles = await Promise.all(
    HELP_LOCALES.map(async (locale) => {
      const response = await request.get(`${HELP_BASE}/bundle/${locale}.json`)
      expect(response.status()).toBe(200)
      const bundle: HelpBundle = await response.json()
      expect(bundle.locale).toBe(locale)
      return { locale, bundle }
    })
  )
  const expected = bundles.flatMap(({ locale, bundle }) => [
    new URL(helpPageUrl(locale), SITE_URL).href,
    ...bundle.categories.map(
      (category) => new URL(helpPageUrl(locale, category.id), SITE_URL).href
    ),
    ...bundle.entries
      .filter((entry) => !entry.fallback)
      .map((entry) => entry.url),
  ])
  const helpEntries = entries.filter((entry) =>
    entry.loc.startsWith(`${SITE_URL}${HELP_BASE}`)
  )
  expect(helpEntries.map((entry) => entry.loc).sort()).toEqual(expected.sort())
  const byUrl = new Map(helpEntries.map((entry) => [entry.loc, entry]))
  // Every language cluster must contain itself and link back reciprocally.
  const invalidAlternates = helpEntries.filter((entry) => {
    const own = entry.alternates.some((link) => link.href === entry.loc)
    const english = entry.alternates.find((link) => link.hreflang === 'en-US')
    const defaultLink = entry.alternates.find(
      (link) => link.hreflang === 'x-default'
    )
    return (
      !own ||
      !english ||
      defaultLink?.href !== english.href ||
      entry.alternates.some((link) => {
        const target = byUrl.get(link.href!)
        return (
          !target ||
          JSON.stringify(target.alternates) !== JSON.stringify(entry.alternates)
        )
      })
    )
  })
  expect(invalidAlternates).toEqual([])
  expect(entries.map((entry) => entry.loc)).toEqual(
    expect.arrayContaining([
      `${SITE_URL}/`,
      `${SITE_URL}/de-DE`,
      `${SITE_URL}/support`,
      `${SITE_URL}/privacy`,
    ])
  )
})

test('article content and canonical metadata are available without JavaScript', async ({
  browser,
  request,
  baseURL,
}) => {
  const bundle: HelpBundle = await (
    await request.get(`${HELP_BASE}/bundle/de-DE.json`)
  ).json()
  const english: HelpBundle = await (
    await request.get(`${HELP_BASE}/bundle/en-US.json`)
  ).json()
  const translated = bundle.entries.find((entry) => !entry.fallback)!
  const fallback = bundle.entries.find((entry) => entry.fallback)
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
  })
  try {
    const page = await context.newPage()
    for (const entry of [
      english.entries[0]!,
      translated,
      ...(fallback ? [fallback] : []),
    ]) {
      const response = await page.goto(new URL(entry.url).pathname)
      expect(response?.status()).toBe(200)
      if (SITE.indexable)
        expect(response?.headers()['x-robots-tag'] ?? '').not.toMatch(
          /noindex/i
        )
      await expect(page.locator('h1')).toHaveText(entry.question)
      await expect(page.locator('article')).toContainText(
        entry.plainText.slice(0, 40)
      )
      const canonical = entry.fallback
        ? new URL(helpPageUrl('en-US', entry.category, entry.slug), SITE_URL)
            .href
        : entry.url
      await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1)
      await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
        'href',
        canonical
      )
      await expect(
        page.locator('meta[name="robots"][content*="noindex"]')
      ).toHaveCount(SITE.indexable ? 0 : 1)
    }
  } finally {
    await context.close()
  }
})
