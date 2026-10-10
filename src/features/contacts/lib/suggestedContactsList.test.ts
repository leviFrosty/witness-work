import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, opts?: { count?: number }) =>
      opts?.count === undefined ? key : `${key}:${opts.count}`,
  },
}))

import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { SuggestedContacts } from '@/lib/suggestedContacts'
import {
  buildContactsList,
  contactItemIndex,
  type ContactsListItem,
} from '@/features/contacts/lib/suggestedContactsList'

const now = new Date('2026-10-09T12:00:00')
const day = 86_400_000

const contact = (id: string, extra: Partial<Contact> = {}): Contact => ({
  id,
  name: id,
  createdAt: new Date('2026-01-01'),
  ...extra,
})

const dueVisit = (contactId: string, daysOverdue: number): Visit => ({
  id: `visit-${contactId}`,
  contact: { id: contactId },
  date: new Date(now.getTime() - (daysOverdue + 7) * day),
  isBibleStudy: false,
  followUp: {
    date: new Date(now.getTime() - daysOverdue * day),
    notifyMe: false,
    topic: 'topic',
  },
})

const suggestedOf = (
  sections: SuggestedContacts['sections'],
  due: Visit[] = []
): SuggestedContacts => ({
  sections,
  suggestedIds: new Set(sections.flatMap((s) => s.contacts.map((c) => c.id))),
  distanceById: new Map(),
  dueFollowUpById: new Map(due.map((visit) => [visit.contact.id, visit])),
})

const shape = (items: ContactsListItem[]) =>
  items.map((item) =>
    item.kind === 'header' ? `# ${item.section}` : item.contact.id
  )

describe('buildContactsList', () => {
  const a = contact('a', { address: { line1: '412 Oak St' } })
  const b = contact('b')
  const c = contact('c', { address: { line1: '9 Elm Ave' } })
  const d = contact('d')
  const e = contact('e')
  const contacts = [a, b, c, d, e]

  it('stays flat for another sort or a search', () => {
    const list = buildContactsList({ contacts, suggested: null })

    expect(list.sectioned).toBe(false)
    expect(shape(list.items)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(list.contacts).toBe(contacts)
    expect(list.items.every((item) => item.kind === 'contact')).toBe(true)
  })

  it('stays flat without a lone header when no section has anyone', () => {
    const list = buildContactsList({ contacts, suggested: suggestedOf([]) })

    expect(list.sectioned).toBe(false)
    expect(shape(list.items)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('puts the sections first, then everyone else in the given order', () => {
    const list = buildContactsList({
      contacts,
      suggested: suggestedOf([
        { key: 'nearby', contacts: [c] },
        { key: 'followUpsDue', contacts: [e] },
        { key: 'recent', contacts: [b] },
      ]),
      currentTime: now,
    })

    expect(list.sectioned).toBe(true)
    expect(shape(list.items)).toEqual([
      '# nearby',
      'c',
      '# followUpsDue',
      'e',
      '# recent',
      'b',
      '# other',
      'a',
      'd',
    ])
    expect(list.contacts.map((x) => x.id)).toEqual(['c', 'e', 'b', 'a', 'd'])
  })

  it('lists every Contact exactly once, so Select All counts them right', () => {
    const list = buildContactsList({
      contacts,
      suggested: suggestedOf([
        { key: 'nearby', contacts: [a, b] },
        // A repeat across sections would be a bug upstream; still shown once.
        { key: 'recent', contacts: [b, c] },
      ]),
    })

    const ids = list.contacts.map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    const keys = list.items.map((item) => item.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('leaves out section members the filters hid', () => {
    const list = buildContactsList({
      contacts: [a, b],
      suggested: suggestedOf([
        { key: 'nearby', contacts: [c] },
        { key: 'recent', contacts: [b] },
      ]),
    })

    expect(shape(list.items)).toEqual(['# recent', 'b', '# other', 'a'])
  })

  it('stays flat when every section member was filtered out', () => {
    const list = buildContactsList({
      contacts: [a, b],
      suggested: suggestedOf([{ key: 'nearby', contacts: [c] }]),
    })

    expect(list.sectioned).toBe(false)
    expect(shape(list.items)).toEqual(['a', 'b'])
  })

  it('drops the Other Contacts header when the sections hold everyone', () => {
    const list = buildContactsList({
      contacts: [a, b],
      suggested: suggestedOf([{ key: 'recent', contacts: [b, a] }]),
    })

    expect(shape(list.items)).toEqual(['# recent', 'b', 'a'])
  })

  it('explains Nearby and Follow-ups Due rows, and only those', () => {
    const list = buildContactsList({
      contacts,
      suggested: suggestedOf(
        [
          { key: 'nearby', contacts: [a, c, d] },
          { key: 'followUpsDue', contacts: [e] },
          { key: 'recent', contacts: [b] },
        ],
        [dueVisit('a', 0), dueVisit('e', 3), dueVisit('b', 1)]
      ),
      currentTime: now,
    })
    const detail = (id: string) =>
      list.items.find(
        (item) => item.kind === 'contact' && item.contact.id === id
      ) as Extract<ContactsListItem, { kind: 'contact' }>

    expect(detail('a').detail).toEqual({
      text: 'suggested_followUpToday · 412 Oak St',
      tone: 'due',
    })
    expect(detail('c').detail).toEqual({ text: '9 Elm Ave', tone: 'default' })
    // Pin-only Contact: no street to show, so the row keeps its usual line.
    expect(detail('d').detail).toBeUndefined()
    expect(detail('e').detail).toEqual({
      text: 'suggested_followUpOverdue:3',
      tone: 'due',
    })
    expect(detail('b').detail).toBeUndefined()
    expect(detail('b').section).toBe('recent')
  })

  it('finds a Contact row past the headers', () => {
    const list = buildContactsList({
      contacts,
      suggested: suggestedOf([{ key: 'recent', contacts: [d] }]),
    })

    expect(contactItemIndex(list.items, 'd')).toBe(1)
    expect(contactItemIndex(list.items, 'a')).toBe(3)
    expect(contactItemIndex(list.items, 'missing')).toBe(-1)
  })
})
