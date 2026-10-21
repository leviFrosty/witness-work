import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import type { TimeEntriesByYear } from '@/types/timeEntry'

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
  dailyMinutes: DailyMinutesCacheEntry | null
}

type TimeCacheActions = {
  setDailyMinutesCache: (
    daily: Record<string, number>,
    fingerprint: string
  ) => void
  invalidateDailyMinutesCache: () => void
}

const initialState: TimeCacheState = {
  dailyMinutes: null,
}

/**
 * V0 → v1: drops the old `cache` slice of Service Year totals. It went stale
 * when an entry moved months (the credit cap is per month), so the Year card
 * now sums the year directly. Only the daily-minutes map survives.
 */
export const migrateTimeCachePersistedState = (
  persisted: unknown
): TimeCacheState => ({
  dailyMinutes:
    (persisted as Partial<TimeCacheState> | undefined)?.dailyMinutes ?? null,
})

export const useTimeCache = create<TimeCacheState & TimeCacheActions>()(
  persist(
    (set) => ({
      ...initialState,
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
      version: 1,
      migrate: migrateTimeCachePersistedState,
    }
  )
)

/**
 * Light-touch fingerprint for the full reports collection. Iterates once but
 * avoids `moment()` parsing and date formatting, so it's much cheaper than
 * running `flattenDailyMinutes`. Any add/edit/delete changes either the total
 * count or the max `updatedAt`, so this reliably detects mutations.
 */
export const generateDailyMinutesFingerprint = (
  reports: TimeEntriesByYear
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
  // Bump the prefix when `flattenDailyMinutes` changes what it counts, so a
  // persisted map built the old way is rebuilt.
  return `dm2:${count}:${maxUpdated}`
}
