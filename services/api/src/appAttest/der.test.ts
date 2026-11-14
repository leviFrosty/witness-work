import { describe, expect, it } from 'vitest'
import { extractAttestationNonce, derEcdsaSignatureToRaw, DerError } from './der'

const seq = (children: number[]): number[] => [0x30, children.length, ...children]
const ctx1 = (children: number[]): number[] => [0xa1, children.length, ...children]
const octet = (bytes: number[]): number[] => [0x04, bytes.length, ...bytes]

describe('extractAttestationNonce', () => {
  it('pulls the 32-byte nonce out of SEQUENCE{[1]{OCTET STRING}}', () => {
    const nonce = Array.from({ length: 32 }, (_, i) => i)
    const ext = new Uint8Array(seq(ctx1(octet(nonce))))
    expect(Array.from(extractAttestationNonce(ext))).toEqual(nonce)
  })

  it('rejects a nonce that is not 32 bytes', () => {
    const ext = new Uint8Array(seq(ctx1(octet([1, 2, 3]))))
    expect(() => extractAttestationNonce(ext)).toThrow(DerError)
  })

  it('rejects a non-SEQUENCE outer tag', () => {
    const ext = new Uint8Array(octet([1, 2, 3]))
    expect(() => extractAttestationNonce(ext)).toThrow(DerError)
  })
})

describe('derEcdsaSignatureToRaw', () => {
  it('converts a DER signature to 64 raw bytes, left-padding short integers', () => {
    // r = 0x01, s = 0x02 (both 1 byte) → both left-padded to 32 bytes.
    const der = new Uint8Array([
      0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02,
    ])
    const raw = derEcdsaSignatureToRaw(der)
    expect(raw.length).toBe(64)
    expect(raw[31]).toBe(1)
    expect(raw[63]).toBe(2)
    expect(raw[0]).toBe(0)
    expect(raw[32]).toBe(0)
  })

  it('strips a DER sign byte (leading 0x00) before placing the integer', () => {
    // s integer is 0x00 0x80 (33 bytes worth of value semantics) → 0x80 at end.
    const der = new Uint8Array([
      0x30, 0x07, 0x02, 0x01, 0x05, 0x02, 0x02, 0x00, 0x80,
    ])
    const raw = derEcdsaSignatureToRaw(der)
    expect(raw[31]).toBe(5)
    expect(raw[63]).toBe(0x80)
  })
})
