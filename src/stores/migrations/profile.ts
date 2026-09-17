import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import { extractProfileFromPreferences } from '@/lib/profileMigration'

export function runProfileMigration() {
  const prefs = usePreferences.getState()
  if (prefs.hasMigratedProfileFromPreferences) return

  // Cast through unknown — the moved keys are gone from the typed state, but
  // a v2 persisted blob still carries them in raw rehydrated form until we
  // drop them below.
  const legacyPrefs = prefs as unknown as Record<string, unknown>
  const result = extractProfileFromPreferences(legacyPrefs)

  // Seed the new Profile store with the extracted values + their existing
  // updatedAt timestamps. Raw setState bypasses the stamping wrapper so we
  // don't bump `profileUpdatedAt` to `Date.now()` on first-launch upgrade —
  // we want LWW to reflect when the user last changed each field.
  if (Object.keys(result.profile.values).length > 0) {
    useProfile.setState({
      ...result.profile.values,
      profileUpdatedAt: result.profile.updatedAt,
    } as never)
  }

  // Drop the legacy fields from preferences + flip the flag. `undefined`
  // values are omitted by `JSON.stringify`, so the next persist write
  // produces a v3-shaped blob with no profile-shaped keys.
  usePreferences.setState({
    hasMigratedProfileFromPreferences: true,
    ...({
      name: undefined,
      avatar: undefined,
      customAvatarBackground: undefined,
      hasCompletedProfileSetup: undefined,
    } as Record<string, unknown>),
  } as never)

  // Also drop the moved keys from `preferenceUpdatedAt` so settings-side
  // LWW stops tracking them. Done as a second raw setState so we can pull
  // the latest map (it may have been mutated by the seeding step above).
  const latest = usePreferences.getState()
  if (
    latest.preferenceUpdatedAt &&
    typeof latest.preferenceUpdatedAt === 'object'
  ) {
    const cleaned: Record<string, number> = {}
    for (const [key, ts] of Object.entries(latest.preferenceUpdatedAt)) {
      if (
        key === 'name' ||
        key === 'avatar' ||
        key === 'customAvatarBackground' ||
        key === 'hasCompletedProfileSetup'
      ) {
        continue
      }
      cleaned[key] = ts
    }
    usePreferences.setState({ preferenceUpdatedAt: cleaned })
  }
}
