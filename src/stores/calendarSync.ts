import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  GuardedAsyncStorage,
  hasMigratedFromAsyncStorage,
  MmkvStorage,
} from '@/stores/mmkv'
import type {
  CalendarDestination,
  PublishingState,
} from '../../modules/calendar-bridge'

/**
 * Device-local; never included in the iCloud data payload. `includeDetails`,
 * `defaultInclude` and `sharedCalendar` cache the shared ownership record so
 * they are available offline and before the first check.
 */
export const useCalendarSync = create(
  persist(
    () => ({
      enabled: false,
      /** This device has published, so it must finish interrupted batches. */
      registered: false,
      destination: null as CalendarDestination | null,
      namespace: null as string | null,
      defaultInclude: false,
      includeDetails: false,
      lastSyncedAt: null as number | null,
      /** The calendar connected on the primary device, if any. */
      sharedCalendar: null as { title: string; account: string } | null,
      /** Disconnected here: don't reconnect automatically after a handoff. */
      optedOut: false,
    }),
    {
      name: 'calendar-sync',
      storage: createJSONStorage(() =>
        hasMigratedFromAsyncStorage() ? MmkvStorage : GuardedAsyncStorage
      ),
    }
  )
)

/** Server-checked ownership is deliberately never restored from disk. */
export const useCalendarPublishing = create(() => ({
  state: null as PublishingState | null,
  deviceId: null as string | null,
  working: false,
  error: null as string | null,
}))
