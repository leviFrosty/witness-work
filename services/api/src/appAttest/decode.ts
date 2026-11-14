import { decode } from 'cbor2'

/**
 * CBOR / authenticator-data decoding for App Attest. Apple's attestation and
 * assertion objects are small CBOR maps; `authData` (a.k.a. `authenticatorData`)
 * is a fixed-layout byte string. We only decode the fields the verifier needs.
 */

export interface AttestationObject {
  fmt: string
  attStmt: {
    x5c: Uint8Array[]
    receipt?: Uint8Array
  }
  authData: Uint8Array
}

export interface AssertionObject {
  signature: Uint8Array
  authenticatorData: Uint8Array
}

const asUint8 = (v: unknown): Uint8Array => {
  if (v instanceof Uint8Array) return v
  if (v instanceof ArrayBuffer) return new Uint8Array(v)
  throw new AppAttestDecodeError('expected byte string')
}

/** cbor2 may decode a map as a plain object or a Map; normalize lookups. */
const mapGet = (obj: unknown, key: string): unknown => {
  if (obj instanceof Map) return obj.get(key)
  if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[key]
  return undefined
}

export const decodeAttestation = (bytes: Uint8Array): AttestationObject => {
  let decoded: unknown
  try {
    decoded = decode(bytes)
  } catch {
    throw new AppAttestDecodeError('attestation is not valid CBOR')
  }
  const fmt = mapGet(decoded, 'fmt')
  const attStmt = mapGet(decoded, 'attStmt')
  const authData = mapGet(decoded, 'authData')
  if (typeof fmt !== 'string' || attStmt == null || authData == null) {
    throw new AppAttestDecodeError('attestation missing required fields')
  }
  const x5cRaw = mapGet(attStmt, 'x5c')
  if (!Array.isArray(x5cRaw) || x5cRaw.length < 1) {
    throw new AppAttestDecodeError('attestation missing certificate chain')
  }
  const receiptRaw = mapGet(attStmt, 'receipt')
  return {
    fmt,
    attStmt: {
      x5c: x5cRaw.map(asUint8),
      receipt: receiptRaw == null ? undefined : asUint8(receiptRaw),
    },
    authData: asUint8(authData),
  }
}

export const decodeAssertion = (bytes: Uint8Array): AssertionObject => {
  let decoded: unknown
  try {
    decoded = decode(bytes)
  } catch {
    throw new AppAttestDecodeError('assertion is not valid CBOR')
  }
  const signature = mapGet(decoded, 'signature')
  const authenticatorData = mapGet(decoded, 'authenticatorData')
  if (signature == null || authenticatorData == null) {
    throw new AppAttestDecodeError('assertion missing required fields')
  }
  return {
    signature: asUint8(signature),
    authenticatorData: asUint8(authenticatorData),
  }
}

export interface ParsedAuthData {
  rpIdHash: Uint8Array
  flags: number
  signCount: number
  aaguid?: Uint8Array
  credentialId?: Uint8Array
}

/**
 * Parses only the fixed 37-byte authenticator-data prefix:
 *
 *   rpIdHash[32] | flags[1] | signCount[4 BE]
 *
 * This is the parser for ASSERTIONS. Real-device App Attest assertions deviate
 * from WebAuthn: the authData is exactly these 37 bytes but ships with the AT
 * flag (0x40) set even though no attested-credential-data follows, so the flag
 * must not be interpreted. Ignoring it is safe — the ES256 signature covers the
 * raw authData bytes regardless of how much of them we parse.
 */
export const parseAssertionAuthData = (
  authData: Uint8Array
): ParsedAuthData => {
  if (authData.length < 37) {
    throw new AppAttestDecodeError('authData too short')
  }
  const view = new DataView(
    authData.buffer,
    authData.byteOffset,
    authData.byteLength
  )
  return {
    rpIdHash: authData.subarray(0, 32),
    flags: authData[32],
    signCount: view.getUint32(33, false),
  }
}

/**
 * Parses the authenticator-data prefix and (when the AT flag is set) the
 * attested-credential-data needed for ATTESTATION. Layout:
 *
 *   rpIdHash[32] | flags[1] | signCount[4 BE]
 *   ( aaguid[16] | credIdLen[2 BE] | credId[L] | coseKey[...] )?
 */
export const parseAuthData = (authData: Uint8Array): ParsedAuthData => {
  const { rpIdHash, flags, signCount } = parseAssertionAuthData(authData)
  const view = new DataView(
    authData.buffer,
    authData.byteOffset,
    authData.byteLength
  )

  const hasAttestedCredentialData = (flags & 0x40) !== 0
  if (!hasAttestedCredentialData) {
    return { rpIdHash, flags, signCount }
  }
  if (authData.length < 55) {
    throw new AppAttestDecodeError('authData missing attested credential data')
  }
  const aaguid = authData.subarray(37, 53)
  const credIdLen = view.getUint16(53, false)
  const credIdEnd = 55 + credIdLen
  if (authData.length < credIdEnd) {
    throw new AppAttestDecodeError('authData credentialId length overflow')
  }
  const credentialId = authData.subarray(55, credIdEnd)
  return { rpIdHash, flags, signCount, aaguid, credentialId }
}

export class AppAttestDecodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppAttestDecodeError'
  }
}
