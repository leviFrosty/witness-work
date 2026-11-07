import { isLocale, isPlatform, type Locale, type Platform } from './contract'
import { EMBEDDING_MODEL } from './embed'
import type { LoadedEntry, LoadedIndex } from './searchIndex'
import { tokenize } from './text'
import { encodeVersion } from './version'

export type SearchParams = {
  q: string
  locale: Locale
  platform?: Platform
  appVersion?: number
  limit: number
}

export type SearchResult = { slug: string; score: number }

const MAX_QUERY = 200
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

type Parsed = { ok: true; params: SearchParams } | { ok: false; error: string }

export function parseSearchParams(url: URL): Parsed {
  const get = (name: string) => url.searchParams.get(name)

  const q = (get('q') ?? '').trim().replace(/\s+/g, ' ')
  if (!q) return { ok: false, error: 'q is required' }
  if (q.length > MAX_QUERY)
    return { ok: false, error: `q must be at most ${MAX_QUERY} characters` }

  const locale = get('locale') || 'en-US'
  if (!isLocale(locale)) return { ok: false, error: 'unknown locale' }

  const platform = get('platform') || undefined
  if (platform !== undefined && !isPlatform(platform))
    return { ok: false, error: 'platform must be ios, android or web' }

  let appVersion: number | undefined
  const rawVersion = get('appVersion')
  if (rawVersion) {
    const encoded = encodeVersion(rawVersion)
    if (encoded === null)
      return { ok: false, error: 'appVersion must look like x.y.z' }
    appVersion = encoded
  }

  let limit = DEFAULT_LIMIT
  const rawLimit = get('limit')
  if (rawLimit) {
    limit = Number(rawLimit)
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
      return { ok: false, error: `limit must be 1–${MAX_LIMIT}` }
  }

  return { ok: true, params: { q, locale, platform, appVersion, limit } }
}

export function cacheKeyUrl(origin: string, params: SearchParams): string {
  const key = new URL('/v1/search', origin)
  key.searchParams.set('q', params.q.toLowerCase())
  key.searchParams.set('locale', params.locale)
  if (params.platform) key.searchParams.set('platform', params.platform)
  if (params.appVersion !== undefined)
    key.searchParams.set('appVersion', String(params.appVersion))
  key.searchParams.set('limit', String(params.limit))
  return key.toString()
}

export const MIN_VECTOR_SCORE = 0.4
export const MIN_LEADER_SCORE = 0.25
export const MIN_LEAD = 0.08
export const MIN_KEYWORD_SCORE = 2

const RRF_K = 60
const BM25_K1 = 1.2
const BM25_B = 0.75

export type Scored = {
  slug: string

  score: number
  vectorScore?: number
  keywordScore?: number
}

const eligible = (entry: LoadedEntry, params: SearchParams) =>
  (!params.platform || entry[params.platform]) &&
  (params.appVersion === undefined || entry.minAppVersion <= params.appVersion)

function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}

function keywordScore(
  index: LoadedIndex,
  entry: LoadedEntry,
  tokens: string[]
): number | undefined {
  if (!tokens.length) return undefined
  const count = index.entries.length
  let score = 0
  for (const token of tokens) {
    const frequency = entry.terms[token]
    if (!frequency) return undefined
    const documents = index.documentFrequency.get(token) ?? 0

    const idf = Math.max(
      Math.log((count - documents + 0.5) / (documents + 0.5)),
      1e-6
    )
    score +=
      (idf * frequency * (BM25_K1 + 1)) /
      (frequency +
        BM25_K1 * (1 - BM25_B + (BM25_B * entry.length) / index.averageLength))
  }
  return score
}

export function scoreAll(
  index: LoadedIndex,
  params: SearchParams,
  queryVector: Float32Array | null
): Scored[] {
  const tokens = [...new Set(tokenize(params.q))]

  const query = index.model === EMBEDDING_MODEL ? queryVector : null
  return index.entries
    .filter((entry) => eligible(entry, params))
    .map((entry) => ({
      slug: entry.slug,
      score: 0,
      vectorScore: query ? dot(entry.vector, query) : undefined,
      keywordScore: keywordScore(index, entry, tokens),
    }))
    .sort((a, b) => (b.vectorScore ?? 0) - (a.vectorScore ?? 0))
}

export function rank(
  index: LoadedIndex,
  params: SearchParams,
  queryVector: Float32Array | null
): SearchResult[] {
  const scored = scoreAll(index, params, queryVector)
  const fused = new Map<string, number>()
  const fuse = (list: Scored[]) =>
    list.forEach(({ slug }, rank) =>
      fused.set(slug, (fused.get(slug) ?? 0) + 1 / (RRF_K + rank + 1))
    )
  const [first, second] = scored
  const leads =
    (first?.vectorScore ?? 0) >= MIN_LEADER_SCORE &&
    first.vectorScore! - (second?.vectorScore ?? 0) >= MIN_LEAD
  fuse(
    scored.filter(
      (s, i) => (s.vectorScore ?? 0) >= MIN_VECTOR_SCORE || (i === 0 && leads)
    )
  )
  fuse(
    scored
      .filter((s) => (s.keywordScore ?? 0) >= MIN_KEYWORD_SCORE)
      .sort((a, b) => b.keywordScore! - a.keywordScore!)
  )
  const ranked = [...fused].sort((a, b) => b[1] - a[1])
  const best = ranked[0]?.[1] ?? 1
  return ranked.slice(0, params.limit).map(([slug, score]) => ({
    slug,
    score: Math.round((score / best) * 10_000) / 10_000,
  }))
}
