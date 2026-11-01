import { errorTracking } from '@/lib/errorTracking'
import { shouldIgnoreError } from '@/lib/errorTrackingPolicy'

const DEFAULT_INTERVAL_MS = 60 * 60_000
const lastReportedAt = new Map<string, number>()

export function captureExceptionThrottled(
  key: string,
  error: unknown,
  properties?: Record<string, unknown>,
  intervalMs = DEFAULT_INTERVAL_MS
): void {
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
