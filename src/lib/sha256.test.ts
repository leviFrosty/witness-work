import { sha256 } from '@noble/hashes/sha2.js'
import { describe, expect, it, vi } from 'vitest'

vi.unmock('@/lib/sha256')
// expo-crypto's `digest` is WebCrypto's: (algorithm, bytes) -> ArrayBuffer.
const digest = vi.hoisted(() =>
  vi.fn((algorithm: string, data: Uint8Array<ArrayBuffer>) =>
    globalThis.crypto.subtle.digest(algorithm, data)
  )
)
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest,
}))

import { sha256Native } from '@/lib/sha256'

describe('sha256Native', () => {
  it('gives the bytes noble’s SHA-256 gives', async () => {
    for (const bytes of [
      new Uint8Array(0),
      new Uint8Array([1, 2, 3]),
      new TextEncoder().encode('Ada Reyes · ½ hour · 日本語 🙂'),
      Uint8Array.from({ length: 100_000 }, (_, i) => (i * 31) % 256),
    ])
      expect(await sha256Native(bytes)).toEqual(sha256(bytes))
  })

  it('hashes only the view, not the rest of its buffer', async () => {
    const buffer = Uint8Array.from({ length: 64 }, (_, i) => i)
    const view = buffer.subarray(8, 40)
    expect(await sha256Native(view)).toEqual(sha256(view))
    expect(digest.mock.lastCall?.[1].byteLength).toBe(32)
  })
})
