export type GoogleDriveAuthErrorCode =
  | 'unavailable'
  | 'canceled'
  | 'consentRequired'
  | 'scopeDenied'
  | 'network'
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
