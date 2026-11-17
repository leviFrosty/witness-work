export type BuddiesAvailability = 'hidden' | 'enabled' | 'disabled'

export type BuddiesAvailabilityInput = {
  nativeAvailable: boolean

  relayDisabled: boolean
}

export function buddiesAvailability(
  input: BuddiesAvailabilityInput
): BuddiesAvailability {
  if (!input.nativeAvailable) return 'hidden'
  return input.relayDisabled ? 'disabled' : 'enabled'
}
