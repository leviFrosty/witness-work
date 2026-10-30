import type { PasskeyErrorCode } from '../../../modules/passkeys/errorCodes'

// One set of codes for phones and the web; the module owns them. Type-only, so
// the web never loads native code.
export type { PasskeyErrorCode }

/**
 * A passkey ceremony that didn't produce a credential. Callers branch on
 * `code`; `message` carries the platform's text for logs and never secrets.
 */
export class PasskeyError extends Error {
  readonly code: PasskeyErrorCode

  constructor(code: PasskeyErrorCode, message?: string | null) {
    super(message ? `Passkey ${code}: ${message}` : `Passkey ${code}`)
    this.name = 'PasskeyError'
    this.code = code
  }
}
