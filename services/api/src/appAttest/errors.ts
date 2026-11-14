export type AppAttestReason =
  | 'invalid_request'
  | 'unsupported_protocol'
  | 'operation_conflict'
  | 'too_many_challenges'
  | 'challenge_not_found'
  | 'challenge_expired'
  | 'identity_not_bound'
  | 'key_not_active'
  | 'recovery_not_enrolled'
  | 'recovery_token_mismatch'
  | 'attestation_invalid'
  | 'assertion_invalid'
  | 'counter_not_increasing'
  | 'storage_unavailable'

export type AppAttestAction =
  | 'none'
  | 'retry'
  | 'request_challenge'
  | 'start_new_operation'
  | 'bind'
  | 'enroll_recovery'
  | 'use_active_key'

export interface AppAttestFailure {
  reason: AppAttestReason
  action: AppAttestAction
  message: string
  status: number
}

const V1_NON_ROTATING_CODES: Partial<Record<AppAttestReason, string>> = {
  assertion_invalid: 'assertion_failed',
  challenge_not_found: 'challenge_expired',
  challenge_expired: 'challenge_expired',
  counter_not_increasing: 'counter_conflict',
}

/**
 * Legacy clients rotate their Secure Enclave key for only two top-level codes.
 * Preserve useful v1 failures without misclassifying them as key loss.
 */
export const appAttestHttpCode = (
  protocolVersion: 1 | 2 | null,
  reason: AppAttestReason
): string => {
  if (reason === 'storage_unavailable') return 'server_error'
  if (protocolVersion === 1) {
    // The deployed client interprets `attestation_failed`/`required` as an
    // instruction to discard its key. That is never safe with a permanently
    // pinned legacy UUID, including when the key is unknown or inactive.
    return V1_NON_ROTATING_CODES[reason] ?? 'device_verification_failed'
  }
  return 'attestation_failed'
}

/**
 * Stable App Attest failure surfaced by the lifecycle module. Route callers keep
 * the legacy `error`/`code` fields and add `reason`/`action` from this error.
 */
export class AppAttestError extends Error {
  readonly reason: AppAttestReason
  readonly action: AppAttestAction
  readonly status: number

  constructor(
    message: string,
    options: {
      reason?: AppAttestReason
      action?: AppAttestAction
      status?: number
      cause?: unknown
    } = {}
  ) {
    super(message, options.cause == null ? undefined : { cause: options.cause })
    this.name = 'AppAttestError'
    this.reason = options.reason ?? 'assertion_invalid'
    this.action = options.action ?? 'none'
    this.status = options.status ?? 401
  }

  static fromFailure(failure: AppAttestFailure): AppAttestError {
    return new AppAttestError(failure.message, failure)
  }
}
