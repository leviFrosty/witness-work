import { describe, expect, it, vi } from 'vitest'
import { helpBundle, helpEntry } from '@/__tests__/helpers/helpCenterFixture'

vi.mock('expo-file-system/legacy', () => ({}))
vi.mock('react-native-mmkv', () => ({ MMKV: class {} }))
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  parseHelpBundle,
  parseHelpManifest,
} from '@/features/updates/lib/helpCenter/validate'
import {
  categoriesFor,
  compareVersions,
  isEntryVisible,
  visibleEntries,
} from '@/features/updates/lib/helpCenter/visibility'
import { helpLocaleFor } from '@/features/updates/lib/helpCenter/locale'
import {
  RefreshDeps,
  refreshHelpBundle,
} from '@/features/updates/lib/helpCenter/refresh'
import {
  mergeSearchResults,
  searchHelpRemote,
} from '@/features/updates/lib/helpCenter/remoteSearch'

const manifest = (hash = 'bbbbbbbbbbbbbbbb') => ({
  schemaVersion: 1,
  generatedAt: '2026-10-22T00:00:00.000Z',
  locales: {
    'en-US': {
      hash,
      count: 5,
      path: '/witness-work/help-center/bundle/en-US.json',
    },
    'de-DE': {
      hash: 'dddddddddddddddd',
      count: 5,
      path: '/witness-work/help-center/bundle/de-DE.json',
    },
  },
})

const json = (body: unknown, init: ResponseInit & { etag?: string } = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: init.etag ? { etag: init.etag } : {},
  })

function deps(
  routes: Record<string, () => Response | Promise<Response>>,
  cachedManifest: { etag: string; body: string } | null = null
) {
  const fetch = vi.fn(
    async (url: string | URL | Request, _init?: RequestInit) => {
      const path = new URL(String(url)).pathname
      const route = routes[path]
      if (!route) throw new Error(`unexpected ${path}`)
      return route()
    }
  )
  const result = {
    fetch: fetch as unknown as typeof globalThis.fetch,
    readManifest: vi.fn(() => cachedManifest),
    writeManifest: vi.fn(),
    writeBundle: vi.fn(async () => {}),
  } satisfies RefreshDeps
  return { ...result, fetchMock: fetch }
}

const MANIFEST = '/witness-work/help-center/bundle/manifest.json'
const EN = '/witness-work/help-center/bundle/en-US.json'

describe('parseHelpBundle', () => {
  it('reads a schema-1 bundle', () => {
    const bundle = parseHelpBundle(helpBundle())
    expect(bundle?.entries.map((e) => e.id)).toEqual([
      'timeRollover',
      'widgets',
      'wearOs',
      'submitReport',
      'futureFeature',
    ])
    expect(bundle?.categories[0]).toEqual({ id: 'time', title: 'Time' })
  })

  it('rejects other schema versions and non-bundles', () => {
    expect(parseHelpBundle(helpBundle({ schemaVersion: 2 as 1 }))).toBeNull()
    expect(parseHelpBundle(null)).toBeNull()
    expect(parseHelpBundle({ schemaVersion: 1 })).toBeNull()
    expect(parseHelpBundle(helpBundle({}, []))).toBeNull()
  })

  it('drops malformed entries instead of failing the bundle', () => {
    const good = helpEntry('good', 'Q?', 'A.')
    const bundle = parseHelpBundle(
      helpBundle({}, [
        good,
        { ...good, id: '' },
        { ...good, id: 'noDoc', doc: 'nope' as never },
        { ...good, id: 'insecure', url: 'http://example.com/x' },
      ])
    )
    expect(bundle?.entries.map((e) => e.id)).toEqual(['good'])
  })

  it('derives plain text the snapshot leaves out', () => {
    const { plainText: _, ...entry } = helpEntry('a', 'Q?', 'The answer.')
    const bundle = parseHelpBundle(helpBundle({}, [entry as never]))
    expect(bundle?.entries[0].plainText).toBe('The answer.')
  })

  it('drops an entry whose version floor is unreadable', () => {
    const bundle = parseHelpBundle(
      helpBundle({}, [
        { ...helpEntry('a', 'Q?', 'A.'), minAppVersion: 'soon' } as never,
        helpEntry('b', 'Q2?', 'B.'),
      ])
    )
    expect(bundle?.entries.map((entry) => entry.id)).toEqual(['b'])
  })

  it('keeps the first of entries sharing an id or slug', () => {
    const bundle = parseHelpBundle(
      helpBundle({}, [
        helpEntry('a', 'First?', 'A.'),
        helpEntry('a', 'Again?', 'A.'),
        helpEntry('b', 'Other?', 'B.'),
      ])
    )
    expect(bundle?.entries.map((entry) => entry.question)).toEqual([
      'First?',
      'Other?',
    ])
  })

  it('keeps only known platforms', () => {
    const entry = helpEntry('a', 'Q?', 'A.', {
      platforms: ['android', 'web' as never],
    })
    expect(
      parseHelpBundle(helpBundle({}, [entry]))?.entries[0].platforms
    ).toEqual(['android'])
  })

  it('downgrades unsafe links in answers to text', () => {
    const entry = helpEntry('a', 'Q?', 'A.', {
      doc: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'tap',
                marks: [
                  { type: 'link', attrs: { href: 'javascript:alert(1)' } },
                ],
              },
            ],
          },
        ],
      },
    })
    const parsed = parseHelpBundle(helpBundle({}, [entry]))
    const block = parsed?.entries[0].doc.content[0]
    expect(block?.type === 'paragraph' && block.content?.[0]).toEqual({
      type: 'text',
      text: 'tap',
    })
  })
})

