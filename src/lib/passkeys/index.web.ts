import {
  WebAuthnError,
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser'
import { PasskeyError, type PasskeyErrorCode } from '@/lib/passkeys/errors'
import {
  PRF_SALT,
  toCreatedPasskey,
  toPasskeyAssertion,
  withPrfSalt,
} from '@/lib/passkeys/prf'
import type {
  CreatedPasskey,
  PasskeyAssertion,
  PasskeySupport,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@/lib/passkeys/types'

export { PasskeyError, type PasskeyErrorCode } from '@/lib/passkeys/errors'
export { PRF_SALT } from '@/lib/passkeys/prf'
export type * from '@/lib/passkeys/types'

/** The browser is the platform; there's no module to link. */
export function passkeysLinked(): boolean {
  return true
}

/** WebAuthn L3's `getClientCapabilities()`, where the browser has it. */
type CapabilitiesSource = {
  getClientCapabilities?: () => Promise<Record<string, boolean | undefined>>
}

/** Passkeys in the browser, through `@simplewebauthn/browser`. */
export async function passkeySupport(): Promise<PasskeySupport> {
  if (!browserSupportsWebAuthn()) return { passkeys: false, prf: 'no' }
  let prf: boolean | undefined
  try {
    const source =
      globalThis.PublicKeyCredential as unknown as CapabilitiesSource
    prf = (await source.getClientCapabilities?.())?.['extension:prf']
  } catch {
    prf = undefined
  }
  return {
    passkeys: true,
    prf: prf === true ? 'yes' : prf === false ? 'no' : 'unknown',
  }
}

const SIMPLEWEBAUTHN_CODES: Partial<
  Record<WebAuthnError['code'], PasskeyErrorCode>
> = {
  ERROR_CEREMONY_ABORTED: 'cancelled',
  ERROR_INVALID_DOMAIN: 'domain_not_associated',
  ERROR_INVALID_RP_ID: 'domain_not_associated',
  ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED: 'already_registered',
  ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT: 'not_supported',
  ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT: 'not_supported',
  ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG: 'not_supported',
}

/** WebAuthn's DOMException names. A browser reports a timeout as NotAllowed. */
const DOM_CODES: Record<string, PasskeyErrorCode> = {
  NotAllowedError: 'cancelled',
  AbortError: 'cancelled',
  TimeoutError: 'timeout',
  SecurityError: 'domain_not_associated',
  NotSupportedError: 'not_supported',
}

const toPasskeyError = (error: unknown): PasskeyError => {
  if (error instanceof PasskeyError) return error
  const fromLibrary =
    error instanceof WebAuthnError
      ? SIMPLEWEBAUTHN_CODES[error.code]
      : undefined
  const name = error instanceof Error ? error.name : undefined
  const message = error instanceof Error ? error.message : String(error)
  return new PasskeyError(
    fromLibrary ?? (name ? DOM_CODES[name] : undefined) ?? 'failed',
    message
  )
}

const run = async <T>(operation: () => Promise<T>): Promise<T> => {
  if (!browserSupportsWebAuthn()) throw new PasskeyError('not_supported')
  try {
    return await operation()
  } catch (error) {
    throw toPasskeyError(error)
  }
}

/**
 * A fresh copy of `PRF_SALT` as its own `ArrayBuffer`: simplewebauthn passes
 * extensions to the browser as they are.
 */
const saltBuffer = (): ArrayBuffer => PRF_SALT.slice().buffer

export async function createPasskey(
  options: PublicKeyCredentialCreationOptionsJSON
): Promise<CreatedPasskey> {
  return toCreatedPasskey(
    await run(() =>
      startRegistration({ optionsJSON: withPrfSalt(options, saltBuffer()) })
    )
  )
}

export async function getPasskey(
  options: PublicKeyCredentialRequestOptionsJSON
): Promise<PasskeyAssertion> {
  return toPasskeyAssertion(
    await run(() =>
      startAuthentication({ optionsJSON: withPrfSalt(options, saltBuffer()) })
    )
  )
}
