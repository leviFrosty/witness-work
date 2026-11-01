import { request } from '@/lib/http/request'
import { MMKV } from 'react-native-mmkv'
import apis from '@/constants/apis'

export interface AppStoreRatings {
  complete: true
  averageRating: number
  ratingCount: number
  countryCount: number
  updatedAt: string
}

interface PersistedAppStoreRatings {
  ratings: AppStoreRatings
  fetchedAt: number
}

export const FALLBACK_APP_STORE_RATINGS: AppStoreRatings = {
  complete: true,
  averageRating: 4.89,
  ratingCount: 769,
  countryCount: 44,
  updatedAt: '2026-11-01T06:00:44.711Z',
}

export const APP_STORE_RATINGS_REFRESH_MS = 7 * 24 * 60 * 60 * 1000

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
  const { complete, averageRating, ratingCount, countryCount, updatedAt } =
    value
  if (
    complete !== true ||
    typeof updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(updatedAt)) ||
    !isNonNegative(averageRating) ||
    averageRating > 5 ||
    !isNonNegative(ratingCount) ||
    !isNonNegative(countryCount) ||
    !Number.isSafeInteger(ratingCount) ||
    !Number.isSafeInteger(countryCount) ||
    countryCount === 0 ||
    countryCount > ratingCount ||
    ratingCount === 0
  ) {
    return null
  }
  return { complete, averageRating, ratingCount, countryCount, updatedAt }
}

const loadPersisted = (): PersistedAppStoreRatings | null => {
  const raw = store().getString(KEY)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as unknown
    if (!isRecord(value) || !isNonNegative(value.fetchedAt)) return null
    const ratings = normalizeAppStoreRatings(value.ratings)
    return ratings ? { ratings, fetchedAt: value.fetchedAt } : null
  } catch {
    return null
  }
}

export const getAppStoreRatings = (): AppStoreRatings =>
  loadPersisted()?.ratings ?? FALLBACK_APP_STORE_RATINGS

let inFlight: Promise<AppStoreRatings | null> | null = null
let attemptedThisSession = false

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

  inFlight = request<unknown>({ url: apis.appStoreRatings, timeoutMs: 8_000 })
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

export const resetAppStoreRatingsSession = () => {
  attemptedThisSession = false
  inFlight = null
}
