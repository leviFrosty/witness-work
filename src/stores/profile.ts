import { create } from 'zustand'
import { persist, combine, createJSONStorage } from 'zustand/middleware'
import {
  GuardedAsyncStorage,
  hasMigratedFromAsyncStorage,
  MmkvStorage,
} from '@/stores/mmkv'
import type { ProfileAvatar } from '@/types/avatar'

/**
 * Persisted defaults for the Profile store — the User's identity-shaped data.
 *
 * The glossary disambiguates **Profile** (User identity: name, avatar, avatar
 * background) from **Preferences** (User settings: role, goals, sync toggles,
 * theme, etc.). These fields lived inside `preferences` historically; the
 * boot-runner migration in `src/lib/profileMigration.ts` extracts them on first
 * launch after upgrade and seeds this store. See `docs/refactor-log.md`.
 */
export const PROFILE_DEFAULTS = {
  /** User's first name. Collected during onboarding profile step. */
  name: '',
  /** Profile avatar — stored locally, never uploaded except via image sync. */
  avatar: { type: 'none', value: '' } as ProfileAvatar,
  /**
   * Supporter-only override for the avatar/profile-picture background color.
   * When null, the avatar background follows the accent color. Kept here (not
   * in Preferences) because it's an identity-shaped tint applied to the User's
   * avatar — the surface that represents "who they are."
   */
  customAvatarBackground: null as string | null,
  /**
   * Distinct from `onboardingComplete` so existing users — who installed before
   * the profile step existed — can be prompted to fill it in post-onboarding.
   * Sits in Profile because it gates Profile data, not settings.
   */
  hasCompletedProfileSetup: false,
  /**
   * Per-key epoch ms of the most recent change for syncable profile keys.
   * Merged last-writer-wins per key, mirroring the Preferences store's
   * `preferenceUpdatedAt` map.
   */
  profileUpdatedAt: {} as Record<string, number>,
}

/**
 * Keys that never participate in cross-device sync. The Profile slice today has
 * none — every field is identity-shaped and should follow the User. Kept as an
 * explicit empty set so future per-device flags can be added without
 * reorganising the store.
 */
export const NON_SYNCABLE_PROFILE_KEYS = new Set<string>(['profileUpdatedAt'])

/**
 * Persisted profile store. Brand new at version 0; the v2→v3 preferences
 * migration plus the `hasMigratedProfileFromPreferences` boot runner seed this
 * store from the legacy `preferences` blob on upgrade.
 *
 * Stamping wrapper mirrors `usePreferences`: every partial update writes
 * `profileUpdatedAt[<key>] = Date.now()` for each touched syncable key so the
 * iCloud LWW merge can resolve cross-device edits the same way it does for
 * preferences.
 */
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
          const now = Date.now()
          const current = getState().profileUpdatedAt ?? {}
          const next: Record<string, number> = { ...current }
          let changed = false
          for (const key of Object.keys(resolved)) {
            if (NON_SYNCABLE_PROFILE_KEYS.has(key)) continue
            next[key] = now
            changed = true
          }
          if (changed) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      storage: createJSONStorage(() =>
        hasMigratedFromAsyncStorage() ? MmkvStorage : GuardedAsyncStorage
      ),
      version: 0,
    }
  )
)

export default useProfile
