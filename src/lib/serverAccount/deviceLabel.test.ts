import { describe, expect, it } from 'vitest'
import { toB64u, utf8 } from '@/lib/bytes'
import { seal } from '@/lib/sealedBlob'
import {
  deriveDeviceLabelKey,
  normalizeDeviceLabel,
  openDeviceLabel,
  sealDeviceLabel,
} from '@/lib/serverAccount/deviceLabel'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'

/**
 * Interop vector for `session/open`'s `device` (docs/accounts-protocol.md),
 * computed independently with Node's HKDF and ChaCha20-Poly1305. Other clients
 * and ww-api's tests can use the same values.
 */
const ACCOUNT_KEY = Uint8Array.from({ length: 32 }, (_, i) => i)
const ACCOUNT_PUB = 'aMYrddRdQwf7331YL7k_b8XbbdBwqmKdY9BkBoOv9QE'
const NONCE = Uint8Array.from({ length: 12 }, (_, i) => 0xa0 + i)
const LABEL = {
  name: 'Interop iPhone',
  platform: 'ios' as const,
  model: 'iPhone 17 Pro',
}
const SEALED =
  'AaChoqOkpaanqKmqq_ywf3r2uHesX5yvPeYPCiYp1rFRhneZQRETxlTWh1wrnkQQjbRsGSBb1ndDFmAIeX8Xnrd1TRQ-pvLK0KEuvZpAdRH5CDQ2gU5eCROCZvTRhTQ'

describe('device label', () => {
  it('matches the interop vector', () => {
    expect(deriveAccountSigningKey(ACCOUNT_KEY).publicKey).toBe(ACCOUNT_PUB)
    expect(toB64u(deriveDeviceLabelKey(ACCOUNT_KEY))).toBe(
      'IzOTLz0TdR6AK6diK8xhAR0p4VFX9ru4QNoK9Zj-WVQ'
    )
    expect(sealDeviceLabel(ACCOUNT_KEY, ACCOUNT_PUB, LABEL, NONCE)).toBe(SEALED)
    expect(openDeviceLabel(ACCOUNT_KEY, ACCOUNT_PUB, SEALED)).toEqual(LABEL)
  })

  it('opens only under the same account key and public key', () => {
    const otherKey = new Uint8Array(32).fill(9)
    expect(() => openDeviceLabel(otherKey, ACCOUNT_PUB, SEALED)).toThrow()
    expect(() => openDeviceLabel(ACCOUNT_KEY, 'B'.repeat(43), SEALED)).toThrow()
  })

  it('opens a browser’s label, which has no model', () => {
    const web = { name: 'Chrome on macOS', platform: 'web' as const, model: '' }
    const sealed = sealDeviceLabel(ACCOUNT_KEY, ACCOUNT_PUB, web, NONCE)
    expect(openDeviceLabel(ACCOUNT_KEY, ACCOUNT_PUB, sealed)).toEqual(web)
  })

  it('refuses a platform it doesn’t know', () => {
    const odd = { ...LABEL, platform: 'tv' } as unknown as typeof LABEL
    const sealed = sealDeviceLabel(ACCOUNT_KEY, ACCOUNT_PUB, odd, NONCE)
    expect(() => openDeviceLabel(ACCOUNT_KEY, ACCOUNT_PUB, sealed)).toThrow()
  })

  it('clamps the names of a label another client sealed too long', () => {
    const wide = {
      name: `${'n'.repeat(100)}`,
      platform: 'android',
      model: '🙂'.repeat(100),
    }
    const sealed = seal(
      deriveDeviceLabelKey(ACCOUNT_KEY),
      utf8(JSON.stringify(wide)),
      `ww-account/v1/device\n${ACCOUNT_PUB}`,
      NONCE
    )
    expect(openDeviceLabel(ACCOUNT_KEY, ACCOUNT_PUB, sealed)).toEqual({
      name: 'n'.repeat(64),
      platform: 'android',
      model: '🙂'.repeat(64),
    })
  })

  it('keeps names within the server limits', () => {
    const long = {
      name: `  ${'é'.repeat(80)}  `,
      platform: 'android' as const,
      model: '🙂'.repeat(70),
    }
    const normalized = normalizeDeviceLabel(long)
    expect(Array.from(normalized.name).length).toBeLessThanOrEqual(64)
    expect(normalized.name.startsWith('é')).toBe(true)
    expect(normalized.model.startsWith('🙂')).toBe(true)
    expect(
      normalizeDeviceLabel({ ...LABEL, name: ` ${'a'.repeat(70)} ` }).name
    ).toBe('a'.repeat(64))
    const sealed = sealDeviceLabel(ACCOUNT_KEY, ACCOUNT_PUB, long, NONCE)
    expect(sealed.length).toBeLessThanOrEqual(512)
    expect(openDeviceLabel(ACCOUNT_KEY, ACCOUNT_PUB, sealed)).toEqual(
      normalized
    )
  })
})
