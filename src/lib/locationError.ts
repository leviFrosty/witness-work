const messageOf = (error: unknown): string => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : (error as { message?: unknown })?.message
  return typeof message === 'string' ? message : ''
}

/**
 * Core Location code 0 (`kCLErrorLocationUnknown`) means the device cannot
 * determine its position right now. This is expected and usually transient, for
 * example indoors, with a weak GPS signal, or while location services are still
 * warming up. Android's expo-location says the same in its own words.
 */
export const isLocationTemporarilyUnavailableError = (
  error: unknown
): boolean => {
  const message = messageOf(error)
  return (
    /kCLErrorDomain(?:\s+Code=|\s+error\s+)0\b/i.test(message) ||
    /kCLErrorLocationUnknown/i.test(message) ||
    /current location is unknown/i.test(message)
  )
}

/**
 * The User turned location off or didn't allow it: Core Location code 1
 * (`kCLErrorDenied`), or expo-location's "services disabled", "not authorized"
 * and "unsatisfied device settings" errors. Callers already show their denied
 * or unavailable state for these.
 */
export const isLocationOffError = (error: unknown): boolean => {
  const message = messageOf(error)
  return (
    /kCLErrorDomain(?:\s+Code=|\s+error\s+)1\b/i.test(message) ||
    /kCLErrorDenied/i.test(message) ||
    /location is unavailable\. make sure that location services are enabled/i.test(
      message
    ) ||
    /location services are disabled/i.test(message) ||
    /unsatisfied device settings/i.test(message) ||
    /not authorized to use location services/i.test(message) ||
    /location permission is required/i.test(message)
  )
}

/** A device state, not an app bug: never sent to error tracking. */
export const isExpectedLocationError = (error: unknown): boolean =>
  isLocationTemporarilyUnavailableError(error) || isLocationOffError(error)
