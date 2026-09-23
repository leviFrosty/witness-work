import { Platform } from 'react-native'
import { useFeatureFlag } from '@/lib/featureFlags'

/** Notes Import's server authentication currently requires Apple App Attest. */
export function useNotesImportEnabled(): boolean {
  const enabled = useFeatureFlag('notes-import')
  return Platform.OS === 'ios' && enabled
}
