import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { sha256 } from '@noble/hashes/sha2.js'
import {
  encodeRecoveryKey,
  normalizeRecoveryKey,
  parseRecoveryKey,
  RECOVERY_KEY_LENGTH,
} from '@/lib/accountKey/recoveryKey'

const random = () => new Uint8Array(randomBytes(32))

const fixedKey = () =>
  Uint8Array.from({ length: 32 }, (_, i) => (i * 37 + 11) % 256)
const keyOf = (input: string) => {
  const parsed = parseRecoveryKey(input)
  if (!parsed.ok) throw new Error(`Refused: ${parsed.problem}`)
  return parsed.accountKey
}
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function typo(recoveryKey: string, index: number) {
  const body = normalizeRecoveryKey(recoveryKey)
  const next = ALPHABET[(ALPHABET.indexOf(body[index]) + 1) % 32]
  return body.slice(0, index) + next + body.slice(index + 1)
}

describe('encodeRecoveryKey', () => {
  it('writes WW1- and eleven groups of five Crockford characters', () => {
    const recoveryKey = encodeRecoveryKey(random())
    expect(recoveryKey).toMatch(/^WW1(-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{5}){11}$/)
    expect(normalizeRecoveryKey(recoveryKey)).toHaveLength(RECOVERY_KEY_LENGTH)
  })

  it('matches the protocol: key ‖ first 2 bytes of SHA-256, big-endian base32', () => {
    const zeros = new Uint8Array(32)
    const [c0, c1] = sha256(zeros)

    const bits =
      '0'.repeat(256) +
      c0.toString(2).padStart(8, '0') +
      c1.toString(2).padStart(8, '0') +
      '000'
    let expected = ''
    for (let i = 0; i < bits.length; i += 5)
      expected += ALPHABET[parseInt(bits.slice(i, i + 5), 2)]
    expect(normalizeRecoveryKey(encodeRecoveryKey(zeros))).toBe(expected)
  })

  it('refuses a key that is not 32 bytes', () => {
    expect(() => encodeRecoveryKey(new Uint8Array(31))).toThrow()
    expect(() => encodeRecoveryKey(new Uint8Array(33))).toThrow()
  })
})

describe('parseRecoveryKey', () => {
  it('round-trips random keys', () => {
    for (let i = 0; i < 200; i++) {
      const key = random()
      expect(keyOf(encodeRecoveryKey(key))).toEqual(key)
    }
  })

  it('round-trips the edges of the alphabet', () => {
    for (const fill of [0x00, 0xff, 0xaa, 0x55]) {
      const key = new Uint8Array(32).fill(fill)
      expect(keyOf(encodeRecoveryKey(key))).toEqual(key)
    }
  })

  it('reads Arabic-Indic digits as 0-9', () => {
    const key = random()
    const arabic = encodeRecoveryKey(key).replace(/[0-9]/g, (d) =>
      String.fromCharCode(0x0660 + Number(d))
    )
    expect(keyOf(arabic)).toEqual(key)
  })

  it('ignores case, spaces, dashes and the prefix', () => {
    const key = random()
    const recoveryKey = encodeRecoveryKey(key)
    const body = normalizeRecoveryKey(recoveryKey)
    for (const input of [
      recoveryKey.toLowerCase(),
      body,
      body.toLowerCase(),
      `  ${recoveryKey.replaceAll('-', ' ')}  `,
      recoveryKey.replaceAll('-', '\n'),
      `WW1${body}`,
      `ww1 ${body.match(/.{1,5}/g)!.join('  ')}`,
      recoveryKey.replaceAll('-', '–'),
    ])
      expect(keyOf(input)).toEqual(key)
  })

  it('reads I and L as 1 and O as 0', () => {
    let key = random()
    let body = normalizeRecoveryKey(encodeRecoveryKey(key))
    while (!body.includes('1') || !body.includes('0')) {
      key = random()
      body = normalizeRecoveryKey(encodeRecoveryKey(key))
    }
    const mistyped = body
      .replace('1', 'I')
      .replace('1', 'l')
      .replace('0', 'O')
      .replace('0', 'o')
    expect(keyOf(mistyped)).toEqual(key)
    expect(keyOf(`WWI-${mistyped}`)).toEqual(key)
  })

  it('keeps a key whose own characters start with WW1', () => {
    const key = random()
    key[0] = 0b11100111
    key[1] = 0b00000010 | (key[1] & 1)
    const body = normalizeRecoveryKey(encodeRecoveryKey(key))
    expect(body.startsWith('WW1')).toBe(true)
    expect(keyOf(body)).toEqual(key)
    expect(keyOf(body.toLowerCase())).toEqual(key)
    expect(keyOf(`WW1-${body}`)).toEqual(key)
  })

  it('refuses a typo in any position by its checksum', () => {
    const recoveryKey = encodeRecoveryKey(fixedKey())
    for (let index = 0; index < RECOVERY_KEY_LENGTH; index++)
      expect(parseRecoveryKey(typo(recoveryKey, index))).toEqual({
        ok: false,
        problem: 'checksum',
      })
  })

  it('refuses two swapped groups', () => {
    const body = normalizeRecoveryKey(encodeRecoveryKey(fixedKey()))
    const swapped = body.slice(5, 10) + body.slice(0, 5) + body.slice(10)
    expect(swapped).not.toBe(body)
    expect(parseRecoveryKey(swapped)).toMatchObject({ problem: 'checksum' })
  })

  it('says what is wrong while typing', () => {
    const body = normalizeRecoveryKey(encodeRecoveryKey(random()))
    expect(parseRecoveryKey('')).toEqual({ ok: false, problem: 'empty' })
    expect(parseRecoveryKey('  - ')).toEqual({ ok: false, problem: 'empty' })
    expect(parseRecoveryKey('WW1-')).toEqual({ ok: false, problem: 'empty' })
    expect(parseRecoveryKey(body.slice(0, 20))).toEqual({
      ok: false,
      problem: 'incomplete',
    })
    expect(parseRecoveryKey(`WW1-${body.slice(0, 54)}`)).toEqual({
      ok: false,
      problem: 'incomplete',
    })
    expect(parseRecoveryKey(`${body}0`)).toEqual({
      ok: false,
      problem: 'tooLong',
    })
    expect(parseRecoveryKey(`${body.slice(0, 10)}U`)).toEqual({
      ok: false,
      problem: 'character',
    })
    expect(parseRecoveryKey('hello!')).toEqual({
      ok: false,
      problem: 'character',
    })
  })

  it('refuses padding bits that a key never has', () => {
    const body = normalizeRecoveryKey(encodeRecoveryKey(random()))
    const last = ALPHABET.indexOf(body[54])

    const padded = body.slice(0, 54) + ALPHABET[last | 0b001]
    expect(parseRecoveryKey(padded)).toEqual({
      ok: false,
      problem: 'checksum',
    })
  })
})
