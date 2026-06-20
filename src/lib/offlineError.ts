/**
 * Detects "device is offline" errors so they can be treated as an expected,
 * handled condition instead of being reported to Sentry as crashes.
 *
 * RevenueCat / React Native native modules surface offline failures with the
 * message "Error performing request because the internet connection appears to
 * be offline." These are not bugs — the user simply has no connection — but
 * because they bubble up as rejected promises they would otherwise flood Sentry
 * (see JW-TIME-5B / JW-TIME-BW), with one user offline for a while generating
 * hundreds of duplicate events.
 */
const OFFLINE_MESSAGE_PATTERNS = [
  'internet connection appears to be offline',
  'network connection was lost',
  'the request timed out',
]

export const isOfflineError = (error: unknown): boolean => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ((error as { message?: unknown })?.message ?? '')

  if (typeof message !== 'string') return false

  const lower = message.toLowerCase()
  return OFFLINE_MESSAGE_PATTERNS.some((pattern) => lower.includes(pattern))
}
