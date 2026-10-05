/**
 * Native → JS error taxonomy for the Play Integrity module. Mirrors Play's
 * `StandardIntegrityErrorCode` one-to-one; grouping them into lifecycle
 * decisions is the Notes Import module's job.
 *
 * Deliberately free of native imports so the classifier stays unit-testable.
 */

export type PlayIntegrityErrorCode =
  /** Not Android, or the native module isn't in this binary. */
  | 'unsupported'
  /** This module rejected the arguments before Play saw them. */
  | 'invalidArgument'
  | 'apiNotAvailable'
  | 'playStoreNotFound'
  | 'network'
  | 'appNotInstalled'
  | 'playServicesNotFound'
  | 'appUidMismatch'
  | 'tooManyRequests'
  | 'cannotBindToService'
  | 'googleServerUnavailable'
  | 'playStoreOutdated'
  | 'playServicesOutdated'
  | 'cloudProjectNumberInvalid'
  | 'requestHashTooLong'
  | 'clientTransient'
  /** Still invalid after the native side re-prepared the provider once. */
  | 'providerInvalid'
  | 'internal'
  | 'unknown'

export class PlayIntegrityError extends Error {
  readonly code: PlayIntegrityErrorCode

  constructor(code: PlayIntegrityErrorCode) {
    super(`Play Integrity operation failed (${code})`)
    this.name = 'PlayIntegrityError'
    this.code = code
  }
}

/** The stable tokens `PlayIntegrityModule.kt` rejects with. */
const NATIVE_TOKENS = {
  PLAY_INTEGRITY_INVALID_ARGUMENT: 'invalidArgument',
  PLAY_INTEGRITY_API_NOT_AVAILABLE: 'apiNotAvailable',
  PLAY_INTEGRITY_PLAY_STORE_NOT_FOUND: 'playStoreNotFound',
  PLAY_INTEGRITY_NETWORK_ERROR: 'network',
  PLAY_INTEGRITY_APP_NOT_INSTALLED: 'appNotInstalled',
  PLAY_INTEGRITY_PLAY_SERVICES_NOT_FOUND: 'playServicesNotFound',
  PLAY_INTEGRITY_APP_UID_MISMATCH: 'appUidMismatch',
  PLAY_INTEGRITY_TOO_MANY_REQUESTS: 'tooManyRequests',
  PLAY_INTEGRITY_CANNOT_BIND_TO_SERVICE: 'cannotBindToService',
  PLAY_INTEGRITY_GOOGLE_SERVER_UNAVAILABLE: 'googleServerUnavailable',
  PLAY_INTEGRITY_PLAY_STORE_VERSION_OUTDATED: 'playStoreOutdated',
  PLAY_INTEGRITY_PLAY_SERVICES_VERSION_OUTDATED: 'playServicesOutdated',
  PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER_IS_INVALID: 'cloudProjectNumberInvalid',
  PLAY_INTEGRITY_REQUEST_HASH_TOO_LONG: 'requestHashTooLong',
  PLAY_INTEGRITY_CLIENT_TRANSIENT_ERROR: 'clientTransient',
  PLAY_INTEGRITY_TOKEN_PROVIDER_INVALID: 'providerInvalid',
  PLAY_INTEGRITY_INTERNAL_ERROR: 'internal',
  PLAY_INTEGRITY_UNKNOWN: 'unknown',
} as const satisfies Record<string, PlayIntegrityErrorCode>

const TOKEN_PATTERN = /PLAY_INTEGRITY_[A-Z_]+/

const tokenCode = (value: string): PlayIntegrityErrorCode | null =>
  value in NATIVE_TOKENS
    ? NATIVE_TOKENS[value as keyof typeof NATIVE_TOKENS]
    : null

/**
 * Classifies a rejection from the native module by our own constant — from
 * `code`, else from the message (see `modules/app-attest/errorCodes.ts` for why
 * both channels are read). Never inspects a system-localized string.
 */
export const codeFromNativeError = (error: unknown): PlayIntegrityErrorCode => {
  if (error instanceof PlayIntegrityError) return error.code
  if (typeof error !== 'object' || error === null) return 'unknown'

  const { code, message } = error as { code?: unknown; message?: unknown }
  if (typeof code === 'string') {
    const fromCode = tokenCode(code)
    if (fromCode) return fromCode
  }
  if (typeof message === 'string') {
    const token = TOKEN_PATTERN.exec(message)?.[0]
    if (token) {
      const fromMessage = tokenCode(token)
      if (fromMessage) return fromMessage
    }
  }
  return 'unknown'
}
