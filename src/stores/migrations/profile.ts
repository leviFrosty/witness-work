import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import { extractProfileFromPreferences } from '@/lib/profileMigration'

export function runProfileMigration() {
  const prefs = usePreferences.getState()
  if (prefs.hasMigratedProfileFromPreferences) return

  const legacyPrefs = prefs as unknown as Record<string, unknown>
  const result = extractProfileFromPreferences(legacyPrefs)

  if (Object.keys(result.profile.values).length > 0) {
    useProfile.setState({
      ...result.profile.values,
      profileUpdatedAt: result.profile.updatedAt,
    } as never)
  }

  usePreferences.setState({
    hasMigratedProfileFromPreferences: true,
    ...({
      name: undefined,
      avatar: undefined,
      customAvatarBackground: undefined,
      hasCompletedProfileSetup: undefined,
    } as Record<string, unknown>),
  } as never)

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
