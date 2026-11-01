import type { FeatureFlagsStatus } from '@/lib/featureFlags'

export type BuddiesAvailability = 'hidden' | 'loading' | 'enabled' | 'disabled'

export type BuddiesAvailabilityInput = {
  nativeAvailable: boolean

  devOverride: boolean

  flag: boolean | string | undefined
  flagStatus: FeatureFlagsStatus

  flagLastKnown: boolean | null

  flagConfirmed: boolean

  relayDisabled: boolean
}

export function buddiesAvailability(
  input: BuddiesAvailabilityInput
): BuddiesAvailability {
  if (!input.nativeAvailable) return 'hidden'
  const shown = input.devOverride || flagShows(input)
  if (!shown) return 'hidden'
  if (input.relayDisabled) return 'disabled'
  return shown === 'loading' ? 'loading' : 'enabled'
}

function flagShows({
  flag,
  flagStatus,
  flagLastKnown,
  flagConfirmed,
}: BuddiesAvailabilityInput): boolean | 'loading' {
  if (flag !== undefined) return flag === true

  if (flagStatus === 'loaded') return false
  if (flagLastKnown !== true) return false
  return flagStatus === 'loading' && !flagConfirmed ? 'loading' : true
}

export function settledBuddiesFlag(
  flag: boolean | string | undefined,
  flagStatus: FeatureFlagsStatus
): boolean | undefined {
  if (flag !== undefined) return flag === true
  return flagStatus === 'loaded' ? false : undefined
}
