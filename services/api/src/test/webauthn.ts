import { encode } from 'cbor2'
import { b64u, randomBytes } from './buddiesClient'

/**
 * A software WebAuthn authenticator for tests: real ES256 (P-256) or EdDSA
 * (Ed25519) credentials, `none` attestation in CBOR, and assertions signed
 * over `authenticatorData ‖ SHA-256(clientDataJSON)`, so the server's
 * `@simplewebauthn/server` checks run for real. Every flag, counter, origin,
 * RP ID, and user handle can be bent to test a refusal.
 */

const encoder = new TextEncoder()

const FLAG_UP = 0x01
const FLAG_UV = 0x04
const FLAG_BE = 0x08
const FLAG_BS = 0x10
const FLAG_AT = 0x40

export type PasskeyAlgorithm = 'ES256' | 'EdDSA'

const sha256 = async (bytes: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

const uint32 = (value: number): Uint8Array => {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value)
  return out
}

const fromB64u = (value: string): Uint8Array =>
  Uint8Array.from(
    atob(value.replace(/-/g, '+').replace(/_/g, '/')),
    (char) => char.charCodeAt(0)
  )

/** A raw 64-byte P-256 signature (r ‖ s) as ASN.1 DER, as WebAuthn sends ES256. */
const derSignature = (raw: Uint8Array): Uint8Array => {
  const integer = (bytes: Uint8Array) => {
    let start = 0
    while (start < bytes.length - 1 && bytes[start] === 0) start++
    let value = bytes.slice(start)
    if (value[0] & 0x80) value = concat(new Uint8Array([0]), value)
    return concat(new Uint8Array([0x02, value.length]), value)
  }
  const body = concat(integer(raw.slice(0, 32)), integer(raw.slice(32)))
  return concat(new Uint8Array([0x30, body.length]), body)
}

export interface CeremonyOptions {
  origin?: string
  /** The RP ID whose hash goes in the authenticator data. */
  rpId?: string
  /** Override `clientDataJSON.challenge` (b64u). */
  challenge?: string
  type?: string
  userVerified?: boolean
  userPresent?: boolean
  /** BE and BS. */
  backupEligible?: boolean
  backedUp?: boolean
  /** The sign counter to report (default: the credential's, incremented unless synced). */
  counter?: number
  /** `userHandle` to report (b64u); `null` leaves it out. */
  userHandle?: string | null
  /** Corrupt the signature. */
  badSignature?: boolean
  /** PRF results to report in `clientExtensionResults` (clients drop them; tests check the server ignores them). */
  clientExtensionResults?: Record<string, unknown>
}

export interface CreationOptionsLike {
  challenge: string
  rp: { id?: string; name: string }
  user: { id: string; name: string; displayName: string }
}

export interface RequestOptionsLike {
  challenge: string
  rpId?: string
}

/** One credential: its key, id, user handle, and counter. */
export class SoftPasskey {
  /** Synced passkeys always report 0. */
  synced = true

  private constructor(
    readonly algorithm: PasskeyAlgorithm,
    readonly credentialId: string,
    readonly keys: CryptoKeyPair,
    readonly rpId: string,
    readonly userHandle: string,
    public counter: number
  ) {}

  static async create(
    algorithm: PasskeyAlgorithm,
    rpId: string,
    userHandle: string,
    { synced = true, credentialBytes = 16 } = {}
  ): Promise<SoftPasskey> {
    const keys = (await crypto.subtle.generateKey(
      algorithm === 'ES256'
        ? { name: 'ECDSA', namedCurve: 'P-256' }
        : { name: 'Ed25519' },
      true,
      ['sign', 'verify']
    )) as CryptoKeyPair
    const passkey = new SoftPasskey(
      algorithm,
      b64u(randomBytes(credentialBytes)),
      keys,
      rpId,
      userHandle,
      0
    )
    passkey.synced = synced
    return passkey
  }

  private async coseKey(): Promise<Uint8Array> {
    const raw = new Uint8Array(
      await crypto.subtle.exportKey('raw', this.keys.publicKey)
    )
    const map =
      this.algorithm === 'ES256'
        ? new Map<number, unknown>([
            [1, 2],
            [3, -7],
            [-1, 1],
            [-2, raw.slice(1, 33)],
            [-3, raw.slice(33, 65)],
          ])
        : new Map<number, unknown>([
            [1, 1],
            [3, -8],
            [-1, 6],
            [-2, raw],
          ])
    return encode(map)
  }

