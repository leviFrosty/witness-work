import { describe, expect, it } from 'vitest'
import type { Platform } from '../src/contract'
import { EMBEDDING_MODEL, normalize } from '../src/embed'
import {
  cacheKeyUrl,
  parseSearchParams,
  rank,
  type SearchParams,
} from '../src/search'
import { loadIndex, storedEntry } from '../src/searchIndex'
import { entry } from './fixtures/bundle'

const parse = (query: string) =>
  parseSearchParams(new URL(`https://help-search.example/v1/search?${query}`))

describe('parseSearchParams', () => {
  it('applies defaults', () => {
    expect(parse('q=rollover')).toEqual({
      ok: true,
      params: {
        q: 'rollover',
        locale: 'en-US',
        platform: undefined,
        appVersion: undefined,
        limit: 20,
      },
    })
  })
  it('reads every param', () => {
    expect(
      parse(
        'q=%20carry%20%20over%20&locale=ja-JP&platform=android&appVersion=4.12.1&limit=5'
      )
    ).toEqual({
      ok: true,
      params: {
        q: 'carry over',
        locale: 'ja-JP',
        platform: 'android',
        appVersion: 4_012_001,
        limit: 5,
      },
    })
  })
  it('accepts every platform', () => {
    for (const platform of ['ios', 'android', 'web']) {
      expect(parse(`q=a&platform=${platform}`)).toMatchObject({
        ok: true,
        params: { platform },
      })
    }
  })
  it.each([
    ['', 'q is required'],
    ['q=%20%20', 'q is required'],
    [`q=${'a'.repeat(201)}`, 'q must be at most 200 characters'],
    ['q=a&locale=xx', 'unknown locale'],
    ['q=a&platform=desktop', 'platform must be ios, android or web'],
    ['q=a&appVersion=latest', 'appVersion must look like x.y.z'],
    ['q=a&limit=0', 'limit must be 1–50'],
    ['q=a&limit=51', 'limit must be 1–50'],
    ['q=a&limit=2.5', 'limit must be 1–50'],
  ])('rejects %s', (query, error) => {
    expect(parse(query)).toEqual({ ok: false, error })
  })
})

/**
 * An index whose answers have the given vectors. Answer vectors are unit length
 * and the query is [1, 0, 0], so an answer's vector score is its first
 * component.
 */
function index(
  answers: {
    slug: string
    score?: number
    text?: string
    platforms?: Platform[]
    minAppVersion?: string
  }[],
  model = EMBEDDING_MODEL
) {
  return loadIndex({
    version: 1,
    model,
    bundleHash: 'aaaa',
    builtAt: '',
    entries: answers.map(
      ({ slug, score = 0, text, platforms, minAppVersion }) =>
        storedEntry(
          entry({
            slug,
            question: text ?? 'unrelated words',
            plainText: '',
            platforms: platforms ?? ['ios', 'android', 'web'],
            minAppVersion,
          }),
          slug,
          normalize([score, Math.sqrt(1 - score * score), 0])
        )
    ),
  })
}
const query = normalize([1, 0, 0])
const params = (overrides: Partial<SearchParams> = {}): SearchParams => ({
  q: 'nothing matches',
  locale: 'en-US',
  limit: 20,
  ...overrides,
})
const slugs = (results: { slug: string }[]) => results.map((r) => r.slug)

