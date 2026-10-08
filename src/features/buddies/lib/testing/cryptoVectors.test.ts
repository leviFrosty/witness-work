import { describe, expect, it } from 'vitest'
import {
  checkCryptoVectors,
  computeCryptoVectors,
} from '@/features/buddies/lib/testing/cryptoVectors'
import expected from '@/features/buddies/lib/testing/cryptoVectors.json'

describe('Buddies crypto vectors', () => {
  it('match the shared known-answer file under Node', () => {
    expect(computeCryptoVectors()).toEqual(expected)
    expect(checkCryptoVectors()).toEqual({
      ok: true,
      checked: Object.keys(expected).length,
      mismatches: [],
    })
  })

  it('anchor the primitives to their RFC test vectors', () => {
    expect(expected['rfc.ed25519Test1Sig']).toBe(
      'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b'
    )
    expect(expected['rfc.x25519Shared']).toBe(
      '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742'
    )
    expect(expected['rfc.hkdfCase1']).toBe(
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865'
    )
    // Ciphertext, then the RFC 8439 2.8.2 tag.
    expect(
      expected['rfc.aead'].endsWith('1ae10b594f09e26a7e902ecbd0600691')
    ).toBe(true)
  })
})
