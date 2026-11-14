import {
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import {
  decodeAttestationObject,
  parseAuthenticatorData,
} from '@simplewebauthn/server/helpers'
import { bytesToBase64Url, sha256Bytes, timingSafeEqual } from '../crypto'
import { decodeB64u, isPlainObject } from '../buddies/contracts'
import { originPairs, type PasskeyRelyingParties } from './passkeyConfig'

/**
 * WebAuthn ceremonies (witness-work `docs/passkeys-protocol.md`,
 * "Ceremonies"). Every check that has its own `reason` runs here first, in a
 * fixed order, so a refusal names what failed: the client data's type (a
 * `webauthn.create` answering a get is `signature`, a `webauthn.get`
 * answering a create `registration`: the response isn't the ceremony asked
 * for), its challenge (`challenge`), the origin paired with the challenge's
 * RP ID (`origin`), the authenticator data's `rpIdHash` (`rp_id`), user
 * presence (`user_presence`), and user verification (`user_verification`).
 * Only then does `@simplewebauthn/server` check the signature (assertions;
 * `signature`) or the attestation (registrations; `registration`), with the
 * values already checked. Counters are ours: a synced passkey's 0 always
 * passes, and a non-zero counter that doesn't increase is `counter`.
 *
 * Privacy: nothing here logs responses, credential ids, or user handles.
 */

export const PASSKEY_FAILURE_REASONS = [
  'challenge',
  'unknown_credential',
  'user_handle',
  'origin',
  'rp_id',
  'user_presence',
  'user_verification',
  'signature',
  'counter',
  'registration',
] as const
export type PasskeyFailureReason = (typeof PASSKEY_FAILURE_REASONS)[number]

/** EdDSA, ES256, RS256, in the order the creation options offer them. */
export const SUPPORTED_ALGORITHMS = [-8, -7, -257] as const

/** Credential ids longer than this (WebAuthn's own cap) are refused. */
const MAX_CREDENTIAL_ID_BYTES = 1_023

export type Failed = { failed: PasskeyFailureReason }

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })
const encoder = new TextEncoder()

const isB64u = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  /^[A-Za-z0-9_-]+$/.test(value) &&
  decodeB64u(value) != null

/** Canonical b64u credential id: decodable, 1 to 1,023 bytes. */
export const parseCredentialId = (value: unknown): string | null => {
  if (!isB64u(value)) return null
  const bytes = decodeB64u(value)!
  if (bytes.length === 0 || bytes.length > MAX_CREDENTIAL_ID_BYTES) return null
  return bytesToBase64Url(bytes) === value ? value : null
}

/** An `AuthenticationResponseJSON`'s shape, or null (`bad_request`). */
export const parseAuthenticationResponse = (
  value: unknown
): AuthenticationResponseJSON | null => {
  if (!isPlainObject(value) || !isPlainObject(value.response)) return null
  const id = parseCredentialId(value.id)
  if (!id || value.rawId !== value.id || value.type !== 'public-key') return null
  const { clientDataJSON, authenticatorData, signature, userHandle } =
    value.response
  if (!isB64u(clientDataJSON) || !isB64u(authenticatorData) || !isB64u(signature))
    return null
  if (userHandle !== undefined && userHandle !== null && !isB64u(userHandle))
    return null
  return {
    id,
    rawId: id,
    type: 'public-key',
    response: {
      clientDataJSON,
      authenticatorData,
      signature,
      ...(typeof userHandle === 'string' ? { userHandle } : {}),
    },
    clientExtensionResults: {},
  }
}

/** A `RegistrationResponseJSON`'s shape, or null (`bad_request`). */
export const parseRegistrationResponse = (
  value: unknown
): RegistrationResponseJSON | null => {
  if (!isPlainObject(value) || !isPlainObject(value.response)) return null
  const id = parseCredentialId(value.id)
  if (!id || value.rawId !== value.id || value.type !== 'public-key') return null
  const { clientDataJSON, attestationObject, transports } = value.response
  if (!isB64u(clientDataJSON) || !isB64u(attestationObject)) return null
  const transportList =
    Array.isArray(transports) &&
    transports.length <= 8 &&
    transports.every((t) => typeof t === 'string' && t.length <= 32)
      ? (transports as AuthenticatorTransport[])
      : undefined
  return {
    id,
    rawId: id,
    type: 'public-key',
    response: {
      clientDataJSON,
      attestationObject,
      ...(transportList ? { transports: transportList } : {}),
    },
    clientExtensionResults: {},
  }
}

interface ClientData {
  type: string
  challenge: string
  origin: string
}

const readClientData = (clientDataJSON: string): ClientData | null => {
  try {
    const value: unknown = JSON.parse(decoder.decode(decodeB64u(clientDataJSON)!))
    if (
      !isPlainObject(value) ||
      typeof value.type !== 'string' ||
      typeof value.challenge !== 'string' ||
      typeof value.origin !== 'string'
    )
      return null
    return { type: value.type, challenge: value.challenge, origin: value.origin }
  } catch {
    return null
  }
}

