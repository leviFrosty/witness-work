import { chacha20poly1305 } from '@noble/ciphers/chacha.js'
import { ed25519, x25519 } from '@noble/curves/ed25519.js'
import { hkdf as nobleHkdf } from '@noble/hashes/hkdf.js'
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js'
import {
  concatBytes,
  fromB64u,
  toB64u,
  utf8,
} from '@/features/buddies/lib/bytes'

/**
 * The Buddies primitive set (see docs/buddies-protocol.md, "Client
 * cryptography"): HKDF-SHA256, X25519, Ed25519, ChaCha20-Poly1305. Everything
 * here is pure; callers supply randomness so tests stay deterministic.
 */

const SEALED_BLOB_VERSION = 1
const NONCE_LENGTH = 12

export function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: string,
  length: number
): Uint8Array {
  return nobleHkdf(nobleSha256, ikm, salt, utf8(info), length)
}

export function sha256(data: Uint8Array): Uint8Array {
  return nobleSha256(data)
}

export function x25519PublicKey(privateKey: Uint8Array): Uint8Array {
  return x25519.getPublicKey(privateKey)
}

export function x25519SharedSecret(
  privateKey: Uint8Array,
  publicKey: Uint8Array
): Uint8Array {
  return x25519.getSharedSecret(privateKey, publicKey)
}

export function ed25519PublicKey(seed: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(seed)
}

export function ed25519Sign(message: Uint8Array, seed: Uint8Array): Uint8Array {
  return ed25519.sign(message, seed)
}

export function ed25519Verify(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array
): boolean {
  return ed25519.verify(signature, message, publicKey)
}

/** `b64u(0x01 ‖ nonce[12] ‖ ciphertext ‖ tag[16])`. */
export function seal(
  key: Uint8Array,
  plaintext: Uint8Array,
  aad: string,
  nonce: Uint8Array
): string {
  if (nonce.length !== NONCE_LENGTH) throw new Error('Nonce must be 12 bytes')
  const ciphertext = chacha20poly1305(key, nonce, utf8(aad)).encrypt(plaintext)
  return toB64u(
    concatBytes(new Uint8Array([SEALED_BLOB_VERSION]), nonce, ciphertext)
  )
}

/** Throws when the blob is malformed, from another context, or tampered with. */
export function open(key: Uint8Array, blob: string, aad: string): Uint8Array {
  const bytes = fromB64u(blob)
  if (bytes.length < 1 + NONCE_LENGTH + 16 || bytes[0] !== SEALED_BLOB_VERSION)
    throw new Error('Unsupported sealed blob')
  const nonce = bytes.subarray(1, 1 + NONCE_LENGTH)
  return chacha20poly1305(key, nonce, utf8(aad)).decrypt(
    bytes.subarray(1 + NONCE_LENGTH)
  )
}
