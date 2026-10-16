import { ed25519, x25519 } from '@noble/curves/ed25519.js'
import { hkdf as nobleHkdf } from '@noble/hashes/hkdf.js'
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js'
import { utf8 } from '@/features/buddies/lib/bytes'

/**
 * The Buddies primitive set (see docs/buddies-protocol.md, "Client
 * cryptography"): HKDF-SHA256, X25519, Ed25519, ChaCha20-Poly1305. Everything
 * here is pure; callers supply randomness so tests stay deterministic.
 */

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

// The sealed blob moved to the shared tier (accounts use it too).
export { open, openBytes, seal, sealBytes } from '@/lib/sealedBlob'
