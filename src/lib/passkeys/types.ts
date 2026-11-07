import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser'

export type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
}

export type { PasskeySupport } from '../../../modules/passkeys'

export type CreatedPasskey = {
  response: RegistrationResponseJSON
  prf: {
    enabled: boolean | null

    first: Uint8Array | null
  }
}

export type PasskeyAssertion = {
  response: AuthenticationResponseJSON

  prf: Uint8Array | null
}
