import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import {
  GuardedAsyncStorage,
  hasMigratedFromAsyncStorage,
  MmkvStorage,
} from '@/stores/mmkv'
import type {
  CalendarDestination,
  PublishingState,
} from '../../modules/calendar-bridge'

export const useCalendarSync = create(
  persist(
    () => ({
      enabled: false,

      registered: false,
      destination: null as CalendarDestination | null,
      namespace: null as string | null,
      includeDetails: false,
      lastSyncedAt: null as number | null,

      failingSince: null as number | null,

      upcomingCount: 0,

      sharedCalendar: null as { title: string; account: string } | null,

      optedOut: false,

      promptAnswered: false,
    }),
    {
      name: 'calendar-sync',
      migrate: keepPersistedState,
      storage: createJSONStorage(() =>
        hasMigratedFromAsyncStorage() ? MmkvStorage : GuardedAsyncStorage
      ),
    }
  )
)

export const useCalendarPublishing = create(() => ({
  state: null as PublishingState | null,
  deviceId: null as string | null,
  working: false,
  error: null as string | null,
}))
