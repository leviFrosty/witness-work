import { syncTimestamp } from '@/lib/syncClock'
import { NON_SYNCABLE_PROFILE_KEYS } from '@/lib/syncPreferencePolicy'
import { create } from 'zustand'
import { combine, createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { PersistStorage } from '@/stores/mmkv'
import type { ProfileAvatar } from '@/types/avatar'

export const PROFILE_DEFAULTS = {
  name: '',

  avatar: { type: 'none', value: '' } as ProfileAvatar,

  customAvatarBackground: null as string | null,

  hasCompletedProfileSetup: false,

  profileUpdatedAt: {} as Record<string, number>,
}

export { NON_SYNCABLE_PROFILE_KEYS } from '@/lib/syncPreferencePolicy'

export const useProfile = create(
  persist(
    combine(PROFILE_DEFAULTS, (rawSet, getState) => {
      const set: typeof rawSet = (partial, replace) => {
        const resolved =
          typeof partial === 'function' ? partial(getState()) : partial

        if (
          resolved &&
          typeof resolved === 'object' &&
          !Array.isArray(resolved) &&
          !replace
        ) {
          const current = getState().profileUpdatedAt ?? {}
          const next: Record<string, number> = { ...current }
          let changed = false
          for (const key of Object.keys(resolved)) {
            if (NON_SYNCABLE_PROFILE_KEYS.has(key)) continue
            next[key] = syncTimestamp(current[key])
            changed = true
          }
          if (changed) {
            rawSet({ ...(resolved as any), profileUpdatedAt: next })
            return
          }
        }
        rawSet(resolved, replace as never)
      }

      return {
        set,
        setName: (name: string) => set({ name }),
        setAvatar: (avatar: ProfileAvatar) => set({ avatar }),
        setCustomAvatarBackground: (customAvatarBackground: string | null) =>
          set({ customAvatarBackground }),
        setHasCompletedProfileSetup: (hasCompletedProfileSetup: boolean) =>
          set({ hasCompletedProfileSetup }),
      }
    }),
    {
      name: 'profile',
      storage: createJSONStorage(() => PersistStorage),
      version: 0,
      migrate: keepPersistedState,
    }
  )
)

export default useProfile
