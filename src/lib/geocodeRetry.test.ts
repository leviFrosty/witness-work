import { describe, expect, it } from 'vitest'
import type { Contact } from '@/types/contact'
import {
  GEOCODE_RETRY_MAX_ATTEMPTS,
  afterFailedGeocodeRetry,
  geocodeRetryKey,
  geocodeRetryStep,
  isRetryableGeocodeFailure,
  withGeocodeRetry,
} from './geocodeRetry'

const contact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'c1',
  name: 'Sam Rivera',
  createdAt: new Date('2026-01-01'),
  address: { line1: '12 Maple St', city: 'Springfield' },
  ...overrides,
})

const MINUTE = 60_000

describe('withGeocodeRetry', () => {
  it('queues a contact due right away', () => {
    expect(withGeocodeRetry([], contact())).toEqual([
      {
        contactId: 'c1',
        key: geocodeRetryKey(contact()),
        attempts: 0,
        notBefore: 0,
      },
    ])
  })

  it('replaces an earlier retry for the same contact', () => {
    const edited = contact({ address: { line1: '14 Oak Ave' } })
    const queue = withGeocodeRetry(
      withGeocodeRetry([], contact({ id: 'c2' })),
      contact()
    )
    const next = withGeocodeRetry(
      queue.map((entry) => ({ ...entry, attempts: 3 })),
      edited
    )
    expect(next).toHaveLength(2)
    expect(next.find((entry) => entry.contactId === 'c1')).toEqual({
      contactId: 'c1',
      key: geocodeRetryKey(edited),
      attempts: 0,
      notBefore: 0,
    })
  })

  it('never stores the address itself', () => {
    expect(JSON.stringify(withGeocodeRetry([], contact()))).not.toContain(
      'Maple'
    )
  })
})

describe('geocodeRetryStep', () => {
  const [entry] = withGeocodeRetry([], contact())

  it('tries a due retry for the same address', () => {
    expect(geocodeRetryStep(entry, contact(), 0)).toBe('try')

    expect(geocodeRetryStep(entry, contact({ name: 'Sam R.' }), 0)).toBe('try')
  })

  it('waits out the backoff', () => {
    const waiting = { ...entry, notBefore: 10 * MINUTE }
    expect(geocodeRetryStep(waiting, contact(), 5 * MINUTE)).toBe('wait')
    expect(geocodeRetryStep(waiting, contact(), 10 * MINUTE)).toBe('try')
  })

  it('drops a retry whose contact is gone', () => {
    expect(geocodeRetryStep(entry, undefined, 0)).toBe('drop')
  })

  it('drops a retry once the address changes', () => {
    const moved = contact({ address: { line1: '14 Oak Ave' } })
    expect(geocodeRetryStep(entry, moved, 0)).toBe('drop')
    expect(geocodeRetryStep(entry, contact({ address: {} }), 0)).toBe('drop')
    expect(geocodeRetryStep(entry, contact({ address: undefined }), 0)).toBe(
      'drop'
    )
  })

  it('never overwrites a pin from elsewhere or one placed by hand', () => {
    const coordinate = { latitude: 40.1, longitude: -89.6 }
    expect(geocodeRetryStep(entry, contact({ coordinate }), 0)).toBe('drop')
    const [pinned] = withGeocodeRetry([], contact({ coordinate }))
    expect(
      geocodeRetryStep(
        pinned,
        contact({ coordinate, userDraggedCoordinate: true }),
        0
      )
    ).toBe('drop')
  })
})

describe('afterFailedGeocodeRetry', () => {
  it('backs off, then gives up', () => {
    let [entry] = withGeocodeRetry([], contact())
    const delays: number[] = []
    for (;;) {
      const next = afterFailedGeocodeRetry(entry, 0)
      if (!next) break
      delays.push(next.notBefore / MINUTE)
      entry = next
    }
    expect(delays).toEqual([2, 8, 32, 128, 360, 360, 360])
    expect(entry.attempts).toBe(GEOCODE_RETRY_MAX_ATTEMPTS - 1)
  })

  it('counts from the failure time', () => {
    const [entry] = withGeocodeRetry([], contact())
    expect(afterFailedGeocodeRetry(entry, 1_000)?.notBefore).toBe(
      1_000 + 2 * MINUTE
    )
  })
})

describe('isRetryableGeocodeFailure', () => {
  it('retries only failures that can pass', () => {
    expect(isRetryableGeocodeFailure('offline')).toBe(true)
    expect(isRetryableGeocodeFailure('timeout')).toBe(true)
    expect(isRetryableGeocodeFailure('rateLimited')).toBe(true)
    expect(isRetryableGeocodeFailure('server')).toBe(true)
    expect(isRetryableGeocodeFailure('client')).toBe(false)
    expect(isRetryableGeocodeFailure('cancelled')).toBe(false)
    expect(isRetryableGeocodeFailure('unknown')).toBe(false)
  })
})
