import type { FeatureFlagsStatus } from '@/lib/featureFlags'

/**
 * How Buddies shows: not at all (`hidden`); with a spinner while a flag
 * remembered as on is checked for the first time this session (`loading`);
 * usable (`enabled`); or dimmed while the relay's kill switch is on
 * (`disabled`).
 */
export type BuddiesAvailability = 'hidden' | 'loading' | 'enabled' | 'disabled'

export type BuddiesAvailabilityInput = {
  /** The binary ships the Keychain module. */
  nativeAvailable: boolean
  /** Dev builds only: Tools' override, standing in for the flag. */
  devOverride: boolean
  /** The `buddies` flag as loaded now; undefined while it isn't. */
  flag: boolean | string | undefined
  flagStatus: FeatureFlagsStatus
  /** The flag's value at its last successful load, from any session. */
  flagLastKnown: boolean | null
  /** The flag already loaded on during this app session. */
  flagConfirmed: boolean
  /** The relay's kill switch refused a sync since the last one that worked. */
  relayDisabled: boolean
}

/**
 * Buddies never shows to someone it wasn't on for, but once it was, it keeps
 * showing while flags reload (every return to the app) or can't load (offline):
 * the relay enforces access, and cached buddies stay useful.
 */
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
  // A load that worked without the flag means it's off.
  if (flagStatus === 'loaded') return false
  if (flagLastKnown !== true) return false
  return flagStatus === 'loading' && !flagConfirmed ? 'loading' : true
}

/**
 * What to remember of the flag: its value once a load settles it, else
 * undefined to keep what's remembered.
 */
export function settledBuddiesFlag(
  flag: boolean | string | undefined,
  flagStatus: FeatureFlagsStatus
): boolean | undefined {
  if (flag !== undefined) return flag === true
  return flagStatus === 'loaded' ? false : undefined
}
