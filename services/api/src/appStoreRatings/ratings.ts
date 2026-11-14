import { APP_STORE_STOREFRONTS } from './storefronts'

/**
 * Complete App Store ratings snapshots for the paywall.
 *
 * App Store Connect's API exposes written reviews only; star-only ratings (the
 * bulk of them) appear per storefront in the JSON-LD of the public App Store
 * page. Apple's iTunes lookup API has the same numbers but answers Workers with
 * 403. Totals therefore mean reading ~175 pages, and Apple answers 429 after
 * about 90 in a row, so an hourly cron reads `BATCH_SIZE` storefronts per run
 * into KV and publishes the summary once a full sweep finishes. It then rests
 * until `SWEEP_INTERVAL_MS` has passed, so Apple sees one sweep a week.
 */

export const APP_STORE_APP_ID = '6469723047'

export const STATE_KEY = 'app-store-ratings:state:v2'
export const SUMMARY_KEY = 'app-store-ratings:summary:v2'

export const BATCH_SIZE = 40
export const SWEEP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000
/** How long to leave Apple alone after a batch in which nothing succeeded. */
export const FAILED_BATCH_RETRY_MS = 24 * 60 * 60 * 1000
const LOOKUP_TIMEOUT_MS = 5_000

export type RatingsKv = Pick<KVNamespace, 'get' | 'put'>

export interface StorefrontRating {
  count: number
  average: number
}

interface SweepState {
  pending: string[]
  /** When the last full sweep finished; null before the first one. */
  completedAt: number | null
  /** Set after a batch in which every lookup failed: no lookups until then. */
  retryAt?: number
  storefronts: Record<string, StorefrontRating>
}

export interface AppStoreRatingsSummary {
  complete: true
  /** Rating-count-weighted mean across storefronts, rounded to 2 decimals. */
  averageRating: number
  ratingCount: number
  /** Storefronts with at least one rating. */
  countryCount: number
  updatedAt: string
}

const emptyState = (): SweepState => ({
  pending: [...APP_STORE_STOREFRONTS],
  completedAt: null,
  storefronts: {},
})

const JSON_LD = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g

/** The page's SoftwareApplication JSON-LD block, if it has one. */
function findSoftwareApplication(html: string): Record<string, unknown> | null {
  for (const [, json] of html.matchAll(JSON_LD)) {
    let block: unknown
    try {
      block = JSON.parse(json)
    } catch {
      continue
    }
    if ((block as { '@type'?: unknown } | null)?.['@type'] === 'SoftwareApplication') {
      return block as Record<string, unknown>
    }
  }
  return null
}

/**
 * One storefront's lookup. `null` means the storefront has no ratings or doesn't
 * sell the app; `undefined` means the lookup failed and the previous value
 * should stand.
 */
export async function fetchStorefrontRating(
  country: string,
  fetchFn: typeof fetch = fetch,
): Promise<StorefrontRating | null | undefined> {
  try {
    const url = `https://apps.apple.com/${country}/app/id${APP_STORE_APP_ID}`
    const response = await fetchFn(url, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    })
    if (response.status === 404) return null
    if (!response.ok) return undefined
    // A redirect to another storefront would count that storefront's ratings.
    if (
      response.url &&
      !new URL(response.url).pathname.startsWith(`/${country}/`)
    ) {
      return null
    }
    const app = findSoftwareApplication(await response.text())
    if (!app) return undefined
    if (app.aggregateRating === undefined) return null
    const { reviewCount: count, ratingValue: average } =
      app.aggregateRating as { reviewCount?: unknown; ratingValue?: unknown }
    if (
      typeof count !== 'number' ||
      !Number.isSafeInteger(count) ||
      count < 0 ||
      typeof average !== 'number' ||
      !Number.isFinite(average) ||
      average < 0 ||
      average > 5
    ) {
      return undefined
    }
    if (count === 0) return null
    return { count, average }
  } catch {
    return undefined
  }
}

export function summarize(
  storefronts: Record<string, StorefrontRating>,
  now: number,
): AppStoreRatingsSummary {
  let ratingCount = 0
  let weighted = 0
  for (const { count, average } of Object.values(storefronts)) {
    ratingCount += count
    weighted += count * average
  }
  return {
    complete: true,
    averageRating: ratingCount
      ? Math.round((weighted / ratingCount) * 100) / 100
      : 0,
    ratingCount,
    countryCount: Object.keys(storefronts).length,
    updatedAt: new Date(now).toISOString(),
  }
}

async function readState(kv: RatingsKv): Promise<SweepState> {
  const raw = await kv.get(STATE_KEY)
  if (!raw) return emptyState()
  try {
    const state = JSON.parse(raw) as SweepState
    return Array.isArray(state.pending) && state.storefronts
      ? state
      : emptyState()
  } catch {
    return emptyState()
  }
}

/** Advances the sweep by one batch. Called from the cron trigger. */
export async function runRatingsSweepStep({
  kv,
  now = Date.now(),
  fetchFn = fetch,
}: {
  kv: RatingsKv
  now?: number
  fetchFn?: typeof fetch
}): Promise<'idle' | 'progress' | 'completed'> {
  const state = await readState(kv)
  if (
    state.pending.length === 0 &&
    state.completedAt !== null &&
    now - state.completedAt < SWEEP_INTERVAL_MS
  ) {
    return 'idle'
  }
  if (state.retryAt !== undefined && now < state.retryAt) return 'idle'
  delete state.retryAt

  if (state.pending.length === 0) state.pending = [...APP_STORE_STOREFRONTS]
  const batch = state.pending.splice(0, BATCH_SIZE)
  let failed = 0
  for (const country of batch) {
    const result = await fetchStorefrontRating(country, fetchFn)
    if (result === undefined) {
      failed += 1
      state.pending.push(country)
      continue
    }
    if (result === null) delete state.storefronts[country]
    else state.storefronts[country] = result
  }

  if (failed === batch.length) {
    state.retryAt = now + FAILED_BATCH_RETRY_MS
    console.warn('app store ratings: every lookup in a batch failed', {
      failed,
    })
  }

  const completed = state.pending.length === 0
  if (completed) {
    state.completedAt = now
    const summary = summarize(state.storefronts, now)
    // No storefront rated means Apple's page changed, not that ratings vanished.
    if (summary.ratingCount > 0) {
      await kv.put(SUMMARY_KEY, JSON.stringify(summary))
    } else {
      console.warn('app store ratings: sweep found no ratings; not publishing')
    }
  }
  await kv.put(STATE_KEY, JSON.stringify(state))
  return completed ? 'completed' : 'progress'
}
