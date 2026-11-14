import { base64ToBytes, sha256Bytes } from '../crypto'
import {
  decodeAssertion,
  parseAssertionAuthData,
  type ParsedAuthData,
} from './decode'
import { derEcdsaSignatureToRaw } from './der'
import { appIdRpHash, bytesEqual } from './appId'
import { AppAttestError } from './errors'

const ECDSA_P256 = { name: 'ECDSA', namedCurve: 'P-256' } as const

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

export interface VerifyAssertionCryptographyArgs {
  /** Base64 of the CBOR assertion from `DCAppAttestService.generateAssertion`. */
  assertion: string
  /** Base64url SPKI from the key's verified Apple attestation. */
  spki: string
  /** Exact domain-separated client data whose SHA-256 the app asserted. */
  clientData: string
  teamId: string
  bundleId: string
}

export interface VerifiedAssertion {
  signCount: number
}

/**
 * Pure App Attest assertion verification. Identity ownership, challenge replay,
 * and monotonic counter policy deliberately live in the lifecycle module.
 */
export const verifyAssertionCryptography = async ({
  assertion,
  spki,
  clientData,
  teamId,
  bundleId,
}: VerifyAssertionCryptographyArgs): Promise<VerifiedAssertion> => {
  let asn
  let parsed: ParsedAuthData
  try {
    asn = decodeAssertion(base64ToBytes(assertion))
    parsed = parseAssertionAuthData(asn.authenticatorData)
  } catch (e) {
    throw new AppAttestError(`malformed assertion: ${(e as Error).message}`, {
      reason: 'assertion_invalid',
      cause: e,
    })
  }

  const expectedRpId = await appIdRpHash(teamId, bundleId)
  if (!bytesEqual(parsed.rpIdHash, expectedRpId)) {
    throw new AppAttestError('rpIdHash mismatch (wrong app id)', {
      reason: 'assertion_invalid',
    })
  }

  const clientDataHash = await sha256Bytes(new TextEncoder().encode(clientData))
  // Apple signs the NONCE ITSELF as the to-be-signed message — the ECDSA
  // digest is SHA256(nonce) = SHA256(SHA256(authData || clientDataHash)), one
  // hash layer more than WebAuthn's assertion scheme. Verified against a real
  // device capture in assertion.test.ts.
  const nonce = await sha256Bytes(concat(asn.authenticatorData, clientDataHash))

  let verifyKey: CryptoKey
  try {
    verifyKey = await crypto.subtle.importKey(
      'spki',
      base64ToBytes(spki),
      ECDSA_P256,
      false,
      ['verify']
    )
  } catch (e) {
    throw new AppAttestError('stored device key is invalid', {
      reason: 'assertion_invalid',
      cause: e,
    })
  }

  let rawSig: Uint8Array
  try {
    rawSig = derEcdsaSignatureToRaw(asn.signature)
  } catch (e) {
    throw new AppAttestError(`malformed assertion signature: ${(e as Error).message}`, {
      reason: 'assertion_invalid',
      cause: e,
    })
  }

  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    verifyKey,
    rawSig,
    nonce
  )
  if (!ok) {
    throw new AppAttestError('assertion signature invalid', {
      reason: 'assertion_invalid',
    })
  }

  return { signCount: parsed.signCount }
}
