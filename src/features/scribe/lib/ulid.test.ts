import { describe, expect, it, vi } from 'vitest'

vi.mock('expo-crypto', () => ({
  getRandomBytes: (count: number) => new Uint8Array(count).fill(31),
}))

import { ulid, ULID_PATTERN } from '@/features/scribe/lib/ulid'

const bytes = (fill: number) => (count: number) =>
  new Uint8Array(count).fill(fill)

describe('ulid', () => {
  it('is 26 Crockford base32 characters', () => {
    const id = ulid(1_790_000_000_000)
    expect(id).toMatch(ULID_PATTERN)
    expect(id).toHaveLength(26)
  })

  it('encodes the time in the first 10 characters', () => {
    expect(ulid(0, bytes(0))).toBe('0'.repeat(26))
    expect(ulid(1, bytes(0)).slice(0, 10)).toBe('0000000001')
    expect(ulid(32, bytes(0)).slice(0, 10)).toBe('0000000010')
  })

  it('sorts by time', () => {
    const earlier = ulid(1_790_000_000_000, bytes(31))
    const later = ulid(1_790_000_000_001, bytes(0))
    expect(earlier < later).toBe(true)
  })

  it('takes its randomness from the bytes, one symbol per byte', () => {
    expect(ulid(0, bytes(31)).slice(10)).toBe('Z'.repeat(16))
    expect(ulid(0, bytes(32 + 10)).slice(10)).toBe('A'.repeat(16))
  })
})
