import { describe, expect, it } from 'vitest'
import { toB64u } from '@/lib/bytes'
import {
  deriveDeviceLabelKey,
  normalizeDeviceLabel,
  openDeviceLabel,
  sealDeviceLabel,
} from '@/lib/serverAccount/deviceLabel'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'

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
