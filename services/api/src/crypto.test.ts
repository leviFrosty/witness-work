import { describe, expect, it } from 'vitest'
import {
  sha256Hex,
  base64ToBytes,
  bytesToBase64Url,
  timingSafeEqual,
} from './crypto'

describe('sha256Hex', () => {
  it('matches the known SHA-256 of "abc"', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })

  it('hashes the empty string to the well-known digest', async () => {
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
  })

  it('is stable for the same input (content-hash identity)', async () => {
    const a = await sha256Hex('Visited Maria — 45 min')
    const b = await sha256Hex('Visited Maria — 45 min')
    expect(a).toBe(b)
  })
})

describe('base64 round-trips', () => {
  it('round-trips arbitrary bytes through url-safe base64', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255])
    expect(base64ToBytes(bytesToBase64Url(bytes))).toEqual(bytes)
  })

  it('decodes standard base64 with padding too', () => {
    // "Man" → "TWFu"
    expect(new TextDecoder().decode(base64ToBytes('TWFu'))).toBe('Man')
  })
})

describe('timingSafeEqual', () => {
  it('is true for equal strings and false otherwise', () => {
    expect(timingSafeEqual('secret-token', 'secret-token')).toBe(true)
    expect(timingSafeEqual('secret-token', 'secret-tokem')).toBe(false)
    expect(timingSafeEqual('short', 'longer-string')).toBe(false)
  })
})
