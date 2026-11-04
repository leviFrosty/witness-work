import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import type { WebLockCredentials } from '@/lib/webAppLock'

/** Seconds away from the app before it asks to unlock again. */
export const APP_LOCK_DELAYS = [0, 60, 300, 900] as const
export type AppLockDelay = (typeof APP_LOCK_DELAYS)[number]

/**
 * The delays to choose from. The web has no Immediately: the lock takes the app
 * away, so every tab switch would lose what was being typed.
 */
export const appLockDelays = (web: boolean): readonly AppLockDelay[] =>
  web ? APP_LOCK_DELAYS.filter((delay) => delay > 0) : APP_LOCK_DELAYS

/** The delay that applies: on the web, Immediately counts as 1 minute. */
export const appLockDelayFor = (
  requireAfter: AppLockDelay,
  web: boolean
): AppLockDelay => (web && requireAfter === 0 ? 60 : requireAfter)

type AppLockSettings = {
  enabled: boolean
  requireAfter: AppLockDelay
  /**
   * The web's: the account's passkeys that unlock this browser, and their RP ID
   * (`webAppLock.ts`). Null on phones, and while the web's lock is off.
   */
  webCredentials: WebLockCredentials | null
  set: (
    settings: Partial<
      Pick<AppLockSettings, 'enabled' | 'requireAfter' | 'webCredentials'>
    >
  ) => void
}

/**
 * Face ID / Touch ID protection for opening the app, or a passkey on the web.
 * Device-local: excluded from sync and ministry backups, since another device
 * may not have the same biometrics or passcode. The web's goes with the rest of
 * the browser's data when it signs out.
 */
export const useAppLockSettings = create<AppLockSettings>()(
  persist(
    (set) => ({
      enabled: false,
      requireAfter: 0,
      webCredentials: null,
      set: (settings) => set(settings),
    }),
    {
      name: 'app-lock',
      migrate: keepPersistedState,
      storage: createJSONStorage(() => MmkvStorage),
      partialize: ({ enabled, requireAfter, webCredentials }) => ({
        enabled,
        requireAfter,
        webCredentials,
      }),
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
