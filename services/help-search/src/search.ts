import { isLocale, type Locale, type Platform } from './contract'
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
  if (platform !== undefined && platform !== 'ios' && platform !== 'android')
    return { ok: false, error: 'platform must be ios or android' }

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

/** The URL a request is cached under: same params, same order. */
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

/**
 * Relevance floors, tuned on `eval/queries.json` (`pnpm eval`). Only answers
 * that clear one of them are returned: an unrelated query should return
 * nothing, so clients keep their local results.
 *
 * - Vector: cosine similarity of the query and answer embeddings. Unrelated
 *   queries' best match scored at most 0.30, relevant ones from 0.31.
 * - Clear leader: a short query in another language ("тёмная тема") can score its
 *   answer only 0.33, but far ahead of the rest. The best vector match counts
 *   when it leads the runner-up by `MIN_LEAD` (unrelated queries' best led by
 *   at most 0.035; relevant ones by 0.12 or more).
 * - Keyword: BM25 over answers that contain every query token. Common words
 *   ("how", "the") score near 0, so a query made only of them doesn't count.
 */
export const MIN_VECTOR_SCORE = 0.4
export const MIN_LEADER_SCORE = 0.25
export const MIN_LEAD = 0.08
export const MIN_KEYWORD_SCORE = 2

// Reciprocal rank fusion, as AI Search's hybrid search did.
const RRF_K = 60
const BM25_K1 = 1.2
const BM25_B = 0.75

export type Scored = {
  slug: string
  /** Fused score, 1 for the best result. */
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

/** BM25 of an answer holding every query token, else undefined. */
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
    // Like SQLite FTS5: a token in over half the answers adds almost nothing.
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

/**
 * Every answer the filters allow, with its raw scores (`vectorScore` only when
 * there's a query embedding), best vector match first. Admin explain shows
 * this; `rank` builds on it.
 */
export function scoreAll(
  index: LoadedIndex,
  params: SearchParams,
  queryVector: Float32Array | null
): Scored[] {
  const tokens = [...new Set(tokenize(params.q))]
  // An index from another model (mid-rebuild after a model change) can't be
  // compared with this query's embedding; it answers from keywords alone.
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

/**
 * Hybrid search: answers clearing either floor, ordered by reciprocal rank
 * fusion of their vector and keyword ranks, best first.
 */
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
