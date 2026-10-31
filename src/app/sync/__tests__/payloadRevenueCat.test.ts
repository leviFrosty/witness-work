import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildPayload, parsePayload } from '@/app/sync/payload'
import { payloadSchema } from '@/app/sync/payloadValidation'
import { setOwnAccountClaim } from '@/lib/accountClaimRegistry'

vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  getDeviceTypeAsync: async () => 1,
  osName: 'iOS',
  deviceType: 1,
  DeviceType: { TABLET: 2 },
}))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn() },
}))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'new' }))
vi.mock('react-native', () => ({ Alert: { alert: vi.fn() } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

const claim = {
  appUserId: '0f8e7c1a-5b2d-4e3f-9a6b-1c2d3e4f5a6b',
  entitled: true,
  claimedAt: 1_700_000_000_000,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function payloadWith(edit: (payload: any) => void) {
  const payload = JSON.parse(JSON.stringify(buildPayload({ deviceId: 'peer' })))
  edit(payload)
  return JSON.stringify(payload)
}

afterEach(() => setOwnAccountClaim(null))

describe('the RevenueCat claim in the sync payload', () => {
  it('round-trips', () => {
    setOwnAccountClaim(claim)
    const json = JSON.stringify(buildPayload({ deviceId: 'me' }))
    expect(parsePayload(json)?.revenueCat).toEqual(claim)
  })

  it('is left out until the claim is known', () => {
    expect(buildPayload({ deviceId: 'me' })).not.toHaveProperty('revenueCat')
  })

  // The frame older versions validate with: today's, without the field.
  it('is ignored by the frame of versions from before it', () => {
    setOwnAccountClaim(claim)
    const payload = JSON.parse(JSON.stringify(buildPayload({ deviceId: 'me' })))
    const older = payloadSchema.omit({ revenueCat: true }).safeParse(payload)
    expect(older.success).toBe(true)
    expect(older.data).not.toHaveProperty('revenueCat')
  })

  it.each([
    ['an anonymous id', { ...claim, appUserId: '$RCAnonymousID:abc' }],
    ['a string', 'abc'],
    ['a missing time', { appUserId: claim.appUserId, entitled: false }],
  ])('drops a claim with %s and keeps the file', (_, value) => {
    const rejected = vi.fn()
    const parsed = parsePayload(
      payloadWith((p) => {
        p.revenueCat = value
      }),
      undefined,
      rejected
    )
    expect(rejected).not.toHaveBeenCalled()
    expect(parsed?.deviceId).toBe('peer')
    expect(parsed).not.toHaveProperty('revenueCat')
  })

  // Older app versions parse with the same frame: a top-level key it doesn't
  // know is stripped, never a reason to reject the file.
  it('leaves the rest of a payload readable', () => {
    const rejected = vi.fn()
    const parsed = parsePayload(
      payloadWith((p) => {
        p.revenueCat = claim
      }),
      undefined,
      rejected
    )
    expect(rejected).not.toHaveBeenCalled()
    expect(parsed?.deviceId).toBe('peer')
  })
})