describe('rank', () => {
  it('returns answers above the vector floor, best first, top score 1', () => {
    const results = rank(
      index([
        { slug: 'weak', score: 0.3 },
        { slug: 'good', score: 0.5 },
        { slug: 'best', score: 0.7 },
      ]),
      params(),
      query
    )
    expect(results).toEqual([
      { slug: 'best', score: 1 },
      { slug: 'good', score: 0.9839 },
    ])
  })

  it('returns nothing for an unrelated query', () => {
    const results = rank(
      index([
        { slug: 'a', score: 0.3 },
        { slug: 'b', score: 0.28 },
        { slug: 'c', score: 0.25 },
      ]),
      params(),
      query
    )
    expect(results).toEqual([])
  })

  it('counts a best match below the floor when it clearly leads', () => {
    const leader = index([
      { slug: 'leader', score: 0.33 },
      { slug: 'rest', score: 0.21 },
    ])
    expect(slugs(rank(leader, params(), query))).toEqual(['leader'])
    const tooWeak = index([
      { slug: 'leader', score: 0.24 },
      { slug: 'rest', score: 0.1 },
    ])
    expect(rank(tooWeak, params(), query)).toEqual([])
  })

  it('matches keywords only when every token is present', () => {
    const answers = index([
      { slug: 'both', text: 'partial hours carry over' },
      { slug: 'one', text: 'partial goals' },
      ...Array.from({ length: 8 }, (_, i) => ({ slug: `other-${i}` })),
    ])
    expect(slugs(rank(answers, params({ q: 'Partial hours' }), null))).toEqual([
      'both',
    ])
  })

  it('ignores keyword matches on common words', () => {
    const answers = index(
      Array.from({ length: 10 }, (_, i) => ({
        slug: `a-${i}`,
        text: 'how are things',
      }))
    )
    expect(rank(answers, params({ q: 'how are' }), null)).toEqual([])
  })

  it('ranks an answer matching both ways first', () => {
    const answers = index([
      { slug: 'vector-only', score: 0.6 },
      { slug: 'both', score: 0.5, text: 'rollover' },
      ...Array.from({ length: 8 }, (_, i) => ({ slug: `other-${i}` })),
    ])
    expect(slugs(rank(answers, params({ q: 'rollover' }), query))).toEqual([
      'both',
      'vector-only',
    ])
  })

  it('filters by platform and app version', () => {
    const answers = index([
      { slug: 'ios', score: 0.9, platforms: ['ios'] },
      { slug: 'new', score: 0.8, minAppVersion: '4.12.0' },
      { slug: 'all', score: 0.7 },
    ])
    expect(
      slugs(rank(answers, params({ platform: 'android' }), query))
    ).toEqual(['new', 'all'])
    expect(
      slugs(rank(answers, params({ appVersion: 4_011_000 }), query))
    ).toEqual(['ios', 'all'])
    expect(
      slugs(rank(answers, params({ appVersion: 4_012_000 }), query))
    ).toEqual(['ios', 'new', 'all'])
  })

  it('filters by the web platform', () => {
    const answers = index([
      { slug: 'ios', score: 0.9, platforms: ['ios'] },
      { slug: 'web-only', score: 0.8, platforms: ['web'] },
      { slug: 'phones', score: 0.75, platforms: ['ios', 'android'] },
      { slug: 'all', score: 0.7 },
    ])
    expect(slugs(rank(answers, params({ platform: 'web' }), query))).toEqual([
      'web-only',
      'all',
    ])
    expect(slugs(rank(answers, params({ platform: 'ios' }), query))).toEqual([
      'ios',
      'phones',
      'all',
    ])
  })

  it('reads an index built before web existed as web for both-phone answers', () => {
    const stored = (slug: string, platforms: Platform[]) => {
      const { web: _web, ...old } = storedEntry(
        entry({ slug, platforms }),
        slug,
        normalize([0.9, Math.sqrt(1 - 0.81), 0])
      )
      return old
    }
    const answers = loadIndex({
      version: 1,
      model: EMBEDDING_MODEL,
      bundleHash: 'old',
      builtAt: '',
      entries: [
        stored('both-phones', ['ios', 'android']),
        stored('ios-only', ['ios']),
        stored('android-only', ['android']),
      ],
    })
    expect(slugs(rank(answers, params({ platform: 'web' }), query))).toEqual([
      'both-phones',
    ])
    expect(slugs(rank(answers, params({ platform: 'ios' }), query))).toEqual([
      'both-phones',
      'ios-only',
    ])
  })

  it('stops at the limit', () => {
    const answers = index(
      Array.from({ length: 5 }, (_, i) => ({
        slug: `a-${i}`,
        score: 0.9 - i / 20,
      }))
    )
    expect(slugs(rank(answers, params({ limit: 2 }), query))).toEqual([
      'a-0',
      'a-1',
    ])
  })

  it('uses keywords alone for an index from another model', () => {
    const answers = index(
      [
        { slug: 'vector', score: 0.9 },
        { slug: 'keyword', text: 'rollover' },
        ...Array.from({ length: 8 }, (_, i) => ({ slug: `other-${i}` })),
      ],
      '@cf/other/model'
    )
    expect(slugs(rank(answers, params({ q: 'rollover' }), query))).toEqual([
      'keyword',
    ])
  })
})

describe('cacheKeyUrl', () => {
  it('normalizes case and param order', () => {
    const a = parse('limit=5&q=Rollover&locale=es-ES')
    const b = parse('q=rollover&locale=es-ES&limit=5')
    if (!a.ok || !b.ok) throw new Error('parse failed')
    expect(cacheKeyUrl('https://x.test', a.params)).toBe(
      cacheKeyUrl('https://x.test', b.params)
    )
  })
})
