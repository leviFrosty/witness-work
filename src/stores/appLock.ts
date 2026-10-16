import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { MmkvStorage } from '@/stores/mmkv'

/** Seconds away from the app before it asks to unlock again. */
export const APP_LOCK_DELAYS = [0, 60, 300, 900] as const
export type AppLockDelay = (typeof APP_LOCK_DELAYS)[number]

type AppLockSettings = {
  enabled: boolean
  requireAfter: AppLockDelay
  set: (
    settings: Partial<Pick<AppLockSettings, 'enabled' | 'requireAfter'>>
  ) => void
}

/**
 * Face ID / Touch ID protection for opening the app. Device-local: excluded
 * from sync and ministry backups, since another device may not have the same
 * biometrics or passcode.
 */
export const useAppLockSettings = create<AppLockSettings>()(
  persist(
    (set) => ({
      enabled: false,
      requireAfter: 0,
      set: (settings) => set(settings),
    }),
    {
      name: 'app-lock',
      storage: createJSONStorage(() => MmkvStorage),
      partialize: ({ enabled, requireAfter }) => ({ enabled, requireAfter }),
    }
  )
)

type AppLockSession = {
  /** The lock screen covers the app. */
  locked: boolean
  /**
   * A system authentication prompt is up. On Android the passcode fallback
   * opens its own activity, which backgrounds the app; that must not lock it.
   */
  authenticating: boolean
}

/** Runtime lock state; starts locked whenever the lock is on at launch. */
export const useAppLockSession = create<AppLockSession>(() => ({
  locked: useAppLockSettings.getState().enabled,
  authenticating: false,
}))
