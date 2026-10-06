import { useEffect } from 'react'
import * as BuddiesKeychain from '../../../../modules/buddies-keychain'
import { useFeatureFlagsStatus, useFeatureFlagValue } from '@/lib/featureFlags'
import {
  buddiesAvailability,
  settledBuddiesFlag,
  type BuddiesAvailability,
} from '@/features/buddies/lib/availability'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { useBuddiesSession } from '@/features/buddies/stores/buddiesSession'

/**
 * Whether and how Buddies shows: the `buddies` remote flag (or the dev-build
 * override in Tools) on a binary that ships the Keychain module, remembered
 * across flag reloads, and dimmed while the relay's kill switch is on. OTA
 * updates can land on older binaries, so the native check is not optional.
 */
export default function useBuddiesAvailability(): BuddiesAvailability {
  const flag = useFeatureFlagValue('buddies')
  const flagStatus = useFeatureFlagsStatus()
  const flagLastKnown = useBuddies((state) => state.flagLastKnown)
  const devOverride = useBuddies((state) => state.devOverride)
  const flagConfirmed = useBuddiesSession((state) => state.flagConfirmed)
  const relayDisabled = useBuddiesSession((state) => state.relayDisabled)
  const settled = settledBuddiesFlag(flag, flagStatus)

  // Also restores it after Delete My Buddies Data resets the store.
  useEffect(() => {
    if (settled === undefined) return
    if (flagLastKnown !== settled)
      useBuddies.setState({ flagLastKnown: settled })
    if (useBuddiesSession.getState().flagConfirmed !== settled)
      useBuddiesSession.setState({ flagConfirmed: settled })
  }, [settled, flagLastKnown])

  return buddiesAvailability({
    nativeAvailable: BuddiesKeychain.isAvailable(),
    devOverride: __DEV__ && devOverride,
    flag,
    flagStatus,
    flagLastKnown,
    flagConfirmed,
    relayDisabled,
  })
}
