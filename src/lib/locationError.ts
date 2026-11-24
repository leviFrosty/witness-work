const messageOf = (error: unknown): string => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : (error as { message?: unknown })?.message
  return typeof message === 'string' ? message : ''
}

const codeOf = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'number' ? code : null
}

export const isLocationTemporarilyUnavailableError = (
  error: unknown
): boolean => {
  const code = codeOf(error)
  if (code === 2 || code === 3) return true
  const message = messageOf(error)
  return (
    /kCLErrorDomain(?:\s+Code=|\s+error\s+)0\b/i.test(message) ||
    /kCLErrorLocationUnknown/i.test(message) ||
    /current location is unknown/i.test(message)
  )
}

export const isLocationOffError = (error: unknown): boolean => {
  if (codeOf(error) === 1) return true
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
