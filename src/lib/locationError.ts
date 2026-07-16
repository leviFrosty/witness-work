/**
 * Core Location code 0 (`kCLErrorLocationUnknown`) means the device cannot
 * determine its position right now. This is expected and usually transient, for
 * example indoors, with a weak GPS signal, or while location services are still
 * warming up.
 */
export const isLocationTemporarilyUnavailableError = (
  error: unknown
): boolean => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ((error as { message?: unknown })?.message ?? '')

  if (typeof message !== 'string') return false

  return (
    /kCLErrorDomain(?:\s+Code=|\s+error\s+)0\b/i.test(message) ||
    /kCLErrorLocationUnknown/i.test(message)
  )
}
