import * as BuddiesKeychain from '../../../../modules/buddies-keychain'
import { useFeatureFlag } from '@/lib/featureFlags'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * Buddies UI visibility: the `buddies` remote flag (or the dev-build override
 * in Tools) on a binary that ships the Keychain module. OTA updates can land on
 * older binaries, so the native check is not optional.
 */
export default function useBuddiesEnabled(): boolean {
  const flag = useFeatureFlag('buddies')
  const devOverride = useBuddies((state) => state.devOverride)
  return (flag || (__DEV__ && devOverride)) && BuddiesKeychain.isAvailable()
}
