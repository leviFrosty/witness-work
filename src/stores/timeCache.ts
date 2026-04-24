import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { MmkvStorage } from './mmkv'
import { logger } from '../lib/logger'
import { getServiceYearReports } from '../lib/serviceReport'
import type { ServiceReportsByYears } from '../types/serviceReport'

/**
 * Cache key format: `{serviceYear}` for annual cache, `{year}-{month}` for
 * monthly cache
 */
type CacheKey = string

type CacheEntry = {
  plannedMinutes: number
  lastUpdated: number
  /** Hash of the plans used to generate this cache entry */
  planHash: string
}

/**
 * Pre-flattened day→minutes map for the entire reports history. Serialized as a
 * plain object because `Map` doesn't round-trip through JSON.
 */
export type DailyMinutesCacheEntry = {
  daily: Record<string, number>
  lastUpdated: number
  /** Fingerprint of `serviceReports` — see `generateDailyMinutesFingerprint`. */
  fingerprint: string
}

type TimeCacheState = {
  cache: Record<CacheKey, CacheEntry>
  dailyMinutes: DailyMinutesCacheEntry | null
}

type TimeCacheActions = {
  getCachedPlannedMinutes: (key: CacheKey) => CacheEntry | undefined
  setCachedPlannedMinutes: (
    key: CacheKey,
    plannedMinutes: number,
    planHash: string
  ) => void
  invalidateCache: (key?: CacheKey) => void
  invalidateAllCache: () => void
  setDailyMinutesCache: (
    daily: Record<string, number>,
    fingerprint: string
  ) => void
  invalidateDailyMinutesCache: () => void
}

const initialState: TimeCacheState = {
  cache: {},
  dailyMinutes: null,
}

export const useTimeCache = create<TimeCacheState & TimeCacheActions>()(
  persist(
    (set, get) => ({
      ...initialState,
      getCachedPlannedMinutes: (key: CacheKey) => {
        const cached = get().cache[key]
        if (cached) {
          logger.log(
            `[PlanCache] Retrieved cache for key "${key}": ${cached.plannedMinutes} minutes (updated ${new Date(cached.lastUpdated).toLocaleString()})`
          )
        } else {
          logger.log(`[PlanCache] No cache found for key "${key}"`)
        }
        return cached
      },
      setCachedPlannedMinutes: (
        key: CacheKey,
        plannedMinutes: number,
        planHash: string
      ) => {
        logger.log(
          `[PlanCache] Storing cache for key "${key}": ${plannedMinutes} minutes, hash: ${planHash.substring(0, 20)}...`
        )
        set((state) => ({
          cache: {
            ...state.cache,
            [key]: {
              plannedMinutes,
              lastUpdated: Date.now(),
              planHash,
            },
          },
        }))
      },
      invalidateCache: (key?: CacheKey) => {
        if (!key) {
          return
        }
        logger.log(`[PlanCache] Invalidating cache for key "${key}"`)
        set((state) => {
          const newCache = { ...state.cache }
          delete newCache[key]
          return { cache: newCache }
        })
      },
      invalidateAllCache: () => {
        logger.log('[PlanCache] Invalidating ALL cache entries')
        set({ cache: {} })
      },
      setDailyMinutesCache: (
        daily: Record<string, number>,
        fingerprint: string
      ) => {
        set({
          dailyMinutes: {
            daily,
            lastUpdated: Date.now(),
            fingerprint,
          },
        })
      },
      invalidateDailyMinutesCache: () => {
        set({ dailyMinutes: null })
      },
    }),
    {
      name: 'plan-cache',
      storage: createJSONStorage(() => MmkvStorage),
    }
  )
)

/** Generates a cache key for monthly calculations */
export const getMonthCacheKey = (month: number, year: number): CacheKey => {
  return `${year}-${month}`
}

/**
 * Generates a cache key for "current day" calculations. Includes the current
 * day to ensure cache invalidates daily.
 */
export const getCurrentDayCacheKey = (
  month: number,
  year: number,
  currentDay: number
): CacheKey => {
  return `${year}-${month}-day${currentDay}`
}

/** Generates a cache key for annual calculations */
export const getAnnualCacheKey = (serviceYear: number): CacheKey => {
  return `${serviceYear}`
}

/** Generates a cache key for annual service report calculations */
export const getAnnualServiceReportCacheKey = (
  serviceYear: number
): CacheKey => {
  return `${serviceYear}-reports`
}

/**
 * Generates a stable hash for service reports to detect changes. Hash includes
 * report IDs, hours, and minutes for all reports in the service year.
 */
export const generateServiceReportsHash = (
  serviceReports: ServiceReportsByYears,
  targetYear: number
): string => {
  const serviceYearsReports = getServiceYearReports(serviceReports, targetYear)
  const reportIds: string[] = []

  for (const yearKey in serviceYearsReports) {
    for (const monthKey in serviceYearsReports[yearKey]) {
      const monthReports = serviceYearsReports[yearKey][monthKey]
      reportIds.push(
        ...monthReports.map((r) => `${r.id}:${r.hours}:${r.minutes}`)
      )
    }
  }

  return `sr:${reportIds.length}:${reportIds.sort().join(',')}`
}

/**
 * Light-touch fingerprint for the full reports collection. Iterates once but
 * avoids `moment()` parsing and date formatting, so it's much cheaper than
 * running `flattenDailyMinutes`. Any add/edit/delete changes either the total
 * count or the max `updatedAt`, so this reliably detects mutations.
 */
export const generateDailyMinutesFingerprint = (
  reports: ServiceReportsByYears
): string => {
  let count = 0
  let maxUpdated = 0
  for (const year of Object.values(reports)) {
    for (const month of Object.values(year)) {
      count += month.length
      for (const r of month) {
        if (r.updatedAt && r.updatedAt > maxUpdated) maxUpdated = r.updatedAt
      }
    }
  }
  return `dm:${count}:${maxUpdated}`
}
