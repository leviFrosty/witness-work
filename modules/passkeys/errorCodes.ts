export type PasskeyErrorCode =
  | 'cancelled'
  | 'not_supported'
  | 'no_credentials'
  | 'timeout'
  | 'domain_not_associated'
  | 'already_registered'
  | 'failed'

export class NativePasskeyError extends Error {
  readonly code: PasskeyErrorCode

  readonly nativeMessage: string | null

  constructor(code: PasskeyErrorCode, nativeMessage: string | null = null) {
    super(`Passkey operation failed (${code})`)
    this.name = 'NativePasskeyError'
    this.code = code
    this.nativeMessage = nativeMessage
  }
}

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

export const fromNativeError = (error: unknown): NativePasskeyError => {
  if (error instanceof NativePasskeyError) return error
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : null
  return new NativePasskeyError(codeFromNativeError(error), message)
}
