import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser'

// WebAuthn's JSON forms, base64url throughout. Types only: native code never
// loads the browser package.
export type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
}

/** `prf` is `unknown` where only a ceremony can tell (Android, some browsers). */
export type { PasskeySupport } from '../../../modules/passkeys'

export type CreatedPasskey = {
  /** What the server gets: `clientExtensionResults.prf` is always removed. */
  response: RegistrationResponseJSON
  prf: {
    /** Whether the passkey supports PRF; null when the platform didn't say. */
    enabled: boolean | null
    /** The PRF output, when the platform answers it at creation already. */
    first: Uint8Array | null
  }
}

export type PasskeyAssertion = {
  /** What the server gets: `clientExtensionResults.prf` is always removed. */
  response: AuthenticationResponseJSON
  /** The PRF output; null for a passkey that only signs in. */
  prf: Uint8Array | null
}
