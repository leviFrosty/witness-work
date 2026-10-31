import { HttpError } from '@/lib/http/request'
import {
  AccountSessionError,
  type AttestationProblem,
  OPEN_RETRY_AFTER_MS,
} from '@/lib/serverAccount/session'

/**
 * Why a bearer call to a ww-api service failed, in the service's own words: one
 * of its error codes, or what happened before it could answer.
 *
 * - `network`: it never reached the service (or a session couldn't be opened for
 *   want of a connection).
 * - `timeout`: no answer in time.
 * - `cancelled`: the caller gave up.
 * - `unverified`: this device couldn't prove it's WitnessWork, so it has no
 *   session.
 * - `unknown`: anything else.
 *
 * `upgrade_required`, `disabled`, `rate_limited` and `unauthorized` come from
 * the session as well as from the service, so every service's code list has
 * them.
 */
export type BearerTransportCode =
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'unverified'
  | 'unknown'

export type BearerSessionCode =
  | 'upgrade_required'
  | 'disabled'
  | 'rate_limited'
  | 'unauthorized'

export type BearerFailure<C extends string> = {
  code: C | BearerSessionCode | BearerTransportCode
  status: number
  /** How long the service (or the session) asked callers to wait, if it did. */
  retryAfterMs: number | null
  /** For `unverified`: whether it can't ever, or only couldn't now. */
  attestation: AttestationProblem | null
}

/** A failure any service's code list has. */
const failure = (
  code: BearerSessionCode | BearerTransportCode,
  status: number,
  retryAfterMs: number | null = null,
  attestation: AttestationProblem | null = null
): BearerFailure<never> => ({ code, status, retryAfterMs, attestation })

/** No session to send with, in the service's words. */
function sessionFailure(error: AccountSessionError): BearerFailure<never> {
  const status = error.status ?? 0
  switch (error.failure) {
    case 'offline':
      return failure('network', 0)
    case 'cancelled':
      return failure('cancelled', 0)
    case 'attestation': {
      // The session waits this long before attesting again by itself.
      const problem = error.attestation ?? 'failed'
      return failure(
        'unverified',
        status,
        OPEN_RETRY_AFTER_MS[problem],
        problem
      )
    }
    case 'upgrade':
      return failure('upgrade_required', status || 426)
    case 'unavailable':
      // Accounts are off on the server, and the service needs one.
      return failure(
        error.serverCode === 'disabled' ? 'disabled' : 'unknown',
        status,
        error.retryAfterMs
      )
    case 'rateLimited':
      return failure('rate_limited', status || 429, error.retryAfterMs)
    case 'server':
      return failure(
        status === 401 ? 'unauthorized' : 'unknown',
        status,
        error.retryAfterMs
      )
  }
}

/**
 * A failed `request()` made through `accountSessions.withSession`, or no
 * session for it, as the service's own code from `codes`. Never carries the
 * request's URL, body or token, so it's safe to log.
 */
export function bearerFailure<C extends string>(
  error: unknown,
  codes: readonly C[]
): BearerFailure<C> {
  if (error instanceof AccountSessionError) return sessionFailure(error)
  if (!(error instanceof HttpError)) return failure('network', 0)
  switch (error.kind) {
    case 'offline':
      return failure('network', 0)
    case 'timeout':
      // A 408 is the server's; anything else never got an answer.
      return failure('timeout', error.status ?? 0)
    case 'cancelled':
      return failure('cancelled', 0)
  }
  const code = codes.find((known) => known === error.serverCode)
  return {
    code: code ?? (error.status === 429 ? 'rate_limited' : 'unknown'),
    status: error.status ?? 0,
    retryAfterMs: error.retryAfterMs,
    attestation: null,
  }
}
