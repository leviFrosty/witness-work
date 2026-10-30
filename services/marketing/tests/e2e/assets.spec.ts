import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { HELP_LOCALES } from '../../src/lib/help-center/locales.ts'
import { SITE } from '../../src/lib/site.ts'

// Category order is content, not code: read it from the source of truth.
const CATEGORY_ORDER: string[] = JSON.parse(
  readFileSync('content/help/order.json', 'utf8')
).categories

const BUNDLE = '/help/bundle'
const ORIGIN = SITE.origin

// Tagged @api: requests only, so one browser project runs them
// (playwright.config.ts).
const LOCALES: string[] = [...HELP_LOCALES]
const BLOCKS = new Set(['paragraph', 'heading', 'bulletList', 'orderedList'])
const MARKS = new Set(['bold', 'italic', 'strike', 'link'])

type Node = {
  type: string
  content?: Node[]
  marks?: { type: string; attrs?: { href: string } }[]
  text?: string
}

function checkBlocks(blocks: Node[]) {
  for (const block of blocks) {
    expect(
      BLOCKS.has(block.type) || block.type === 'listItem',
      block.type
    ).toBe(true)
    if (block.type === 'paragraph' || block.type === 'heading') {
      for (const inline of block.content ?? []) {
        expect(['text', 'hardBreak']).toContain(inline.type)
        for (const mark of inline.marks ?? []) {
          expect(MARKS.has(mark.type)).toBe(true)
          if (mark.type === 'link')
            expect(mark.attrs!.href).toMatch(/^(https:|mailto:)/)
        }
      }
    } else {
      checkBlocks(block.content ?? [])
    }
  }
}

test('bundles follow the contract and every locale has every entry @api', async ({
  request,
}) => {
  // Checks every entry of all 19 bundles.
  test.setTimeout(120_000)
  const response = await request.get(`${BUNDLE}/manifest.json`)
  expect(response.headers()['access-control-allow-origin']).toBe('*')
  expect(response.headers()['cache-control']).toBe(
    'public, max-age=0, must-revalidate'
  )
  expect(response.headers()['etag']).toBeTruthy()
  expect(response.headers()['content-type']).toMatch(/^application\/json/)
  expect(response.headers()['set-cookie']).toBeUndefined()
  const manifest = await response.json()
  expect(manifest.schemaVersion).toBe(1)
  expect(Object.keys(manifest.locales).sort()).toEqual([...LOCALES].sort())

  let englishIds: string[] = []
  for (const locale of LOCALES) {
    const info = manifest.locales[locale]
    // Absolute, so apps that fetched the manifest from the old site's
    // redirect still find the bundles here.
    expect(info.path).toBe(`${ORIGIN}${BUNDLE}/${locale}.json`)
    const response = await request.get(new URL(info.path).pathname)
    expect(response.ok()).toBe(true)
    expect(response.headers()['access-control-allow-origin']).toBe('*')
    const bundle = await response.json()
    expect(bundle).toMatchObject({ schemaVersion: 1, locale, hash: info.hash })
    expect(bundle.hash).toMatch(/^[0-9a-f]{16}$/)
    expect(bundle.entries).toHaveLength(info.count)
    expect(bundle.categories.map((c: { id: string }) => c.id)).toEqual(
      CATEGORY_ORDER
    )
    const ids = bundle.entries.map((e: { id: string }) => e.id)
    if (locale === 'en-US') englishIds = ids
    else expect(ids).toEqual(englishIds)

    for (const entry of bundle.entries) {
      expect(entry.id).toMatch(/^[a-z][a-zA-Z0-9]*$/)
      expect(entry.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(entry.platforms.length).toBeGreaterThan(0)
      // Always explicit, in this order: apps that predate `web` keep only
      // ios and android of it (docs/help-center.md).
      expect(
        ['ios', 'android', 'web'].filter((p) => entry.platforms.includes(p))
      ).toEqual(entry.platforms)
      expect(typeof entry.pinned).toBe('boolean')
      expect(Array.isArray(entry.related)).toBe(true)
      expect(entry.question.length).toBeGreaterThan(0)
      expect(entry.plainText.length).toBeGreaterThan(0)
      expect(entry.doc.type).toBe('doc')
      checkBlocks(entry.doc.content)
      const prefix = locale === 'en-US' ? '' : `/${locale}`
      expect(entry.url).toBe(
        `${ORIGIN}/help${prefix}/${entry.category}/${entry.slug}`
      )
      if (locale === 'en-US') expect(entry.fallback).toBeUndefined()
      if (entry.minAppVersion !== undefined)
        expect(entry.minAppVersion).toMatch(/^\d+\.\d+\.\d+$/)
    }
  }
})

test('llms.txt files and Markdown alternates are published @api', async ({
  request,
}) => {
  const indexResponse = await request.get('/llms.txt')
  expect(indexResponse.headers()['content-type']).toBe(
    'text/plain; charset=utf-8'
  )
  const index = await indexResponse.text()
  expect(index).toMatch(/^# WitnessWork/)
  expect(index).toContain(`${ORIGIN}/help/time/time-rollover.md`)
  expect(index).toContain('support@witnesswork.app')
  expect(index).not.toContain('leviwilkerson.com/')

  const fullResponse = await request.get('/llms-full.txt')
  expect(fullResponse.headers()['content-type']).toBe(
    'text/plain; charset=utf-8'
  )
  expect(await fullResponse.text()).toContain(
    '## Does my time automatically roll over to the next month?'
  )

  const markdown = await request.get('/help/time/time-rollover.md')
  expect(markdown.ok()).toBe(true)
  expect(markdown.headers()['content-type']).toBe(
    'text/markdown; charset=utf-8'
  )
  expect(await markdown.text()).toMatch(
    /^# Does my time automatically roll over/
  )
  const arabic = await request.get('/help/ar/time/time-rollover.md')
  expect(arabic.ok()).toBe(true)
})

test('robots.txt and the security headers match the build @api', async ({
  request,
}) => {
  const robots = await (await request.get('/robots.txt')).text()
  const page = await request.get('/')
  const headers = page.headers()
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['strict-transport-security']).toMatch(/^max-age=\d+/)
  expect(headers['content-security-policy']).toContain("script-src 'self';")
  expect(headers['content-security-policy']).toContain(
    `connect-src 'self' ${SITE.helpSearchOrigin};`
  )
  expect(headers['set-cookie']).toBeUndefined()
  if (SITE.indexable) {
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`)
    expect(robots).not.toContain('Disallow: /')
    expect(headers['x-robots-tag']).toBeUndefined()
  } else {
    expect(robots).toContain('Disallow: /')
    expect(headers['x-robots-tag']).toBe('noindex')
  }
})

test("sitemap lists the site's pages @api", async ({ request }) => {
  const sitemap = await (await request.get('/sitemap.xml')).text()
  for (const page of [
    '/',
    '/de-DE',
    '/support',
    '/ar/support',
    '/privacy',
    '/terms',
    '/help',
  ])
    expect(sitemap).toContain(`<loc>${ORIGIN}${page}</loc>`)
  expect(sitemap).toContain(`${ORIGIN}/help/pt-BR/time/time-rollover`)
  expect(sitemap).not.toContain(`<loc>${ORIGIN}/get</loc>`)
})

// ww-api serves these on the same host (docs/adr/0042-witnesswork-app-domain.md §3).
for (const path of [
  '/contacts',
  '/buddies/invite',
  '/accounts/handoff',
  '/.well-known/apple-app-site-association',
  '/.well-known/assetlinks.json',
]) {
  test(`${path} is not a site page @api`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status()).toBe(404)
  })
}
