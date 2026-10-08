import { isConnectivityError } from '@/lib/http/networkError'

/**
 * Detects "device is offline" errors so they can be treated as an expected,
 * handled condition instead of being reported to error tracking as crashes.
 *
 * Offline users otherwise flood error tracking (see JW-TIME-5B / JW-TIME-BW):
 * one user offline for a while generated hundreds of duplicate events. Covers
 * timeouts and cancellations too, and every client's wording; see
 * `classifyNetworkError`.
 */
export const isOfflineError = (error: unknown): boolean =>
  isConnectivityError(error)
