import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/address', () => ({
  addressToString: (address?: Record<string, string>) =>
    address ? Object.values(address).filter(Boolean).join(', ') : '',
}))

import { contactMapQuery, formatCoordinate, mapLinks } from '@/lib/mapLinks'
import type { Contact } from '@/types/contact'

const contact = (overrides: Partial<Contact>): Contact => ({
  id: 'c',
  name: 'C',
  createdAt: new Date(),
  ...overrides,
})

describe('lib/mapLinks', () => {
  it('searches the address when there is one', () => {
    expect(
      contactMapQuery(
        contact({
          address: { line1: '1 Main St', city: 'Springfield' },
          coordinate: { latitude: 1, longitude: 2 },
        })
      )
    ).toContain('1 Main St')
  })

  it('searches the pin when it was dragged or there is no address', () => {
    const coordinate = { latitude: 40.1, longitude: -73.2 }
    expect(
      contactMapQuery(
        contact({
          address: { line1: '1 Main St' },
          coordinate,
          userDraggedCoordinate: true,
        })
      )
    ).toBe('40.1, -73.2')
    expect(contactMapQuery(contact({ coordinate }))).toBe('40.1, -73.2')
  })

  it('builds encoded Apple Maps and Google Maps links', () => {
    const { apple, google } = mapLinks('Apt #3, 1 Main St & Co')
    expect(apple).toBe(
      'http://maps.apple.com/?q=Apt%20%233%2C%201%20Main%20St%20%26%20Co'
    )
    expect(google).toBe(
      'https://www.google.com/maps/search/?api=1&query=Apt%20%233%2C%201%20Main%20St%20%26%20Co'
    )
  })

  it('formats coordinates to five decimals', () => {
    expect(formatCoordinate({ latitude: 40.123456789, longitude: -73 })).toBe(
      '40.12346, -73.00000'
    )
  })
})
