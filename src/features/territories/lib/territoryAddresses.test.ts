import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/serverAccount', () => ({ accountSessions: {} }))

const { readAddresses, lookupAddressReason } = await import(
  '@/features/territories/lib/territoryAddresses'
)
const { HttpError } = await import('@/lib/http/request')

describe('territory addresses', () => {
  it('reads the addresses and skips malformed entries', () => {
    expect(
      readAddresses({
        ok: true,
        source: 'openstreetmap',
        addresses: [
          { street: 'Grove St', number: '930', latitude: 1, longitude: 2 },
          { street: '', number: '1' },
          { street: 'Grove St' },
          null,
        ],
      })
    ).toEqual([{ street: 'Grove St', number: '930' }])
    expect(readAddresses({ ok: false })).toBeNull()
    expect(readAddresses(null)).toBeNull()
  })

  it('maps failures to quiet fallbacks', () => {
    expect(
      lookupAddressReason(new HttpError('client', 413, 'area_too_large'))
    ).toBe('tooLarge')
    expect(lookupAddressReason(new HttpError('rateLimited', 429))).toBe('busy')
    expect(
      lookupAddressReason(new HttpError('server', 503, 'upstream_busy'))
    ).toBe('busy')
    expect(lookupAddressReason(new Error('boom'))).toBe('failed')
  })
})
