import { request } from '@/lib/http/request'
import { MMKV } from 'react-native-mmkv'
import apis from '@/constants/apis'

export interface AppStoreRatings {
  averageRating: number
  ratingCount: number
  countryCount: number
}

interface PersistedAppStoreRatings {
  ratings: AppStoreRatings
  fetchedAt: number
}

export const FALLBACK_APP_STORE_RATINGS: AppStoreRatings = {
  averageRating: 4.89,
  ratingCount: 734,
  countryCount: 44,
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
