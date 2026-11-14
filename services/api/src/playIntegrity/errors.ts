/**
 * Stable Play Integrity failure reasons. The first group mirrors App Attest's
 * challenge semantics so the client's retry logic reads the same; the second
 * names the Play-specific verdicts. Wire `reason` values only — never verdict
 * payloads, tokens, or ids.
 */
export type PlayIntegrityReason =
  | 'invalid_request'
  | 'too_many_challenges'
  | 'operation_conflict'
  | 'challenge_not_found'
  | 'challenge_expired'
  | 'storage_unavailable'
  /** Not configured, or Google could not decode right now. Retryable later. */
  | 'integrity_unavailable'
  /** The token is malformed, stale, for another app, or bound to other data. */
  | 'integrity_token_invalid'
  /** Not the Play-distributed binary (or an unexpected signing certificate). */
  | 'app_not_recognized'
  /** The device does not meet the required device-integrity verdict. */
  | 'device_integrity_failed'

export type PlayIntegrityAction = 'none' | 'retry' | 'start_new_operation'

export interface PlayIntegrityFailure {
  reason: PlayIntegrityReason
  action: PlayIntegrityAction
  message: string
  status: number
}

const FAILURES: Record<
  PlayIntegrityReason,
  Omit<PlayIntegrityFailure, 'reason' | 'message'>
> = {
  invalid_request: { action: 'none', status: 400 },
  too_many_challenges: { action: 'retry', status: 429 },
  operation_conflict: { action: 'start_new_operation', status: 409 },
  challenge_not_found: { action: 'start_new_operation', status: 401 },
  challenge_expired: { action: 'start_new_operation', status: 401 },
  storage_unavailable: { action: 'retry', status: 503 },
  integrity_unavailable: { action: 'retry', status: 503 },
  integrity_token_invalid: { action: 'start_new_operation', status: 401 },
  app_not_recognized: { action: 'none', status: 403 },
  device_integrity_failed: { action: 'none', status: 403 },
}

export const playIntegrityFailure = (
  reason: PlayIntegrityReason,
  message: string
): PlayIntegrityFailure => ({ reason, message, ...FAILURES[reason] })

export class PlayIntegrityError extends Error {
  readonly reason: PlayIntegrityReason
  readonly action: PlayIntegrityAction
  readonly status: number

  constructor(
    reason: PlayIntegrityReason,
    message: string,
    options: { cause?: unknown } = {}
  ) {
    super(message, options.cause == null ? undefined : { cause: options.cause })
    this.name = 'PlayIntegrityError'
    const failure = playIntegrityFailure(reason, message)
    this.reason = failure.reason
    this.action = failure.action
    this.status = failure.status
  }

  static fromFailure(failure: PlayIntegrityFailure): PlayIntegrityError {
    return new PlayIntegrityError(failure.reason, failure.message)
  }
}
