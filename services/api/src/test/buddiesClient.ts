import { expect } from 'vitest'
import { signedMessage } from '../buddies/envelope'
import {
  BUDDIES_BLOB_PUT_OP,
  BUDDIES_ENVELOPE_HEADERS,
  BUDDIES_LIVE_HEADERS,
  BUDDIES_LIVE_OP,
  type BuddiesSigningOp,
} from '../buddies/contracts'

/** Client-side helpers for Buddies tests: keys, ids, and signed envelopes. */

const encoder = new TextEncoder()

/** Same output as `bytesToBase64Url`, via Node's native encoder (tests send a lot). */
export const b64u = (bytes: Uint8Array): string =>
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
    'base64url'
  )
/** `size` random bytes (filled in 64 KiB steps, `getRandomValues`' ceiling). */
export const randomBytes = (size: number): Uint8Array => {
  const bytes = new Uint8Array(size)
  for (let i = 0; i < size; i += 65_536)
    crypto.getRandomValues(bytes.subarray(i, i + 65_536))
  return bytes
}
export const randomId = (): string => b64u(randomBytes(16))
export const blobOfSize = (size: number): string => b64u(randomBytes(size))

/** An Ed25519 signing key (WebCrypto), optionally from a 32-byte seed. */
export class SigningKey {
  private constructor(
    readonly publicKey: string,
    private readonly privateKey: CryptoKey
  ) {}

  static async generate(): Promise<SigningKey> {
    return SigningKey.fromSeed(randomBytes(32))
  }

  static async fromSeed(seed: Uint8Array): Promise<SigningKey> {
    // PKCS#8 wrapper for a raw Ed25519 seed (RFC 8410).
    const prefix = Uint8Array.from([
      0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
      0x04, 0x22, 0x04, 0x20,
    ])
    const pkcs8 = new Uint8Array(prefix.length + 32)
    pkcs8.set(prefix)
    pkcs8.set(seed, prefix.length)
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      pkcs8,
      { name: 'Ed25519' },
      true,
      ['sign']
    )
    const jwk = (await crypto.subtle.exportKey('jwk', privateKey)) as JsonWebKey
    return new SigningKey(jwk.x as string, privateKey)
  }

  async sign(message: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(
      await crypto.subtle.sign({ name: 'Ed25519' }, this.privateKey, message)
    )
  }
}

export interface Envelope {
  payload: string
  signature?: string
}

/** Builds `{payload, signature}` over exact payload bytes (optionally pre-serialized). */
export const envelope = async (
  op: BuddiesSigningOp,
  payload: Record<string, unknown> | string,
  key: SigningKey
): Promise<Envelope> => {
  const bytes = encoder.encode(
    typeof payload === 'string' ? payload : JSON.stringify(payload)
  )
  return {
    payload: b64u(bytes),
    signature: b64u(await key.sign(signedMessage(op, bytes))),
  }
}

/**
 * Headers for the `inbox/live` upgrade: the signed envelope's `payload` and
 * `signature`.
 * `payload` must hold `inboxId`, `ts`, and `nonce`.
 */
export const liveHeaders = async (
  payload: Record<string, unknown> | string,
  key: SigningKey
): Promise<Record<string, string>> => {
  const signed = await envelope(BUDDIES_LIVE_OP, payload, key)
  return {
    upgrade: 'websocket',
    [BUDDIES_LIVE_HEADERS.payload]: signed.payload,
    [BUDDIES_LIVE_HEADERS.signature]: signed.signature ?? '',
  }
}

/**
 * Headers for `blob/put`: the signed envelope (op `blob/put`) as
 * `x-buddies-payload` and `x-buddies-signature`. `payload` must hold `inboxId`, `blobId`, `bytes`,
 * `expiresAt`, `readTokenHash`, `ts`, and `nonce`.
 */
export const blobPutHeaders = async (
  payload: Record<string, unknown> | string,
  key: SigningKey
): Promise<Record<string, string>> => {
  const signed = await envelope(BUDDIES_BLOB_PUT_OP, payload, key)
  return {
    'content-type': 'application/octet-stream',
    [BUDDIES_ENVELOPE_HEADERS.payload]: signed.payload,
    [BUDDIES_ENVELOPE_HEADERS.signature]: signed.signature ?? '',
  }
}

export const sha256B64u = async (bytes: Uint8Array): Promise<string> =>
  b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))

/**
 * A Shared Spaces member's id as the app derives it from their X25519 key:
 * `b64u(SHA-256("ww-spaces/v1/member-id|" + spaceId + "|" + dhPub)[0..16])`.
 */
export const spaceMemberId = async (spaceId: string, dhPub: string): Promise<string> =>
  b64u(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`ww-spaces/v1/member-id|${spaceId}|${dhPub}`)
      )
    ).slice(0, 16)
  )

/** A photo blob as the app uploads it: sealed bytes, their id, and a read token. */
export interface PhotoBlob {
  bytes: Uint8Array
  /** `b64u(SHA-256(bytes))`. */
  blobId: string
  /** The 32-byte read token (b64u) the app shares with recipients. */
  token: string
  /** `b64u(SHA-256(token))`, what `blob/put` stores. */
  readTokenHash: string
}

/** Random "sealed" bytes (`0x01 ‖ nonce ‖ ciphertext ‖ tag` to the relay). */
export const photoBlob = async (size = 2_048): Promise<PhotoBlob> => {
  const bytes = randomBytes(size)
  bytes[0] = 0x01
  const token = randomBytes(32)
  return {
    bytes,
    blobId: await sha256B64u(bytes),
    token: b64u(token),
    readTokenHash: await sha256B64u(token),
  }
}

export const unsignedEnvelope = (
  payload: Record<string, unknown>
): Envelope => ({
  payload: b64u(encoder.encode(JSON.stringify(payload))),
})

/** Random lowercase hex, `size` bytes (an APNs device token). */
export const hexToken = (size: number): string =>
  [...randomBytes(size)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

/**
 * The relay's error body for `code` (src/buddies/errorResponse.ts):
 * `rate_limited`, `disabled`, and `photos_disabled` add `retryAfter`, `stale`
 * adds `serverTime`.
 * Pass `extras` to pin those values.
 */
export const relayError = (
  code: string,
  extras: Record<string, unknown> = {}
) => ({
  ok: false,
  error: code,
  code,
  ...(code === 'rate_limited' ? { retryAfter: expect.any(Number) } : {}),
  ...(code === 'disabled' || code === 'photos_disabled'
    ? { retryAfter: 60 }
    : {}),
  ...(code === 'stale' ? { serverTime: expect.any(Number) } : {}),
  ...extras,
})
