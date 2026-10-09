import { errorTracking } from '@/lib/errorTracking'

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
  const now = Date.now()
  const last = lastReportedAt.get(key)
  if (last !== undefined && now - last < intervalMs) return
  lastReportedAt.set(key, now)
  errorTracking.captureException(error, properties)
}
