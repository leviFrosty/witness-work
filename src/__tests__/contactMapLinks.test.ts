import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/address', () => ({
  addressToString: (address?: Record<string, string>) =>
    address ? Object.values(address).filter(Boolean).join(' ') : '',
}))

import { contactMapLinks, contactMapQuery } from '@/lib/mapLinks'
import type { Contact } from '@/types/contact'

const contact = (overrides: Partial<Contact>): Contact =>
  ({ id: '1', name: 'Ann', createdAt: new Date(), ...overrides }) as Contact

const coordinate = { latitude: 1.5, longitude: -2.25 }

describe('contactMapQuery', () => {
  it('prefers the address', () => {
    expect(
      contactMapQuery(contact({ address: { line1: '1 Main St' }, coordinate }))
    ).toBe('1 Main St')
  })

  it('uses a dragged pin over the address', () => {
    expect(
      contactMapQuery(
        contact({
          address: { line1: '1 Main St' },
          coordinate,
          userDraggedCoordinate: true,
        })
      )
    ).toBe('1.5, -2.25')
  })

  it('falls back to the pin without an address', () => {
    expect(contactMapQuery(contact({ coordinate }))).toBe('1.5, -2.25')
  })
})

describe('contactMapLinks', () => {
  it('encodes the query into both providers', () => {
    const links = contactMapLinks(contact({ address: { line1: '1 Main St' } }))
    expect(links?.apple).toContain('1%20Main%20St')
    expect(links?.google).toContain('1%20Main%20St')
  })

  it('has nothing to share without a place', () => {
    expect(contactMapLinks(contact({}))).toBeNull()
  })
})
