import { sha256 } from '@noble/hashes/sha2.js'
import { concatBytes } from '@/lib/bytes'

/**
 * The recovery key: the account key written for people
 * (docs/accounts-protocol.md, "Recovery key"). The 32-byte key and the first 2
 * bytes of its SHA-256, 34 bytes, in Crockford base32: 55 characters, shown as
 * `WW1-` and eleven groups of five.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const PREFIX = 'WW1'
const KEY_BYTES = 32
const CHECKSUM_BYTES = 2
/** 34 bytes is 272 bits: 55 characters, the last carrying 3 zero bits. */
export const RECOVERY_KEY_LENGTH = 55
const GROUP = 5
/** What people put between groups; ignored when reading a key. */
const SEPARATORS = /[\s\-‐‑‒–—_.]/g
const PREFIXED = /^WW[1IL](?:[\s\-‐‑‒–—_.]|$)/i

const checksum = (key: Uint8Array) => sha256(key).slice(0, CHECKSUM_BYTES)

/** The recovery key for a 32-byte account key, grouped for people. */
export function encodeRecoveryKey(accountKey: Uint8Array): string {
  if (accountKey.length !== KEY_BYTES)
    throw new Error('Account key must be 32 bytes')
  const bytes = concatBytes(accountKey, checksum(accountKey))
  let text = ''
  let buffer = 0
  let bits = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      text += ALPHABET[(buffer >> bits) & 31]
    }
    buffer &= (1 << bits) - 1
  }
  if (bits > 0) text += ALPHABET[(buffer << (5 - bits)) & 31]
  return [PREFIX, ...groups(text)].join('-')
}

/** The key's characters in groups of five. */
export function groups(text: string): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += GROUP)
    out.push(text.slice(i, i + GROUP))
  return out
}

export type RecoveryKeyProblem =
  /** Nothing typed yet. */
  | 'empty'
  /** Fewer characters than a key has, all of them valid so far. */
  | 'incomplete'
  /** A character no recovery key has, e.g. `U` or `#`. */
  | 'character'
  /** More characters than a key has. */
  | 'tooLong'
  /** Every character is valid, but they don't add up: a typo. */
  | 'checksum'

export type ParsedRecoveryKey =
  | { ok: true; accountKey: Uint8Array }
  | { ok: false; problem: RecoveryKeyProblem }

/**
 * The key's 55 characters as typed: case, spaces, and dashes ignored, `I` and
 * `L` read as `1`, `O` as `0`, and a leading `WW1` dropped.
 */
export function normalizeRecoveryKey(input: string): string {
  const text = input
    .toUpperCase()
    .replace(SEPARATORS, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
  // A key's own characters can start with WW1 too, so the prefix is only the
  // prefix when it's set apart (`WW1-…`) or the key is otherwise too long.
  const prefixed =
    PREFIXED.test(input.trim()) ||
    (text.startsWith(PREFIX) &&
      text.length === PREFIX.length + RECOVERY_KEY_LENGTH)
  return prefixed ? text.slice(PREFIX.length) : text
}

/**
 * Reads a recovery key leniently, and refuses one whose checksum doesn't match.
 * While typing, `incomplete` means "keep going".
 */
export function parseRecoveryKey(input: string): ParsedRecoveryKey {
  const text = normalizeRecoveryKey(input)
  if (!text) return { ok: false, problem: 'empty' }
  for (const char of text)
    if (!ALPHABET.includes(char)) return { ok: false, problem: 'character' }
  if (text.length < RECOVERY_KEY_LENGTH)
    return { ok: false, problem: 'incomplete' }
  if (text.length > RECOVERY_KEY_LENGTH)
    return { ok: false, problem: 'tooLong' }

  const bytes = new Uint8Array(KEY_BYTES + CHECKSUM_BYTES)
  let buffer = 0
  let bits = 0
  let index = 0
  for (const char of text) {
    buffer = (buffer << 5) | ALPHABET.indexOf(char)
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes[index++] = (buffer >> bits) & 0xff
    }
    buffer &= (1 << bits) - 1
  }
  // The 3 bits after the last byte are always zero in a key the app wrote.
  if (buffer !== 0) return { ok: false, problem: 'checksum' }
  const accountKey = bytes.slice(0, KEY_BYTES)
  const expected = checksum(accountKey)
  if (bytes[KEY_BYTES] !== expected[0] || bytes[KEY_BYTES + 1] !== expected[1])
    return { ok: false, problem: 'checksum' }
  return { ok: true, accountKey }
}