  private flags(options: CeremonyOptions, attested: boolean): number {
    let flags = 0
    if (options.userPresent !== false) flags |= FLAG_UP
    if (options.userVerified !== false) flags |= FLAG_UV
    const eligible = options.backupEligible ?? this.synced
    if (eligible) flags |= FLAG_BE
    if (options.backedUp ?? (eligible && this.synced)) flags |= FLAG_BS
    if (attested) flags |= FLAG_AT
    return flags
  }

  private nextCounter(options: CeremonyOptions): number {
    if (options.counter != null) return options.counter
    if (this.synced) return 0
    this.counter += 1
    return this.counter
  }

  private clientData(
    type: string,
    challenge: string,
    origin: string
  ): Uint8Array {
    return encoder.encode(
      JSON.stringify({ type, challenge, origin, crossOrigin: false })
    )
  }

  /** A `RegistrationResponseJSON` for these creation options. */
  async register(
    options: CreationOptionsLike,
    ceremony: CeremonyOptions = {}
  ) {
    const rpId = ceremony.rpId ?? options.rp.id ?? this.rpId
    const origin = ceremony.origin ?? `https://${rpId}`
    const clientDataJSON = this.clientData(
      ceremony.type ?? 'webauthn.create',
      ceremony.challenge ?? options.challenge,
      origin
    )
    const credentialId = fromB64u(this.credentialId)
    const credentialLength = new Uint8Array([
      credentialId.length >> 8,
      credentialId.length & 0xff,
    ])
    const authData = concat(
      await sha256(encoder.encode(rpId)),
      new Uint8Array([this.flags(ceremony, true)]),
      uint32(this.nextCounter(ceremony)),
      new Uint8Array(16), // AAGUID: zeros, as `none` attestation allows
      credentialLength,
      credentialId,
      await this.coseKey()
    )
    const attestationObject = encode(
      new Map<string, unknown>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ])
    )
    return {
      id: this.credentialId,
      rawId: this.credentialId,
      type: 'public-key' as const,
      response: {
        clientDataJSON: b64u(clientDataJSON),
        attestationObject: b64u(attestationObject),
        transports: ['internal', 'hybrid'],
      },
      clientExtensionResults: ceremony.clientExtensionResults ?? {},
      authenticatorAttachment: 'platform' as const,
    }
  }

  /** An `AuthenticationResponseJSON` for these request options. */
  async assert(options: RequestOptionsLike, ceremony: CeremonyOptions = {}) {
    const rpId = ceremony.rpId ?? options.rpId ?? this.rpId
    const origin = ceremony.origin ?? `https://${rpId}`
    const clientDataJSON = this.clientData(
      ceremony.type ?? 'webauthn.get',
      ceremony.challenge ?? options.challenge,
      origin
    )
    const authData = concat(
      await sha256(encoder.encode(rpId)),
      new Uint8Array([this.flags(ceremony, false)]),
      uint32(this.nextCounter(ceremony))
    )
    const signed = concat(authData, await sha256(clientDataJSON))
    let signature = new Uint8Array(
      await crypto.subtle.sign(
        this.algorithm === 'ES256'
          ? { name: 'ECDSA', hash: 'SHA-256' }
          : { name: 'Ed25519' },
        this.keys.privateKey,
        signed
      )
    )
    if (this.algorithm === 'ES256') signature = derSignature(signature)
    if (ceremony.badSignature) signature[signature.length - 1] ^= 0xff
    const userHandle =
      ceremony.userHandle === undefined ? this.userHandle : ceremony.userHandle
    return {
      id: this.credentialId,
      rawId: this.credentialId,
      type: 'public-key' as const,
      response: {
        clientDataJSON: b64u(clientDataJSON),
        authenticatorData: b64u(authData),
        signature: b64u(signature),
        ...(userHandle != null ? { userHandle } : {}),
      },
      clientExtensionResults: ceremony.clientExtensionResults ?? {},
      authenticatorAttachment: 'platform' as const,
    }
  }
}

/** A wrap-shaped value: b64u(0x01 ‖ 72 random bytes), 98 characters. */
export const fakeWrap = (): string =>
  b64u(concat(new Uint8Array([1]), randomBytes(72)))
