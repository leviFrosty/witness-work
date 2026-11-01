import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'

export const APP_LOCK_DELAYS = [0, 60, 300, 900] as const
export type AppLockDelay = (typeof APP_LOCK_DELAYS)[number]

type AppLockSettings = {
  enabled: boolean
  requireAfter: AppLockDelay
  set: (
    settings: Partial<Pick<AppLockSettings, 'enabled' | 'requireAfter'>>
  ) => void
}

export const useAppLockSettings = create<AppLockSettings>()(
  persist(
    (set) => ({
      enabled: false,
      requireAfter: 0,
      set: (settings) => set(settings),
    }),
    {
      name: 'app-lock',
      migrate: keepPersistedState,
      storage: createJSONStorage(() => MmkvStorage),
      partialize: ({ enabled, requireAfter }) => ({ enabled, requireAfter }),
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
