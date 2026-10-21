import { describe, expect, it } from 'vitest'
import { curve25519 } from '@/lib/curve25519'

const hex = (value: string) =>
  Uint8Array.from(value.match(/../g)!.map((byte) => parseInt(byte, 16)))

describe('curve25519', () => {
  it('loads the curves once', () => {
    expect(curve25519()).toBe(curve25519())
  })

  it('signs like RFC 8032 (test 1)', () => {
    const { ed25519 } = curve25519()
    const seed = hex(
      '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60'
    )
    const publicKey = ed25519.getPublicKey(seed)
    expect(publicKey).toEqual(
      hex('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a')
    )
    const signature = ed25519.sign(new Uint8Array(0), seed)
    expect(signature).toEqual(
      hex(
        'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155' +
          '5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b'
      )
    )
    expect(ed25519.verify(signature, new Uint8Array(0), publicKey)).toBe(true)
  })
})
