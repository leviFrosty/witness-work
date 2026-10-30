import path from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'

const FIXTURE = path.join(import.meta.dirname, 'fixtures/help')

async function siteFiles(env?: string) {
  vi.resetModules()
  if (env) vi.stubEnv('WW_SITE_ENV', env)
  const files = await import('../../src/lib/site-files.ts')
  const { loadHelpCenter } = await import('../../src/lib/help-center/load.ts')
  return { ...files, center: await loadHelpCenter(FIXTURE) }
}

/** The `_headers` rules for one path pattern. */
function rule(headers: string, pattern: string) {
  const blocks = headers.split(/\n(?=\/)/)
  const block = blocks.find((b) => b.split('\n')[0] === pattern)
  return (
    block
      ?.split('\n')
      .slice(1)
      .map((line) => line.trim()) ?? []
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('robots.txt', () => {
  test('production is crawlable and lists the sitemap', async () => {
    const { robotsTxt } = await siteFiles()
    expect(robotsTxt()).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://witnesswork.app/sitemap.xml\n'
    )
  })

  test('staging disallows everything', async () => {
    const { robotsTxt } = await siteFiles('dev')
    expect(robotsTxt()).toBe('User-agent: *\nDisallow: /\n')
  })
})

describe('_headers', () => {
  test('every response is hardened, with search allowed only to the Worker', async () => {
    const { headersFile } = await siteFiles()
    const all = rule(headersFile(), '/*')
    expect(all).toContain('X-Content-Type-Options: nosniff')
    expect(all).toContain('Referrer-Policy: strict-origin-when-cross-origin')
    expect(all.some((h) => h.startsWith('Strict-Transport-Security:'))).toBe(
      true
    )
    const csp = all.find((h) => h.startsWith('Content-Security-Policy:'))!
    expect(csp).toContain("script-src 'self';")
    expect(csp).toContain(
      "connect-src 'self' https://help-search.witnesswork.app;"
    )
    expect(all.some((h) => h.startsWith('X-Robots-Tag'))).toBe(false)
    expect(headersFile()).not.toMatch(/Set-Cookie/i)
  })

  test('staging is noindex on every response', async () => {
    const { headersFile } = await siteFiles('dev')
    const all = rule(headersFile(), '/*')
    expect(all).toContain('X-Robots-Tag: noindex')
    expect(all.find((h) => h.startsWith('Content-Security-Policy:'))).toContain(
      "connect-src 'self' https://help-search-dev.witnesswork.app;"
    )
  })

  test('bundles are readable from anywhere and always revalidated', async () => {
    const { headersFile } = await siteFiles()
    expect(rule(headersFile(), '/help/bundle/*')).toEqual([
      'Access-Control-Allow-Origin: *',
      'Cache-Control: public, max-age=0, must-revalidate',
    ])
  })
})

describe('sitemap.xml', () => {
  test('lists canonical pages with their translations', async () => {
    const { sitemapXml, center } = await siteFiles()
    const xml = sitemapXml(center)
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    expect(locs).toContain('https://witnesswork.app/')
    expect(locs).toContain('https://witnesswork.app/de-DE')
    expect(locs).toContain('https://witnesswork.app/support')
    expect(locs).toContain('https://witnesswork.app/ar/support')
    expect(locs).toContain('https://witnesswork.app/privacy')
    expect(locs).toContain('https://witnesswork.app/terms')
    expect(locs).toContain('https://witnesswork.app/help')
    expect(locs).toContain('https://witnesswork.app/help/de-DE/time')
    expect(locs).toContain(
      'https://witnesswork.app/help/de-DE/time/time-rollover'
    )
    // Untranslated answers are English copies; only the English one is listed.
    expect(locs).toContain(
      'https://witnesswork.app/help/general/contact-support'
    )
    expect(locs).not.toContain(
      'https://witnesswork.app/help/de-DE/general/contact-support'
    )
    expect(locs).not.toContain('https://witnesswork.app/get')
    expect(new Set(locs).size).toBe(locs.length)
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://witnesswork.app/help/time/time-rollover"/>'
    )
  })
})
