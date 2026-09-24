import { strFromU8, strToU8 } from 'fflate'

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const LOOKUP: Record<string, number> = Object.fromEntries(
  ALPHABET.split('').map((char, index) => [char, index])
)

/** Relay ids: 16 bytes as unpadded base64url. */
export const RELAY_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/

/** Unpadded base64url — the only binary encoding on the Buddies wire. */
export function toB64u(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out +=
      ALPHABET[(n >> 18) & 63] +
      ALPHABET[(n >> 12) & 63] +
      ALPHABET[(n >> 6) & 63] +
      ALPHABET[n & 63]
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i] << 16
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63]
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out +=
      ALPHABET[(n >> 18) & 63] +
      ALPHABET[(n >> 12) & 63] +
      ALPHABET[(n >> 6) & 63]
  }
  return out
}

/** Throws on any character outside the base64url alphabet or a bad length. */
export function fromB64u(text: string): Uint8Array {
  if (text.length % 4 === 1) throw new Error('Invalid base64url length')
  const out = new Uint8Array(Math.floor((text.length * 3) / 4))
  let buffer = 0
  let bits = 0
  let index = 0
  for (const char of text) {
    const value = LOOKUP[char]
    if (value === undefined) throw new Error('Invalid base64url character')
    buffer = (buffer << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[index++] = (buffer >> bits) & 0xff
    }
  }
  return out
}

export function utf8(text: string): Uint8Array {
  return strToU8(text)
}

export function fromUtf8(bytes: Uint8Array): string {
  return strFromU8(bytes)
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
