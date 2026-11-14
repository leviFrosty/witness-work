import { apiError, dateHeader } from '../errors'
import { BUDDIES_ERROR_STATUS, type BuddiesErrorCode } from './contracts'
import { KILL_SWITCH_RETRY_AFTER_SECONDS } from './killSwitch'
import { EDGE_RETRY_AFTER_SECONDS } from './limits'

/**
 * Seconds to wait when a refusal didn't compute its own: the kill switches
 * are read through a 60-second cache, and the edge limiters' window is a minute.
 * `limit` (slot and open-invite caps) has none: only the User's own action
 * frees a spot, never time.
 */
const DEFAULT_RETRY_AFTER: Partial<Record<BuddiesErrorCode, number>> = {
  disabled: KILL_SWITCH_RETRY_AFTER_SECONDS,
  photos_disabled: KILL_SWITCH_RETRY_AFTER_SECONDS,
  rate_limited: EDGE_RETRY_AFTER_SECONDS,
  unavailable: 30,
}

/** What every `unauthorized` refusal tells the client (RFC 6750). */
export const BEARER_CHALLENGE = 'Bearer error="invalid_token"'

/**
 * A relay error in the shared envelope: `{ ok: false, error, code }` with the
 * protocol's code in both. Every 429 `rate_limited` and 503 `disabled` or
 * `photos_disabled` sends `Retry-After` (and `retryAfter`). `stale` carries the server clock, as a
 * `Date` header and `serverTime` (epoch ms, the unit of `ts`), so the client
 * can correct its offset and re-sign. `unauthorized` sends
 * `WWW-Authenticate`. `extras` adds fields beside the envelope (`reason` and
 * `action` on `attestation_failed`).
 */
export const buddiesErrorResponse = (
  error: BuddiesErrorCode,
  options: {
    retryAfterSeconds?: number
    now?: number
    extras?: Record<string, unknown>
  } = {}
): Response => {
  const now = options.now ?? Date.now()
  const stale = error === 'stale'
  return apiError(BUDDIES_ERROR_STATUS[error], error, {
    retryAfter: options.retryAfterSeconds ?? DEFAULT_RETRY_AFTER[error],
    extras: stale ? { ...options.extras, serverTime: now } : options.extras,
    headers: stale
      ? dateHeader(now)
      : error === 'unauthorized'
        ? { 'WWW-Authenticate': BEARER_CHALLENGE }
        : undefined,
  })
}

/** An unexpected failure; the body never names the request. */
export const buddiesInternalError = (): Response => apiError(500, 'internal')
