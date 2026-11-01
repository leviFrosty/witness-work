export type AppAttestErrorCode =
  | 'unsupported'
  | 'invalidArgument'
  | 'invalidInput'
  | 'invalidKey'
  | 'serverUnavailable'
  | 'systemFailure'
  | 'unknown'

export class AppAttestError extends Error {
  readonly code: AppAttestErrorCode

  constructor(code: AppAttestErrorCode) {
    super(`App Attest operation failed (${code})`)
    this.name = 'AppAttestError'
    this.code = code
  }
}

const NATIVE_TOKENS = {
  APP_ATTEST_UNSUPPORTED: 'unsupported',
  APP_ATTEST_INVALID_ARGUMENT: 'invalidArgument',
  APP_ATTEST_INVALID_INPUT: 'invalidInput',
  APP_ATTEST_INVALID_KEY: 'invalidKey',
  APP_ATTEST_SERVER_UNAVAILABLE: 'serverUnavailable',
  APP_ATTEST_SYSTEM_FAILURE: 'systemFailure',
  APP_ATTEST_UNKNOWN: 'unknown',
} as const satisfies Record<string, AppAttestErrorCode>

const TOKEN_PATTERN = /APP_ATTEST_[A-Z_]+/

const tokenCode = (value: string): AppAttestErrorCode | null =>
  value in NATIVE_TOKENS
    ? NATIVE_TOKENS[value as keyof typeof NATIVE_TOKENS]
    : null

export const codeFromNativeError = (error: unknown): AppAttestErrorCode => {
  if (error instanceof AppAttestError) return error.code
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
