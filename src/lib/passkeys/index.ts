import { toB64u } from '@/lib/bytes'
import { PasskeyError } from '@/lib/passkeys/errors'
import {
  PRF_SALT,
  toCreatedPasskey,
  toPasskeyAssertion,
  withPrfSalt,
} from '@/lib/passkeys/prf'
import type {
  AuthenticationResponseJSON,
  CreatedPasskey,
  PasskeyAssertion,
  PasskeySupport,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@/lib/passkeys/types'
import * as Passkeys from '../../../modules/passkeys'
import { NativePasskeyError } from '../../../modules/passkeys/errorCodes'

export { PasskeyError, type PasskeyErrorCode } from '@/lib/passkeys/errors'
export { PRF_SALT } from '@/lib/passkeys/prf'
export type * from '@/lib/passkeys/types'

// Passkeys on phones, through `modules/passkeys`. The web is `index.web.ts`.

/** Whether this binary has the module; OTA bundles can run on older ones. */
export function passkeysLinked(): boolean {
  return Passkeys.isAvailable()
}

export async function passkeySupport(): Promise<PasskeySupport> {
  try {
    return await Passkeys.getSupport()
  } catch {
    return { passkeys: false, prf: 'no' }
  }
}

const SALT_B64U = toB64u(PRF_SALT)

const run = async (operation: () => Promise<string>): Promise<string> => {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof NativePasskeyError) {
      throw new PasskeyError(error.code, error.nativeMessage)
    }
    throw new PasskeyError('failed', String(error))
  }
}

/**
 * Creates a passkey, evaluating PRF with `PRF_SALT`. The response is for the
 * server, without PRF; the PRF facts come back separately.
 */
export async function createPasskey(
  options: PublicKeyCredentialCreationOptionsJSON
): Promise<CreatedPasskey> {
  const json = await run(() =>
    Passkeys.create(JSON.stringify(withPrfSalt(options, SALT_B64U)))
  )
  return toCreatedPasskey(JSON.parse(json) as RegistrationResponseJSON)
}

/** Signs in with a passkey, evaluating PRF with `PRF_SALT`. */
export async function getPasskey(
  options: PublicKeyCredentialRequestOptionsJSON
): Promise<PasskeyAssertion> {
  const json = await run(() =>
    Passkeys.get(JSON.stringify(withPrfSalt(options, SALT_B64U)))
  )
  return toPasskeyAssertion(JSON.parse(json) as AuthenticationResponseJSON)
}
