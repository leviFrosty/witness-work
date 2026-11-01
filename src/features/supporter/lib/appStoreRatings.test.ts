import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = new Map<string, string>()
vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    getString = (key: string) => storage.get(key)
    set = (key: string, value: string) => void storage.set(key, value)
  },
}))

const get = vi.fn()
vi.mock('@/lib/http/request', () => ({
  request: (...args: unknown[]) => get(...args),
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
  complete: true,
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
  it('keeps complete, dated snapshots and rejects malformed bodies', () => {
    expect(normalizeAppStoreRatings(live)).toEqual(live)
    expect(normalizeAppStoreRatings({ ...live, averageRating: 6 })).toBeNull()
    expect(normalizeAppStoreRatings({ ...live, ratingCount: 0 })).toBeNull()
    expect(normalizeAppStoreRatings({ ...live, ratingCount: 1.5 })).toBeNull()
    expect(normalizeAppStoreRatings({ ...live, countryCount: 0 })).toBeNull()
    expect(normalizeAppStoreRatings({ ...live, countryCount: 801 })).toBeNull()
    expect(normalizeAppStoreRatings({ ...live, countryCount: 4.5 })).toBeNull()
    expect(
      normalizeAppStoreRatings({ ...live, updatedAt: 'invalid' })
    ).toBeNull()
    expect(normalizeAppStoreRatings({ ...live, complete: false })).toBeNull()
    expect(
      normalizeAppStoreRatings({ error: 'Ratings unavailable' })
    ).toBeNull()
  })
})

describe('refreshAppStoreRatingsIfStale', () => {
  it('discards the cached incomplete totals from the old API and refreshes immediately', async () => {
    storage.set(
      'ratings',
      JSON.stringify({
        ratings: { averageRating: 4.96, ratingCount: 72, countryCount: 4 },
        fetchedAt: Date.now(),
      })
    )
    expect(getAppStoreRatings()).toEqual(FALLBACK_APP_STORE_RATINGS)
    get.mockResolvedValue({ data: live })
    expect(await refreshAppStoreRatingsIfStale()).toEqual(live)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('does not replace a verified snapshot with an unverified API response', async () => {
    get.mockResolvedValue({ data: live })
    await refreshAppStoreRatingsIfStale(0)
    resetAppStoreRatingsSession()
    get.mockResolvedValue({
      data: {
        averageRating: 4.96,
        ratingCount: 72,
        countryCount: 4,
        updatedAt: '2026-11-01T03:17:21.060Z',
      },
    })
    expect(
      await refreshAppStoreRatingsIfStale(APP_STORE_RATINGS_REFRESH_MS)
    ).toBeNull()
    expect(getAppStoreRatings()).toEqual(live)
  })

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
