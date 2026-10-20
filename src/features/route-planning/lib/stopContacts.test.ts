import { describe, expect, it } from 'vitest'
import { buildContactsFuse } from '@/lib/contactsSearch'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import {
  MAX_STOP_CONTACTS,
  stopContactResults,
} from '@/features/route-planning/lib/stopContacts'

const contact = (id: string, name: string, line1?: string): Contact => ({
  id,
  name,
  createdAt: new Date(2026, 0, 1),
  address: line1 ? { line1 } : undefined,
  coordinate: { latitude: 1, longitude: 1 },
})

describe('stopContactResults', () => {
  it('lists everyone A to Z without a query', () => {
    const contacts = [contact('b', 'Bea'), contact('a', 'Al')]
    const { shown, more } = stopContactResults(contacts, '  ', undefined)
    expect(shown.map((c) => c.id)).toEqual(['a', 'b'])
    expect(more).toBe(0)
  })

  it('finds a misspelled name, a street and a visit note', () => {
    const contacts = [
      contact('jo', 'Jonathan Pell', '12 Willow Court'),
      contact('ma', 'Marisol Tan', '3 Cedar Way'),
    ]
    const visits: Visit[] = [
      {
        id: 'v',
        contact: { id: 'ma' },
        date: new Date(2026, 0, 2),
        isBibleStudy: false,
        note: 'Asked about the brochure on gardening',
      },
    ]
    const fuse = buildContactsFuse(contacts, visits)
    const ids = (query: string) =>
      stopContactResults(contacts, query, fuse).shown.map((c) => c.id)
    expect(ids('jonathon')).toContain('jo')
    expect(ids('willow')).toEqual(['jo'])
    expect(ids('gardening')).toEqual(['ma'])
  })

  it('caps the list and counts the rest', () => {
    const contacts = Array.from({ length: MAX_STOP_CONTACTS + 5 }, (_, i) =>
      contact(`c${i}`, `Person ${String(i).padStart(2, '0')}`)
    )
    const all = stopContactResults(contacts, '', undefined)
    expect(all.shown).toHaveLength(MAX_STOP_CONTACTS)
    expect(all.more).toBe(5)

    const fuse = buildContactsFuse(contacts, [])
    const searched = stopContactResults(contacts, 'person', fuse, 10)
    expect(searched.shown).toHaveLength(10)
    expect(searched.more).toBe(contacts.length - 10)
  })
})
