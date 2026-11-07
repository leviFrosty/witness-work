import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import type { WebLockCredentials } from '@/lib/webAppLock'

export const APP_LOCK_DELAYS = [0, 60, 300, 900] as const
export type AppLockDelay = (typeof APP_LOCK_DELAYS)[number]

export const appLockDelays = (web: boolean): readonly AppLockDelay[] =>
  web ? APP_LOCK_DELAYS.filter((delay) => delay > 0) : APP_LOCK_DELAYS

export const appLockDelayFor = (
  requireAfter: AppLockDelay,
  web: boolean
): AppLockDelay => (web && requireAfter === 0 ? 60 : requireAfter)

type AppLockSettings = {
  enabled: boolean
  requireAfter: AppLockDelay

  webCredentials: WebLockCredentials | null
  set: (
    settings: Partial<
      Pick<AppLockSettings, 'enabled' | 'requireAfter' | 'webCredentials'>
    >
  ) => void
}

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
  locked: boolean

  authenticating: boolean
}

export const useAppLockSession = create<AppLockSession>(() => ({
  locked: useAppLockSettings.getState().enabled,
  authenticating: false,
}))
