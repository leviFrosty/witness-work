import { getRandomBytes } from 'expo-crypto'

/** Crockford base32, as ULIDs spell it (no I, L, O, U). */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/

/**
 * A 26-character ULID: 48 bits of epoch ms, then 80 random bits. Conversation
 * and turn ids are minted on the device (protocol: Conventions).
 */
export function ulid(
  now: number = Date.now(),
  randomBytes: (count: number) => Uint8Array = getRandomBytes
): string {
  let time = ''
  let remaining = Math.max(0, Math.floor(now))
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[remaining % 32] + time
    remaining = Math.floor(remaining / 32)
  }
  // 80 random bits are 16 symbols of 5 bits; take one byte per symbol.
  const bytes = randomBytes(16)
  let random = ''
  for (let i = 0; i < 16; i++) random += ALPHABET[bytes[i] % 32]
  return time + random
}
