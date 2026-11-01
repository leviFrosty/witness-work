import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import type { TimeEntriesByYear } from '@/types/timeEntry'

export type DailyMinutesCacheEntry = {
  daily: Record<string, number>
  lastUpdated: number

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

  return `dm2:${count}:${maxUpdated}`
}
