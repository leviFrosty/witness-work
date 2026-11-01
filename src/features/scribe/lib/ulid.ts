import { getRandomBytes } from 'expo-crypto'

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/

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

  const bytes = randomBytes(16)
  let random = ''
  for (let i = 0; i < 16; i++) random += ALPHABET[bytes[i] % 32]
  return time + random
}
