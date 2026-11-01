import { chacha20poly1305 } from '@noble/ciphers/chacha.js'
import { concatBytes, fromB64u, toB64u, utf8 } from '@/lib/bytes'

const SEALED_BLOB_VERSION = 1
const NONCE_LENGTH = 12

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

export function seal(
  key: Uint8Array,
  plaintext: Uint8Array,
  aad: string,
  nonce: Uint8Array
): string {
  return toB64u(sealBytes(key, plaintext, aad, nonce))
}

export function open(key: Uint8Array, blob: string, aad: string): Uint8Array {
  return openBytes(key, fromB64u(blob), aad)
}