describe('parseHelpManifest', () => {
  it('reads locales and skips malformed ones', () => {
    const parsed = parseHelpManifest({
      ...manifest(),
      locales: { ...manifest().locales, broken: { hash: 1 } },
    })
    expect(Object.keys(parsed?.locales ?? {})).toEqual(['en-US', 'de-DE'])
    expect(parseHelpManifest({ schemaVersion: 2, locales: {} })).toBeNull()
  })
})

describe('visibility', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('4.10.0', '4.9.9')).toBeGreaterThan(0)
    expect(compareVersions('4.9', '4.9.0')).toBe(0)
    expect(compareVersions('3.0.0', '4.0.0')).toBeLessThan(0)
  })

  it('shows an entry from its minimum app version on', () => {
    const entry = helpEntry('a', 'Q?', 'A.', { minAppVersion: '4.12.0' })
    expect(isEntryVisible(entry, 'ios', '4.11.9')).toBe(false)
    expect(isEntryVisible(entry, 'ios', '4.12.0')).toBe(true)
    expect(isEntryVisible(entry, 'ios', '5.0.0')).toBe(true)

    expect(isEntryVisible(entry, 'ios', null)).toBe(true)
  })

  it('filters by platform and keeps the same array for the same filter', () => {
    const bundle = helpBundle()
    const ios = visibleEntries(bundle, 'ios', '4.0.0')
    expect(ios.map((e) => e.id)).toEqual([
      'timeRollover',
      'widgets',
      'submitReport',
    ])
    expect(visibleEntries(bundle, 'ios', '4.0.0')).toBe(ios)
    expect(visibleEntries(bundle, 'android', '4.0.0').map((e) => e.id)).toEqual(
      ['timeRollover', 'wearOs', 'submitReport']
    )
  })

  it('lists only categories with shown entries, in bundle order', () => {
    const bundle = helpBundle()
    const android = visibleEntries(bundle, 'android', '4.0.0')
    expect(categoriesFor(bundle, android).map((c) => c.id)).toEqual([
      'time',
      'general',
    ])
  })
})

describe('helpLocaleFor', () => {
  it('maps app languages to Help Center locales', () => {
    expect(helpLocaleFor('en-us')).toBe('en-US')
    expect(helpLocaleFor('zh-hant-tw')).toBe('zh-TW')
    expect(helpLocaleFor('zh-hans-cn')).toBe('zh-CN')
    expect(helpLocaleFor('bem-zm')).toBe('bem-ZM')
    expect(helpLocaleFor('ar')).toBe('ar')
    expect(helpLocaleFor('xx-yy')).toBe('en-US')
  })
})

