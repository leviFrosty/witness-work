const PROFILE_FIELD_KEYS = [
  'name',
  'avatar',
  'customAvatarBackground',
  'hasCompletedProfileSetup',
] as const

const PROFILE_KEY_SET: ReadonlySet<string> = new Set(PROFILE_FIELD_KEYS)

export type ProfileSlice = {
  values: Record<string, unknown>
  updatedAt: Record<string, number>
}

export type ExtractResult = {
  preferences: Record<string, unknown>

  profile: ProfileSlice
}

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
      if (value !== undefined) profileValues[key] = value
    } else {
      nextPrefs[key] = value
    }
  }

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
