import { chacha20poly1305 } from '@noble/ciphers/chacha.js'
import { concatBytes, fromB64u, toB64u, utf8 } from '@/lib/bytes'

/**
 * The sealed blob Buddies and the server account share
 * (docs/buddies-protocol.md, "Client cryptography"): `0x01 ‖ nonce[12] ‖
 * ChaCha20-Poly1305(key, nonce, plaintext, aad)`. Callers supply the nonce, so
 * tests stay deterministic.
 */

const SEALED_BLOB_VERSION = 1
const NONCE_LENGTH = 12

/** `0x01 ‖ nonce[12] ‖ ciphertext ‖ tag[16]`, as bytes. */
export function sealBytes(
  key: Uint8Array,
  plaintext: Uint8Array,
  aad: string,
  nonce: Uint8Array
): Uint8Array {
  if (nonce.length !== NONCE_LENGTH) throw new Error('Nonce must be 12 bytes')
  const ciphertext = chacha20poly1305(key, nonce, utf8(aad)).encrypt(plaintext)
  return concatBytes(new Uint8Array([SEALED_BLOB_VERSION]), nonce, ciphertext)
}

/** Throws when the bytes are malformed, from another context, or tampered with. */
export function openBytes(
  key: Uint8Array,
  bytes: Uint8Array,
  aad: string
): Uint8Array {
  if (bytes.length < 1 + NONCE_LENGTH + 16 || bytes[0] !== SEALED_BLOB_VERSION)
    throw new Error('Unsupported sealed blob')
  const nonce = bytes.subarray(1, 1 + NONCE_LENGTH)
  return chacha20poly1305(key, nonce, utf8(aad)).decrypt(
    bytes.subarray(1 + NONCE_LENGTH)
  )
}

/** `b64u(0x01 ‖ nonce[12] ‖ ciphertext ‖ tag[16])`. */
export function seal(
  key: Uint8Array,
  plaintext: Uint8Array,
  aad: string,
  nonce: Uint8Array
): string {
  return toB64u(sealBytes(key, plaintext, aad, nonce))
}

/** Throws when the blob is malformed, from another context, or tampered with. */
export function open(key: Uint8Array, blob: string, aad: string): Uint8Array {
  return openBytes(key, fromB64u(blob), aad)
}
