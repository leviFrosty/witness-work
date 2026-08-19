/**
 * Native → JS error taxonomy for the App Attest module.
 *
 * Deliberately free of native imports: the classifier is the one piece of this
 * module that encodes lifecycle-relevant decisions, so it stays unit-testable
 * without an Expo runtime.
 */

export type AppAttestErrorCode =
  | 'unsupported'
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

/**
 * The stable, non-localized tokens `AppAttestModule.swift` rejects with. The
 * Swift side sends each one twice — as the rejection's `code` and inside its
 * message — so `codeFromNativeError` has two independent ways to read it.
 */
const NATIVE_TOKENS = {
  APP_ATTEST_UNSUPPORTED: 'unsupported',
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

/**
 * Classifies a rejection from the native module.
 *
 * `code` is the intended channel, but expo-modules-jsi before 57.0.2 dropped it
 * whenever an `AsyncFunction` rejected its promise: `JavaScriptPromise.reject`
 * recognized `JavaScriptError` only and never `JavaScriptThrowable`, so the
 * `Exception` carrying the code was stringified into a bare `Error`. Every
 * native failure then collapsed to `unknown`, which erased `invalidKey` — the
 * signal the Notes Import lifecycle uses to re-register a dead key — and left
 * shipped builds unable to recover.
 *
 * Reading the token back out of the message keeps that class of regression from
 * silently costing us the taxonomy again. It inspects our own constant, never a
 * system-localized string, so lifecycle decisions stay locale-independent.
 */
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
