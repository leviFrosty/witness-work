/**
 * Native → JS error taxonomy for the Google Drive authorization module.
 *
 * Deliberately free of native imports so the classifier stays unit-testable and
 * the sync transport can import it without loading the native module.
 */

export type GoogleDriveAuthErrorCode =
  /** Not Android, no Google Play services, or no activity to show UI on. */
  | 'unavailable'
  /** The user closed Google's account picker or consent screen. */
  | 'canceled'
  /** A silent request needs the user: never granted, revoked, or expired. */
  | 'consentRequired'
  /** The user declined the Drive permission on the consent screen. */
  | 'scopeDenied'
  | 'network'
  /**
   * No Android OAuth client in the Cloud project matches this package name and
   * signing certificate (Google's DEVELOPER_ERROR).
   */
  | 'misconfigured'
  | 'unknown'

export class GoogleDriveAuthError extends Error {
  readonly code: GoogleDriveAuthErrorCode

  constructor(code: GoogleDriveAuthErrorCode) {
    super(`Google Drive authorization failed (${code})`)
    this.name = 'GoogleDriveAuthError'
    this.code = code
  }
}

/** The stable tokens `GoogleDriveAuthModule.kt` rejects with. */
const NATIVE_TOKENS = {
  GOOGLE_DRIVE_AUTH_UNAVAILABLE: 'unavailable',
  GOOGLE_DRIVE_AUTH_CANCELED: 'canceled',
  GOOGLE_DRIVE_AUTH_CONSENT_REQUIRED: 'consentRequired',
  GOOGLE_DRIVE_AUTH_SCOPE_DENIED: 'scopeDenied',
  GOOGLE_DRIVE_AUTH_NETWORK: 'network',
  GOOGLE_DRIVE_AUTH_MISCONFIGURED: 'misconfigured',
  GOOGLE_DRIVE_AUTH_UNKNOWN: 'unknown',
} as const satisfies Record<string, GoogleDriveAuthErrorCode>

const TOKEN_PATTERN = /GOOGLE_DRIVE_AUTH_[A-Z_]+/

const tokenCode = (value: string): GoogleDriveAuthErrorCode | null =>
  value in NATIVE_TOKENS
    ? NATIVE_TOKENS[value as keyof typeof NATIVE_TOKENS]
    : null

/**
 * Classifies a rejection by our own constant — from `code`, else from the
 * message. Never inspects a system-localized string.
 */
export const googleDriveAuthErrorCode = (
  error: unknown
): GoogleDriveAuthErrorCode => {
  if (error instanceof GoogleDriveAuthError) return error.code
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
