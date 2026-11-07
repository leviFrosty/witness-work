import type { PasskeyErrorCode } from '../../../modules/passkeys/errorCodes'

export type { PasskeyErrorCode }

export class PasskeyError extends Error {
  readonly code: PasskeyErrorCode

  constructor(code: PasskeyErrorCode, message?: string | null) {
    super(message ? `Passkey ${code}: ${message}` : `Passkey ${code}`)
    this.name = 'PasskeyError'
    this.code = code
  }
}
