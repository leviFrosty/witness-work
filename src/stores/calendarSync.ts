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
 * Device-local; never included in the iCloud data payload. `includeDetails` and
 * `sharedCalendar` cache the shared ownership record so they are available
 * offline and before the first check.
 */
export const useCalendarSync = create(
  persist(
    () => ({
      enabled: false,
      /** This device has published, so it must finish interrupted batches. */
      registered: false,
      destination: null as CalendarDestination | null,
      namespace: null as string | null,
      includeDetails: false,
      lastSyncedAt: null as number | null,
      /** When updates first failed since the last success (epoch ms). */
      failingSince: null as number | null,
      /** Upcoming follow-ups in the calendar after the last update. */
      upcomingCount: 0,
      /** The calendar connected on the primary device, if any. */
      sharedCalendar: null as { title: string; account: string } | null,
      /**
       * Declined or disconnected here: no automatic reconnect after a handoff,
       * no background checks once interrupted work is done, no alerts.
       */
      optedOut: false,
      /** Answered the setup invitation (onboarding step or tray item). */
      promptAnswered: false,
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
