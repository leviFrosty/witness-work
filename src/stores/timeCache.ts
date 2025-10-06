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

type TimeCacheState = {
  cache: Record<CacheKey, CacheEntry>
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
}

const initialState: TimeCacheState = {
  cache: {},
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
