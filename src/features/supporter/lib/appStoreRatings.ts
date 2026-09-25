import axios from 'axios'
import { MMKV } from 'react-native-mmkv'
import apis from '@/constants/apis'

/** Paywall social proof served by ww-api `GET /app-store/ratings`. */
export interface AppStoreRatings {
  averageRating: number
  ratingCount: number
  countryCount: number
}

interface PersistedAppStoreRatings {
  ratings: AppStoreRatings
  fetchedAt: number
}

/**
 * Real App Store totals as of 2026-09-24, shown until the first fetch lands
 * (fresh install offline, or before the API's first sweep completes).
 */
export const FALLBACK_APP_STORE_RATINGS: AppStoreRatings = {
  averageRating: 4.89,
  ratingCount: 734,
  countryCount: 44,
}

// The API refreshes daily; totals move slowly, so ask about once a week.
export const APP_STORE_RATINGS_REFRESH_MS = 7 * 24 * 60 * 60 * 1000

// Lazy MMKV so importing this module never constructs native storage.
let _store: MMKV | null = null
const store = (): MMKV => (_store ??= new MMKV({ id: 'app-store-ratings' }))

const KEY = 'ratings'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

export const normalizeAppStoreRatings = (
  value: unknown
): AppStoreRatings | null => {
  if (!isRecord(value)) return null
  const { averageRating, ratingCount, countryCount } = value
  if (
    !isNonNegative(averageRating) ||
    averageRating > 5 ||
    !isNonNegative(ratingCount) ||
    !isNonNegative(countryCount) ||
    ratingCount === 0
  ) {
    return null
  }
  return { averageRating, ratingCount, countryCount }
}

const loadPersisted = (): PersistedAppStoreRatings | null => {
  const raw = store().getString(KEY)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as unknown
    if (!isRecord(value) || typeof value.fetchedAt !== 'number') return null
    const ratings = normalizeAppStoreRatings(value.ratings)
    return ratings ? { ratings, fetchedAt: value.fetchedAt } : null
  } catch {
    return null
  }
}

/** Last fetched ratings, however old, else the bundled snapshot. */
export const getAppStoreRatings = (): AppStoreRatings =>
  loadPersisted()?.ratings ?? FALLBACK_APP_STORE_RATINGS

let inFlight: Promise<AppStoreRatings | null> | null = null
let attemptedThisSession = false

/**
 * Fetches and persists new ratings when the stored copy is at least
 * `APP_STORE_RATINGS_REFRESH_MS` old. Makes at most one attempt per JS session
 * so an offline paywall doesn't retry on every open. Resolves to the new
 * ratings, or null when nothing changed.
 */
export const refreshAppStoreRatingsIfStale = (
  now = Date.now()
): Promise<AppStoreRatings | null> => {
  if (inFlight) return inFlight
  const persisted = loadPersisted()
  if (persisted && now - persisted.fetchedAt < APP_STORE_RATINGS_REFRESH_MS) {
    return Promise.resolve(null)
  }
  if (attemptedThisSession) return Promise.resolve(null)
  attemptedThisSession = true

  inFlight = axios
    .get<unknown>(apis.appStoreRatings, { timeout: 8_000 })
    .then(({ data }) => {
      const ratings = normalizeAppStoreRatings(data)
      if (ratings) {
        store().set(KEY, JSON.stringify({ ratings, fetchedAt: now }))
      }
      return ratings
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

/** Test-only: forget the per-session attempt. */
export const resetAppStoreRatingsSession = () => {
  attemptedThisSession = false
  inFlight = null
}
