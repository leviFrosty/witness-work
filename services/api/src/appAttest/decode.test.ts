import { describe, expect, it } from 'vitest'
import { encode } from 'cbor2'
import {
  decodeAttestation,
  decodeAssertion,
  parseAuthData,
  parseAssertionAuthData,
  AppAttestDecodeError,
} from './decode'

const bytes = (...n: number[]) => new Uint8Array(n)

describe('parseAuthData', () => {
  it('parses the 37-byte assertion prefix', () => {
    const ad = new Uint8Array(37)
    ad.set(Array.from({ length: 32 }, () => 0xaa), 0)
    ad[32] = 0x00
    new DataView(ad.buffer).setUint32(33, 7, false)
    const parsed = parseAuthData(ad)
    expect(parsed.signCount).toBe(7)
    expect(parsed.flags).toBe(0)
    expect(parsed.credentialId).toBeUndefined()
    expect(parsed.rpIdHash.length).toBe(32)
  })

  it('parses attested credential data when the AT flag is set', () => {
    const credId = Array.from({ length: 32 }, (_, i) => i)
    const ad = new Uint8Array(55 + credId.length)
    ad[32] = 0x40 // AT flag
    new DataView(ad.buffer).setUint32(33, 0, false)
    ad.set(new TextEncoder().encode('appattestdevelop'), 37) // aaguid
    new DataView(ad.buffer).setUint16(53, credId.length, false)
    ad.set(credId, 55)
    const parsed = parseAuthData(ad)
    expect(parsed.signCount).toBe(0)
    expect(Array.from(parsed.credentialId!)).toEqual(credId)
    expect(new TextDecoder().decode(parsed.aaguid!)).toBe('appattestdevelop')
  })

  it('throws on truncated authData', () => {
    expect(() => parseAuthData(bytes(1, 2, 3))).toThrow(AppAttestDecodeError)
  })
})

describe('parseAssertionAuthData', () => {
  it('parses a real-device 37-byte assertion with the AT flag set', () => {
    // Production devices set the AT flag (0x40) on assertion authData without
    // appending attested-credential-data — the shape that broke prod kickoff.
    const ad = new Uint8Array(37)
    ad.set(Array.from({ length: 32 }, () => 0xaa), 0)
    ad[32] = 0x40
    new DataView(ad.buffer).setUint32(33, 3, false)
    const parsed = parseAssertionAuthData(ad)
    expect(parsed.signCount).toBe(3)
    expect(parsed.flags).toBe(0x40)
    expect(parsed.credentialId).toBeUndefined()
  })

  it('throws on truncated authData', () => {
    expect(() => parseAssertionAuthData(bytes(1, 2, 3))).toThrow(
      AppAttestDecodeError
    )
  })
})

describe('decodeAttestation', () => {
  it('decodes fmt, x5c chain, receipt and authData', () => {
    const obj = {
      fmt: 'apple-appattest',
      attStmt: { x5c: [bytes(1, 2, 3), bytes(4, 5, 6)], receipt: bytes(9) },
      authData: bytes(7, 8, 9),
    }
    const decoded = decodeAttestation(encode(obj))
    expect(decoded.fmt).toBe('apple-appattest')
    expect(decoded.attStmt.x5c.length).toBe(2)
    expect(Array.from(decoded.attStmt.x5c[0])).toEqual([1, 2, 3])
    expect(Array.from(decoded.authData)).toEqual([7, 8, 9])
  })

  it('throws when the chain is missing', () => {
    const bad = encode({ fmt: 'apple-appattest', attStmt: {}, authData: bytes(1) })
    expect(() => decodeAttestation(bad)).toThrow(AppAttestDecodeError)
  })
})

describe('decodeAssertion', () => {
  it('decodes signature and authenticatorData', () => {
    const obj = { signature: bytes(1, 2, 3), authenticatorData: bytes(4, 5) }
    const decoded = decodeAssertion(encode(obj))
    expect(Array.from(decoded.signature)).toEqual([1, 2, 3])
    expect(Array.from(decoded.authenticatorData)).toEqual([4, 5])
  })

  it('throws on non-CBOR input', () => {
    expect(() => decodeAssertion(bytes(0xff, 0xff, 0xff))).toThrow(
      AppAttestDecodeError
    )
  })
})