/** The client data's type, challenge, and origin, against what was issued. */
const checkClientData = (
  clientDataJSON: string,
  expected: {
    type: 'webauthn.get' | 'webauthn.create'
    challenge: string
    rpId: string
  },
  config: PasskeyRelyingParties
): { origin: string } | Failed => {
  const data = readClientData(clientDataJSON)
  if (!data) return { failed: 'challenge' }
  if (data.type !== expected.type)
    return {
      failed: expected.type === 'webauthn.get' ? 'signature' : 'registration',
    }
  if (!timingSafeEqual(data.challenge, expected.challenge))
    return { failed: 'challenge' }
  if (!originPairs(config, expected.rpId, data.origin)) return { failed: 'origin' }
  return { origin: data.origin }
}

const rpIdMatches = async (
  rpIdHash: Uint8Array,
  rpId: string
): Promise<boolean> =>
  timingSafeEqual(
    bytesToBase64Url(rpIdHash),
    bytesToBase64Url(await sha256Bytes(encoder.encode(rpId)))
  )

type AuthData = ReturnType<typeof parseAuthenticatorData>

const checkAuthData = async (
  authData: AuthData,
  rpId: string
): Promise<Failed | null> => {
  if (!(await rpIdMatches(authData.rpIdHash, rpId))) return { failed: 'rp_id' }
  if (!authData.flags.up) return { failed: 'user_presence' }
  if (!authData.flags.uv) return { failed: 'user_verification' }
  return null
}

/** What a verified assertion reports. */
export interface VerifiedAssertion {
  origin: string
  counter: number
  deviceType: 'singleDevice' | 'multiDevice'
  backedUp: boolean
}

export interface StoredCredential {
  credentialId: string
  publicKey: string
  counter: number
  rpId: string
  transports: string | null
}

/**
 * Verifies an assertion against the challenge it was issued (`challenge`,
 * `rpId`) and the stored credential. The user handle is the caller's check.
 */
export const verifyAssertion = async (
  response: AuthenticationResponseJSON,
  issued: { challenge: string; rpId: string },
  credential: StoredCredential,
  config: PasskeyRelyingParties
): Promise<VerifiedAssertion | Failed> => {
  const client = checkClientData(
    response.response.clientDataJSON,
    { type: 'webauthn.get', ...issued },
    config
  )
  if ('failed' in client) return client
  let authData: AuthData
  try {
    authData = parseAuthenticatorData(
      new Uint8Array(decodeB64u(response.response.authenticatorData)!)
    )
  } catch {
    return { failed: 'signature' }
  }
  const refused = await checkAuthData(authData, issued.rpId)
  if (refused) return refused
  if (credential.rpId !== issued.rpId) return { failed: 'rp_id' }
  if (authData.counter !== 0 && authData.counter <= credential.counter)
    return { failed: 'counter' }
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: issued.challenge,
      expectedOrigin: client.origin,
      expectedRPID: issued.rpId,
      requireUserVerification: true,
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(decodeB64u(credential.publicKey)!),
        // Our counter rule is above; 0 here keeps the library's from
        // refusing a synced passkey's 0 after a non-zero one.
        counter: 0,
      },
    })
    if (!result.verified) return { failed: 'signature' }
    return {
      origin: client.origin,
      counter: authData.counter,
      deviceType: result.authenticationInfo.credentialDeviceType,
      backedUp: result.authenticationInfo.credentialBackedUp,
    }
  } catch {
    return { failed: 'signature' }
  }
}

/** What a verified registration stores. */
export interface VerifiedRegistration {
  origin: string
  credentialId: string
  publicKey: string
  counter: number
  transports: string[] | null
  deviceType: 'singleDevice' | 'multiDevice'
  backedUp: boolean
  aaguid: string | null
}

const ZERO_AAGUID = '00000000-0000-0000-0000-000000000000'

/** Verifies a registration against the challenge it was issued. */
export const verifyRegistration = async (
  response: RegistrationResponseJSON,
  issued: { challenge: string; rpId: string },
  config: PasskeyRelyingParties
): Promise<VerifiedRegistration | Failed> => {
  const client = checkClientData(
    response.response.clientDataJSON,
    { type: 'webauthn.create', ...issued },
    config
  )
  if ('failed' in client) return client
  let authData: AuthData
  try {
    const attestation = decodeAttestationObject(
      new Uint8Array(decodeB64u(response.response.attestationObject)!)
    )
    authData = parseAuthenticatorData(attestation.get('authData'))
  } catch {
    return { failed: 'registration' }
  }
  const refused = await checkAuthData(authData, issued.rpId)
  if (refused) return refused
  try {
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: issued.challenge,
      expectedOrigin: client.origin,
      expectedRPID: issued.rpId,
      requireUserVerification: true,
      supportedAlgorithmIDs: [...SUPPORTED_ALGORITHMS],
    })
    if (!result.verified) return { failed: 'registration' }
    const info = result.registrationInfo
    if (info.credential.id !== response.id) return { failed: 'registration' }
    return {
      origin: client.origin,
      credentialId: info.credential.id,
      publicKey: bytesToBase64Url(info.credential.publicKey),
      counter: info.credential.counter,
      transports: response.response.transports ?? null,
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      aaguid: info.aaguid === ZERO_AAGUID ? null : info.aaguid,
    }
  } catch {
    return { failed: 'registration' }
  }
}
