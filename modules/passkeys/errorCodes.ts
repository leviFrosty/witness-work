/**
 * Native → JS error taxonomy for the passkeys module.
 *
 * Deliberately free of native imports so the classifier stays unit-testable
 * without an Expo runtime.
 */

export type PasskeyErrorCode =
  /** The User closed the sheet, or the platform reported it as a cancel. */
  | 'cancelled'
  /** No passkey support here: old OS, no provider, or no screen lock. */
  | 'not_supported'
  /** A sign-in found no passkey for this RP on the device or its providers. */
  | 'no_credentials'
  /** The native timeout fired while the system sheet was up. */
  | 'timeout'
  /** The app isn't associated with the RP ID (AASA or asset links). */
  | 'domain_not_associated'
  /** A passkey in `excludeCredentials` is already on this device or provider. */
  | 'already_registered'
  | 'failed'

export class NativePasskeyError extends Error {
  readonly code: PasskeyErrorCode
  /** The platform's own message, for logs only. Never classify on it. */
  readonly nativeMessage: string | null

  constructor(code: PasskeyErrorCode, nativeMessage: string | null = null) {
    super(`Passkey operation failed (${code})`)
    this.name = 'NativePasskeyError'
    this.code = code
    this.nativeMessage = nativeMessage
  }
}

/**
 * The stable tokens `PasskeysModule.swift` and `PasskeysModule.kt` reject with,
 * sent both as the rejection's `code` and inside its message (see
 * `modules/app-attest/errorCodes.ts` for why both channels are read).
 */
const NATIVE_TOKENS = {
  PASSKEY_CANCELLED: 'cancelled',
  PASSKEY_NOT_SUPPORTED: 'not_supported',
  PASSKEY_NO_CREDENTIALS: 'no_credentials',
  PASSKEY_TIMEOUT: 'timeout',
  PASSKEY_DOMAIN_NOT_ASSOCIATED: 'domain_not_associated',
  PASSKEY_ALREADY_REGISTERED: 'already_registered',
  PASSKEY_FAILED: 'failed',
} as const satisfies Record<string, PasskeyErrorCode>

const TOKEN_PATTERN = /PASSKEY_[A-Z_]+/

const tokenCode = (value: string): PasskeyErrorCode | null =>
  value in NATIVE_TOKENS
    ? NATIVE_TOKENS[value as keyof typeof NATIVE_TOKENS]
    : null

/**
 * Classifies a rejection from the native module by our own constant, from
 * `code`, else from the message. Anything else is `failed`.
 */
export const codeFromNativeError = (error: unknown): PasskeyErrorCode => {
  if (error instanceof NativePasskeyError) return error.code
  if (typeof error !== 'object' || error === null) return 'failed'

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
  return 'failed'
}

/** The rejection as a `NativePasskeyError`, keeping the native message for logs. */
export const fromNativeError = (error: unknown): NativePasskeyError => {
  if (error instanceof NativePasskeyError) return error
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : null
  return new NativePasskeyError(codeFromNativeError(error), message)
}
