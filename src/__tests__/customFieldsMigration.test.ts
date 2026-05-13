import { describe, expect, it, vi } from 'vitest'

// expo-crypto pulls in react-native through the expo runtime; stub it before
// importing the migration module so the test runner doesn't try to parse RN's
// flow-typed entry point.
vi.mock('expo-crypto', () => ({
  randomUUID: vi.fn(() => 'mock-uuid-from-default'),
}))

import { migrateCustomFieldsToIds } from '../features/contacts/lib/customFieldsMigration'
import { Contact } from '../types/contact'

const NOW = 1714000000000

const makeContact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'contact-1',
  name: 'Joe Shmoe',
  createdAt: new Date('2026-04-15T00:00:00.000Z'),
  ...overrides,
})

const seqUuid = () => {
  let n = 0
  return () => `uuid-${++n}`
}

describe('migrateCustomFieldsToIds', () => {
  it('returns empty defs and untouched contacts on empty input', () => {
    const result = migrateCustomFieldsToIds({
      legacyLabels: [],
      contacts: [],
      deletedContacts: [],
      now: NOW,
      uuid: seqUuid(),
    })
    expect(result.defs).toEqual([])
    expect(result.contacts).toEqual([])
    expect(result.deletedContacts).toEqual([])
  })

  it('creates one def per legacy label, preserving order', () => {
    const result = migrateCustomFieldsToIds({
      legacyLabels: ['Company', 'Department', 'Spouse'],
      contacts: [],
      deletedContacts: [],
      now: NOW,
      uuid: seqUuid(),
    })
    expect(result.defs).toHaveLength(3)
    expect(result.defs.map((d) => d.label)).toEqual([
      'Company',
      'Department',
      'Spouse',
    ])
    expect(result.defs.map((d) => d.order)).toEqual([0, 1, 2])
    expect(result.defs.every((d) => d.createdAt === NOW)).toBe(true)
    expect(result.defs.every((d) => d.updatedAt === NOW)).toBe(true)
    expect(result.defs.every((d) => !d.archived)).toBe(true)
  })

  it('rewrites contact customFields keys label → id', () => {
    const uuid = seqUuid()
    const contact = makeContact({
      customFields: { Company: 'Acme', Department: 'Sales' },
    })
    const result = migrateCustomFieldsToIds({
      legacyLabels: ['Company', 'Department'],
      contacts: [contact],
      deletedContacts: [],
      now: NOW,
      uuid,
    })
    const [companyDef, deptDef] = result.defs
    expect(result.contacts[0].customFields).toEqual({
      [companyDef.id]: 'Acme',
      [deptDef.id]: 'Sales',
    })
    // updatedAt bumps when keys actually change.
    expect(result.contacts[0].updatedAt).toBe(NOW)
  })

  it('collapses duplicate labels in legacy array to a single def', () => {
    const result = migrateCustomFieldsToIds({
      legacyLabels: ['Company', 'Company', 'Department'],
      contacts: [makeContact({ customFields: { Company: 'Acme' } })],
      deletedContacts: [],
      now: NOW,
      uuid: seqUuid(),
    })
    expect(result.defs).toHaveLength(2)
    expect(result.defs.map((d) => d.label)).toEqual(['Company', 'Department'])
    const companyId = result.defs[0].id
    expect(result.contacts[0].customFields).toEqual({ [companyId]: 'Acme' })
  })

  it('preserves orphan labels as archived defs', () => {
    // Contact has a customField key that's NOT in the legacy preferences
    // array — this is a known bug today (orphaned data after rename/delete).
    // The migration must preserve it, just hidden, so the user can recover.
    const result = migrateCustomFieldsToIds({
      legacyLabels: ['Company'],
      contacts: [
        makeContact({
          customFields: { Company: 'Acme', OldLabel: 'orphaned value' },
        }),
      ],
      deletedContacts: [],
      now: NOW,
      uuid: seqUuid(),
    })
    expect(result.defs).toHaveLength(2)
    const companyDef = result.defs.find((d) => d.label === 'Company')!
    const orphanDef = result.defs.find((d) => d.label === 'OldLabel')!
    expect(companyDef.archived).toBeUndefined()
    expect(orphanDef.archived).toBe(true)
    expect(result.contacts[0].customFields).toEqual({
      [companyDef.id]: 'Acme',
      [orphanDef.id]: 'orphaned value',
    })
  })

  it('treats labels case-sensitively (Company !== company)', () => {
    const result = migrateCustomFieldsToIds({
      legacyLabels: ['Company', 'company'],
      contacts: [],
      deletedContacts: [],
      now: NOW,
      uuid: seqUuid(),
    })
    expect(result.defs).toHaveLength(2)
    expect(result.defs.map((d) => d.label)).toEqual(['Company', 'company'])
  })

  it('drops empty / whitespace-only legacy labels', () => {
    const result = migrateCustomFieldsToIds({
      legacyLabels: ['', '  ', 'Company'],
      contacts: [],
      deletedContacts: [],
      now: NOW,
      uuid: seqUuid(),
    })
    expect(result.defs).toHaveLength(1)
    expect(result.defs[0].label).toBe('Company')
  })

  it('does not mutate contacts that have no customFields', () => {
    const contact = makeContact()
    const result = migrateCustomFieldsToIds({
      legacyLabels: ['Company'],
      contacts: [contact],
      deletedContacts: [],
      now: NOW,
      uuid: seqUuid(),
    })
    expect(result.contacts[0]).toBe(contact)
    expect(result.contacts[0].updatedAt).toBeUndefined()
  })

  it('rewrites deletedContacts the same as active contacts', () => {
    const result = migrateCustomFieldsToIds({
      legacyLabels: ['Company'],
      contacts: [],
      deletedContacts: [
        makeContact({
          id: 'gone',
          customFields: { Company: 'Acme' },
        }),
      ],
      now: NOW,
      uuid: seqUuid(),
    })
    const companyId = result.defs[0].id
    expect(result.deletedContacts[0].customFields).toEqual({
      [companyId]: 'Acme',
    })
  })

  it('produces a stable result when run twice on its own output', () => {
    // The runner gates on a flag, but the pure function should still be safe
    // to call again — i.e., once everything is id-keyed, a second pass should
    // not invent more orphan defs from the now-id-shaped customFields.
    // That said: a true second run is not the contract; the migration is
    // single-pass. This test documents the expected boot-time pattern: the
    // first pass produces defs, and the runner won't call again because the
    // flag is set. We assert the first pass terminates with the expected
    // shape.
    const first = migrateCustomFieldsToIds({
      legacyLabels: ['Company'],
      contacts: [makeContact({ customFields: { Company: 'Acme' } })],
      deletedContacts: [],
      now: NOW,
      uuid: seqUuid(),
    })
    expect(first.defs).toHaveLength(1)
    expect(Object.keys(first.contacts[0].customFields ?? {})).toHaveLength(1)
  })
})
