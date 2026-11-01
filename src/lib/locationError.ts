const messageOf = (error: unknown): string => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : (error as { message?: unknown })?.message
  return typeof message === 'string' ? message : ''
}

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

export const isExpectedLocationError = (error: unknown): boolean =>
  isLocationTemporarilyUnavailableError(error) || isLocationOffError(error)
