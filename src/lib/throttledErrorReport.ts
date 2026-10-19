import { errorTracking } from '@/lib/errorTracking'
import { shouldIgnoreError } from '@/lib/errorTrackingPolicy'

const DEFAULT_INTERVAL_MS = 60 * 60_000
const lastReportedAt = new Map<string, number>()

/**
 * Reports `error` at most once per `key` per `intervalMs` (an hour by default),
 * for failures that would otherwise repeat on every push or wake.
 */
export function captureExceptionThrottled(
  key: string,
  error: unknown,
  properties?: Record<string, unknown>,
  intervalMs = DEFAULT_INTERVAL_MS
): void {
  // Expected device states (offline, storage full) aren't reported, so they
  // mustn't use up the key's slot and hide a real failure behind them.
  if (shouldIgnoreError(error)) {
    errorTracking.captureException(error, properties)
    return
  }
  const now = Date.now()
  const last = lastReportedAt.get(key)
  if (last !== undefined && now - last < intervalMs) return
  lastReportedAt.set(key, now)
  errorTracking.captureException(error, properties)
}
