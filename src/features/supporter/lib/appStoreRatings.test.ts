import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = new Map<string, string>()
vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    getString = (key: string) => storage.get(key)
    set = (key: string, value: string) => void storage.set(key, value)
  },
}))

const get = vi.fn()
vi.mock('axios', () => ({
  default: { get: (...args: unknown[]) => get(...args) },
}))

import {
  APP_STORE_RATINGS_REFRESH_MS,
  FALLBACK_APP_STORE_RATINGS,
  getAppStoreRatings,
  normalizeAppStoreRatings,
  refreshAppStoreRatingsIfStale,
  resetAppStoreRatingsSession,
} from '@/features/supporter/lib/appStoreRatings'

const live = {
  averageRating: 4.9,
  ratingCount: 800,
  countryCount: 50,
  updatedAt: '2026-09-24T00:00:00.000Z',
}

beforeEach(() => {
  storage.clear()
  get.mockReset()
  resetAppStoreRatingsSession()
})

describe('normalizeAppStoreRatings', () => {
  it('keeps the three display fields and rejects malformed bodies', () => {
    expect(normalizeAppStoreRatings(live)).toEqual({
      averageRating: 4.9,
      ratingCount: 800,
      countryCount: 50,
    })
    expect(normalizeAppStoreRatings({ ...live, averageRating: 6 })).toBeNull()
    expect(normalizeAppStoreRatings({ ...live, ratingCount: 0 })).toBeNull()
    expect(
      normalizeAppStoreRatings({ error: 'Ratings unavailable' })
    ).toBeNull()
  })
})

describe('refreshAppStoreRatingsIfStale', () => {
  it('falls back to the bundled snapshot until a fetch succeeds', async () => {
    get.mockRejectedValue(new Error('offline'))
    expect(getAppStoreRatings()).toEqual(FALLBACK_APP_STORE_RATINGS)
    expect(await refreshAppStoreRatingsIfStale()).toBeNull()
    expect(getAppStoreRatings()).toEqual(FALLBACK_APP_STORE_RATINGS)
  })

  it('persists a fetch and skips the network for 7 days', async () => {
    get.mockResolvedValue({ data: live })
    const fresh = await refreshAppStoreRatingsIfStale(0)
    expect(fresh).toMatchObject({ ratingCount: 800 })
    expect(getAppStoreRatings()).toEqual(fresh)

    resetAppStoreRatingsSession()
    expect(
      await refreshAppStoreRatingsIfStale(APP_STORE_RATINGS_REFRESH_MS - 1)
    ).toBeNull()
    expect(get).toHaveBeenCalledTimes(1)

    get.mockResolvedValue({ data: { ...live, ratingCount: 900 } })
    expect(
      await refreshAppStoreRatingsIfStale(APP_STORE_RATINGS_REFRESH_MS)
    ).toMatchObject({ ratingCount: 900 })
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('shares one request and tries at most once per session', async () => {
    get.mockRejectedValue(new Error('offline'))
    await Promise.all([
      refreshAppStoreRatingsIfStale(),
      refreshAppStoreRatingsIfStale(),
    ])
    await refreshAppStoreRatingsIfStale()
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('keeps stale ratings when a refresh fails', async () => {
    get.mockResolvedValue({ data: live })
    await refreshAppStoreRatingsIfStale(0)
    resetAppStoreRatingsSession()
    get.mockRejectedValue(new Error('offline'))
    await refreshAppStoreRatingsIfStale(APP_STORE_RATINGS_REFRESH_MS * 2)
    expect(getAppStoreRatings()).toMatchObject({ ratingCount: 800 })
  })
})