describe('refreshHelpBundle', () => {
  it('downloads a bundle whose hash changed and saves it', async () => {
    const fresh = helpBundle({ hash: 'bbbbbbbbbbbbbbbb' })
    const d = deps({
      [MANIFEST]: () => json(manifest(), { etag: '"m1"' }),
      [EN]: () => json(fresh),
    })
    const result = await refreshHelpBundle('en-US', 'aaaaaaaaaaaaaaaa', d)
    expect(result.outcome).toBe('updated')
    expect(d.writeBundle).toHaveBeenCalledWith(
      expect.objectContaining({ hash: 'bbbbbbbbbbbbbbbb' })
    )
    expect(d.writeManifest).toHaveBeenCalledWith('"m1"', expect.any(String))
  })

  it('skips the download when the hash matches', async () => {
    const d = deps({ [MANIFEST]: () => json(manifest('aaaaaaaaaaaaaaaa')) })
    const result = await refreshHelpBundle('en-US', 'aaaaaaaaaaaaaaaa', d)
    expect(result).toEqual({ outcome: 'unchanged' })
    expect(d.fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses the saved manifest on a 304', async () => {
    const d = deps(
      { [MANIFEST]: () => new Response(null, { status: 304 }) },
      { etag: '"m1"', body: JSON.stringify(manifest('aaaaaaaaaaaaaaaa')) }
    )
    const result = await refreshHelpBundle('en-US', 'aaaaaaaaaaaaaaaa', d)
    expect(result).toEqual({ outcome: 'unchanged' })
    const init = d.fetchMock.mock.calls[0][1]
    expect(init?.headers).toEqual({ 'If-None-Match': '"m1"' })
    expect(d.writeManifest).not.toHaveBeenCalled()
  })

  it('falls back to English for a locale the site does not publish', async () => {
    const d = deps({
      [MANIFEST]: () => json(manifest()),
      [EN]: () => json(helpBundle({ hash: 'bbbbbbbbbbbbbbbb' })),
    })
    const result = await refreshHelpBundle('sw-KE', undefined, d)
    expect(result.outcome === 'updated' && result.bundle.locale).toBe('en-US')
  })

  it('reports offline without saving anything', async () => {
    const d = deps({
      [MANIFEST]: () => {
        throw new TypeError('Network request failed')
      },
    })
    const result = await refreshHelpBundle('en-US', 'aaaaaaaaaaaaaaaa', d)
    expect(result).toMatchObject({ outcome: 'failed', reason: 'offline' })
    expect(d.writeBundle).not.toHaveBeenCalled()
  })

  it('rejects an invalid bundle and keeps the current one', async () => {
    const d = deps({
      [MANIFEST]: () => json(manifest()),
      [EN]: () => json({ schemaVersion: 2 }),
    })
    const result = await refreshHelpBundle('en-US', 'aaaaaaaaaaaaaaaa', d)
    expect(result).toMatchObject({ outcome: 'failed', reason: 'invalid' })
    expect(d.writeBundle).not.toHaveBeenCalled()
  })

  it('reports server errors', async () => {
    const d = deps({ [MANIFEST]: () => json({}, { status: 503 }) })
    expect(
      await refreshHelpBundle('en-US', 'aaaaaaaaaaaaaaaa', d)
    ).toMatchObject({ outcome: 'failed', reason: 'http' })
  })

  it('still returns a good download it could not save', async () => {
    const d = deps({
      [MANIFEST]: () => json(manifest()),
      [EN]: () => json(helpBundle({ hash: 'bbbbbbbbbbbbbbbb' })),
    })
    d.writeBundle.mockRejectedValueOnce(new Error('disk full'))
    const result = await refreshHelpBundle('en-US', 'aaaaaaaaaaaaaaaa', d)
    expect(result).toMatchObject({ outcome: 'failed', reason: 'storage' })
    expect(result.outcome === 'failed' && result.bundle?.hash).toBe(
      'bbbbbbbbbbbbbbbb'
    )
  })
})

describe('mergeSearchResults', () => {
  const bundle = helpBundle()
  const entries = visibleEntries(bundle, 'ios', '4.0.0')
  const local = [entries[2]]

  it('shows the remote order when remote search answered', () => {
    const merged = mergeSearchResults(
      ['submit-report', 'time-rollover'],
      entries,
      local
    )
    expect(merged.source).toBe('remote')
    expect(merged.results.map((e) => e.id)).toEqual([
      'submitReport',
      'timeRollover',
    ])
  })

  it('drops slugs this device does not show, and duplicates', () => {
    const merged = mergeSearchResults(
      ['wear-os', 'nope', 'widgets', 'widgets'],
      entries,
      local
    )
    expect(merged.results.map((e) => e.id)).toEqual(['widgets'])
  })

  it('keeps local results on failure, zero results, or only unknown slugs', () => {
    expect(mergeSearchResults(null, entries, local)).toEqual({
      results: local,
      source: 'local',
    })
    expect(mergeSearchResults([], entries, local).source).toBe('local')
    expect(mergeSearchResults(['wear-os'], entries, local)).toEqual({
      results: local,
      source: 'local',
    })
  })
})

describe('searchHelpRemote', () => {
  const params = {
    query: 'carry over hours',
    locale: 'en-US',
    platform: 'ios',
    appVersion: '4.12.0',
  }

  it('sends the query and returns slugs best first', async () => {
    const fetch = vi.fn(async () =>
      json({
        results: [
          { slug: 'time-rollover', score: 0.9 },
          { slug: 'submit-report', score: 0.4 },
        ],
      })
    )
    const slugs = await searchHelpRemote(params, {
      fetch: fetch as unknown as typeof globalThis.fetch,
    })
    expect(slugs).toEqual(['time-rollover', 'submit-report'])
    const url = new URL(String((fetch.mock.calls[0] as unknown[])[0]))
    expect(url.origin + url.pathname).toBe(
      'https://help-search.leviwilkerson.com/v1/search'
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'carry over hours',
      locale: 'en-US',
      platform: 'ios',
      appVersion: '4.12.0',
      limit: '20',
    })
  })

  it('returns null on errors, bad bodies and timeouts', async () => {
    const respond = (response: () => Promise<Response>) =>
      searchHelpRemote(params, {
        fetch: vi.fn(response) as unknown as typeof globalThis.fetch,
        timeoutMs: 20,
      })
    expect(await respond(async () => json({}, { status: 503 }))).toBeNull()
    expect(await respond(async () => json({ nope: true }))).toBeNull()
    expect(
      await respond(async () => {
        throw new TypeError('Network request failed')
      })
    ).toBeNull()
    expect(
      await searchHelpRemote(params, {
        timeoutMs: 20,
        fetch: ((_: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener('abort', () =>
              reject(new Error('aborted'))
            )
          )) as unknown as typeof globalThis.fetch,
      })
    ).toBeNull()
  })
})
