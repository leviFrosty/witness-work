import { Platform } from 'react-native'
import { useFeatureFlag } from '@/lib/featureFlags'

// Chosen once per platform, so the hook order never changes and iOS never
// reports exposure to the Android rollout flag.
const useAndroidRollout =
  Platform.OS === 'android'
    ? () => useFeatureFlag('notes-import-android')
    : () => Platform.OS === 'ios'

/**
 * Notes Import needs a platform authorizer: App Attest on iOS, Play Integrity
 * on Android (ADR 0017). Android also needs its own flag for a staged rollout.
 */
export function useNotesImportEnabled(): boolean {
  const enabled = useFeatureFlag('notes-import')
  const platformEnabled = useAndroidRollout()
  return enabled && platformEnabled
}
