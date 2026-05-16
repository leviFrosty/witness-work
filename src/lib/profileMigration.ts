/**
 * One-shot migration that extracts identity-shaped fields from the legacy
 * preferences blob (MMKV key `preferences`) into the new Profile store (MMKV
 * key `profile`).
 *
 * Why a boot runner instead of the Zustand `persist.migrate` callback: a
 * persist `migrate` only sees its own blob, so it can drop fields from
 * `preferences` but cannot atomically write them to a sibling store. The wave-2
 * Category refactor used the same boot-runner pattern — see
 * `migrateTagsToCategories` and the `hasMigratedTagsToCategories` flag in
 * `src/app/App.tsx`.
 *
 * This module is intentionally a pure transform so it can be unit-tested
 * without pulling in React Native, the storage adapter, or Zustand persist —
 * the runner that calls it lives in `src/app/App.tsx`.
 */

/**
 * Canonical list of preference keys that get extracted into the new profile
 * store. Exported so the iCloud sync layer can use the same list when
 * translating legacy payloads from older peers that still ship these fields
 * inside `preferencesStore.values` (see `payloadFieldRenames.ts`).
 *
 * Glossary mapping:
 *
 * - `name` — User's first name (identity).
 * - `avatar` — User's profile avatar (identity).
 * - `customAvatarBackground` — Identity-shaped tint applied to the avatar. The
 *   settings-side accent colour stays in Preferences; only the avatar-specific
 *   override moves.
 * - `hasCompletedProfileSetup` — Profile-setup completion gate. Lives with
 *   Profile because it gates whether Profile data has been collected, not
 *   whether the app behaves a certain way.
 */
export const PROFILE_FIELD_KEYS = [
  'name',
  'avatar',
  'customAvatarBackground',
  'hasCompletedProfileSetup',
] as const

export type ProfileFieldKey = (typeof PROFILE_FIELD_KEYS)[number]

const PROFILE_KEY_SET: ReadonlySet<string> = new Set(PROFILE_FIELD_KEYS)

export type ProfileSlice = {
  values: Record<string, unknown>
  updatedAt: Record<string, number>
}

export type ExtractResult = {
  /** Preferences blob with profile fields stripped out. */
  preferences: Record<string, unknown>
  /** Profile blob — values + per-key updatedAt map for iCloud LWW. */
  profile: ProfileSlice
}

/**
 * Splits a legacy preferences blob into (preferences-without-profile-fields,
 * profile-slice). Idempotent: calling it on an already-split preferences blob
 * yields an empty profile slice and returns the preferences blob structurally
 * unchanged.
 *
 * Preserves the per-key `preferenceUpdatedAt` timestamps for the moved fields
 * by relocating them into the profile slice's `updatedAt` map and dropping them
 * from the preferences' `preferenceUpdatedAt`.
 */
export function extractProfileFromPreferences(
  preferences: Record<string, unknown>
): ExtractResult {
  if (!preferences || typeof preferences !== 'object') {
    return {
      preferences: preferences ?? {},
      profile: { values: {}, updatedAt: {} },
    }
  }

  const nextPrefs: Record<string, unknown> = {}
  const profileValues: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(preferences)) {
    if (PROFILE_KEY_SET.has(key)) {
      profileValues[key] = value
    } else {
      nextPrefs[key] = value
    }
  }

  // Reroute the per-key timestamps so iCloud LWW continues to work after the
  // split. The settings-side `preferenceUpdatedAt` keeps everything except
  // the moved fields; the profile slice's `updatedAt` carries the moved
  // entries.
  const profileUpdatedAt: Record<string, number> = {}
  const existingPrefTimestamps = preferences.preferenceUpdatedAt as
    | Record<string, number>
    | undefined
  if (
    existingPrefTimestamps &&
    typeof existingPrefTimestamps === 'object' &&
    !Array.isArray(existingPrefTimestamps)
  ) {
    const remainingPrefTimestamps: Record<string, number> = {}
    for (const [key, ts] of Object.entries(existingPrefTimestamps)) {
      if (PROFILE_KEY_SET.has(key)) {
        profileUpdatedAt[key] = ts
      } else {
        remainingPrefTimestamps[key] = ts
      }
    }
    nextPrefs.preferenceUpdatedAt = remainingPrefTimestamps
  }

  return {
    preferences: nextPrefs,
    profile: { values: profileValues, updatedAt: profileUpdatedAt },
  }
}
