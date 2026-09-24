import { getRandomBytes } from 'expo-crypto'

/** Cryptographically secure random bytes (SecRandomCopyBytes on iOS). */
export function randomBytes(length: number): Uint8Array {
  return getRandomBytes(length)
}
