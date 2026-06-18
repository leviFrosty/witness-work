import { describe, it, expect } from 'vitest'
import { mapNotesImport } from '@/features/notes-import/lib/mapNotesImport'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'
import type {
  NotesImportResult,
  NotesImportDtoContact,
  NotesImportDtoVisit,
  NotesImportDtoTimeEntry,
  NotesImportWarning,
} from '@/features/notes-import/lib/notesImportTypes'

const HASH = 'abc123'
const IMPORTED_AT = new Date('2026-06-08T12:00:00.000Z')

const emptyResult = (): NotesImportResult => ({
  contacts: [],
  visits: [],
  timeEntries: [],
  categories: [],
  publisher: null,
  warnings: [],
})

const map = (over: Partial<NotesImportResult>) =>
  mapNotesImport(
    { ...emptyResult(), ...over },
    { contentHash: HASH, importedAt: IMPORTED_AT }
  )

const contact = (
  over: Partial<NotesImportDtoContact> & { tempId: string }
): NotesImportDtoContact => ({ name: 'Someone', ...over })

const visit = (over: Partial<NotesImportDtoVisit>): NotesImportDtoVisit => ({
  date: '2026-06-01',
  isBibleStudy: false,
  ...over,
})

const time = (
  over: Partial<NotesImportDtoTimeEntry>
): NotesImportDtoTimeEntry => ({
  date: '2026-06-01',
  hours: 1,
  minutes: 0,
  ...over,
})

const warn = (
  over: Partial<NotesImportWarning> & { id: string }
): NotesImportWarning => ({ severity: 'info', message: 'msg', ...over })

describe('mapNotesImport — contacts', () => {
  it('maps a new contact to a hash-derived id', () => {
    const r = map({ contacts: [contact({ tempId: 'c1', name: 'Maria' })] })
    expect(r.contacts).toHaveLength(1)
    expect(r.contacts[0]).toMatchObject({
      id: `notes-${HASH}-c-c1`,
      name: 'Maria',
      createdAt: IMPORTED_AT,
    })
  })

  it('maps phone, email, address and drops unknown gender', () => {
    const r = map({
      contacts: [
        contact({
          tempId: 'c1',
          phone: '555-1212',
          email: 'm@e.com',
          gender: 'unknown',
          address: { line1: '12 Main', city: 'Springfield', state: 'IL' },
        }),
      ],
    })
    expect(r.contacts[0].phone).toBe('555-1212')
    expect(r.contacts[0].email).toBe('m@e.com')
    expect(r.contacts[0].gender).toBeUndefined()
    expect(r.contacts[0].address).toEqual({
      line1: '12 Main',
      city: 'Springfield',
      state: 'IL',
    })
  })

  it('keeps a real gender value', () => {
    const r = map({ contacts: [contact({ tempId: 'c1', gender: 'female' })] })
    expect(r.contacts[0].gender).toBe('female')
  })

  it('skips contacts missing a tempId or name', () => {
    const r = map({
      contacts: [
        contact({ tempId: '', name: 'No Id' }),
        { tempId: 'c2', name: '   ' } as NotesImportDtoContact,
      ],
    })
    expect(r.contacts).toHaveLength(0)
  })
})

describe('mapNotesImport — visits', () => {
  it('links a visit to a NEW contact via contactTempId', () => {
    const r = map({
      contacts: [contact({ tempId: 'c1', name: 'Maria' })],
      visits: [visit({ ref: 'v1', contactTempId: 'c1', note: 'Talked hope' })],
    })
    expect(r.visits).toHaveLength(1)
    expect(r.visits[0]).toMatchObject({
      id: `notes-${HASH}-v-v1`,
      contact: { id: `notes-${HASH}-c-c1` },
      note: 'Talked hope',
      isBibleStudy: false,
    })
  })

  it('links a visit to an EXISTING contact id as-is', () => {
    const r = map({
      visits: [visit({ ref: 'v1', contactId: 'existing-contact-9' })],
    })
    expect(r.visits[0].contact.id).toBe('existing-contact-9')
  })

  it('drops a visit that resolves to no contact', () => {
    const r = map({ visits: [visit({ ref: 'v1' })] })
    expect(r.visits).toHaveLength(0)
  })

  it('falls back to an index-based id when ref is absent', () => {
    const r = map({
      visits: [visit({ contactId: 'x' }), visit({ contactId: 'x' })],
    })
    expect(r.visits.map((v) => v.id)).toEqual([
      `notes-${HASH}-v-i0`,
      `notes-${HASH}-v-i1`,
    ])
  })

  it('maps bible study, not-at-home and follow-up', () => {
    const r = map({
      visits: [
        visit({
          ref: 'v1',
          contactId: 'x',
          isBibleStudy: true,
        }),
        visit({ ref: 'v2', contactId: 'x', notAtHome: true }),
        visit({
          ref: 'v3',
          contactId: 'x',
          followUp: { date: '2026-06-20', topic: 'Romans' },
        }),
      ],
    })
    expect(r.visits[0].isBibleStudy).toBe(true)
    expect(r.visits[1].notAtHome).toBe(true)
    expect(r.visits[2].followUp).toEqual({
      date: new Date(Date.UTC(2026, 5, 20, 12)),
      notifyMe: false,
      topic: 'Romans',
    })
  })
})

describe('mapNotesImport — contact note seeding', () => {
  it('appends a contact note to the earliest visit', () => {
    const r = map({
      contacts: [contact({ tempId: 'c1', note: 'Do not call Sundays' })],
      visits: [
        visit({
          ref: 'v1',
          contactTempId: 'c1',
          date: '2026-06-05',
          note: 'Chat',
        }),
        visit({ ref: 'v2', contactTempId: 'c1', date: '2026-06-01' }),
      ],
    })
    const earliest = r.visits.find((v) => v.id === `notes-${HASH}-v-v2`)
    expect(earliest?.note).toBe('Do not call Sundays')
    const later = r.visits.find((v) => v.id === `notes-${HASH}-v-v1`)
    expect(later?.note).toBe('Chat')
  })

  it('synthesizes a note-visit when the contact has no visits', () => {
    const r = map({
      contacts: [contact({ tempId: 'c1', note: 'Met at door' })],
    })
    expect(r.visits).toHaveLength(1)
    expect(r.visits[0]).toMatchObject({
      id: `notes-${HASH}-c-c1-note`,
      contact: { id: `notes-${HASH}-c-c1` },
      note: 'Met at door',
      date: IMPORTED_AT,
    })
  })
})

describe('mapNotesImport — time entries & categories', () => {
  it('maps hours/minutes/date with no category', () => {
    const r = map({ timeEntries: [time({ ref: 't1', hours: 1, minutes: 30 })] })
    expect(r.timeEntries[0]).toMatchObject({
      id: `notes-${HASH}-t-t1`,
      hours: 1,
      minutes: 30,
    })
    expect(r.timeEntries[0].categoryId).toBeUndefined()
    expect(r.timeEntries[0].date.toISOString()).toBe('2026-06-01T12:00:00.000Z')
  })

  it('clamps out-of-range minutes', () => {
    const r = map({ timeEntries: [time({ ref: 't1', hours: 2, minutes: 90 })] })
    expect(r.timeEntries[0].minutes).toBe(59)
  })

  it('reuses an existing categoryId verbatim', () => {
    const r = map({
      timeEntries: [time({ ref: 't1', categoryId: 'existing-cat-1' })],
    })
    expect(r.timeEntries[0].categoryId).toBe('existing-cat-1')
    expect(r.categories).toHaveLength(0)
  })

  it('seeds a new named category and references it', () => {
    const r = map({
      categories: [{ name: 'Cart Witnessing', isCredit: false }],
      timeEntries: [time({ ref: 't1', categoryName: 'Cart Witnessing' })],
    })
    expect(r.categories).toEqual([
      expect.objectContaining({
        id: `notes-${HASH}-cat-cart-witnessing`,
        name: 'Cart Witnessing',
        isCredit: false,
      }),
    ])
    expect(r.timeEntries[0].categoryId).toBe(
      `notes-${HASH}-cat-cart-witnessing`
    )
    expect(r.timeEntries[0].credit).toBeUndefined()
  })

  it('collapses LDC/RBC into the builtin credit category', () => {
    const r = map({
      categories: [{ name: 'LDC', isCredit: true }],
      timeEntries: [
        time({ ref: 't1', categoryName: 'LDC' }),
        time({ ref: 't2', categoryName: 'RBC' }),
      ],
    })
    const ldc = r.categories.filter((c) => c.id === LDC_BUILTIN_CATEGORY_ID)
    expect(ldc).toHaveLength(1)
    expect(ldc[0].builtin).toBe(true)
    expect(r.timeEntries[0].categoryId).toBe(LDC_BUILTIN_CATEGORY_ID)
    expect(r.timeEntries[0].credit).toBe(true)
    expect(r.timeEntries[1].categoryId).toBe(LDC_BUILTIN_CATEGORY_ID)
  })

  it('marks an entry credit when the DTO flags it', () => {
    const r = map({ timeEntries: [time({ ref: 't1', credit: true })] })
    expect(r.timeEntries[0].credit).toBe(true)
  })

  it('seeds an on-the-fly category referenced only by a time entry', () => {
    const r = map({
      timeEntries: [time({ ref: 't1', categoryName: 'Bethel', credit: true })],
    })
    expect(r.categories).toHaveLength(1)
    expect(r.categories[0]).toMatchObject({ name: 'Bethel', isCredit: true })
    expect(r.timeEntries[0].credit).toBe(true)
  })
})

describe('mapNotesImport — publisher', () => {
  it('maps role + tenure start date', () => {
    const r = map({
      publisher: { role: 'regularPioneer', tenureStartDate: '2024-03-01' },
    })
    expect(r.publisher).toEqual({
      role: 'regularPioneer',
      tenureStartDate: new Date(Date.UTC(2024, 2, 1, 12)),
    })
  })

  it('is null when absent and tenure is null when omitted', () => {
    expect(map({}).publisher).toBeNull()
    expect(map({ publisher: { role: 'publisher' } }).publisher).toEqual({
      role: 'publisher',
      tenureStartDate: null,
    })
  })
})

describe('mapNotesImport — warnings', () => {
  it('resolves each target ref to a final store id', () => {
    const r = map({
      contacts: [contact({ tempId: 'c1' })],
      visits: [visit({ ref: 'v1', contactTempId: 'c1' })],
      categories: [{ name: 'Bethel', isCredit: true }],
      timeEntries: [time({ ref: 't1', categoryName: 'Bethel' })],
      publisher: { role: 'regularPioneer' },
      warnings: [
        warn({ id: 'w1', target: { kind: 'contact', ref: 'c1' } }),
        warn({ id: 'w2', target: { kind: 'visit', ref: 'v1' } }),
        warn({ id: 'w3', target: { kind: 'timeEntry', ref: 't1' } }),
        warn({ id: 'w4', target: { kind: 'category', ref: 'Bethel' } }),
        warn({ id: 'w5', target: { kind: 'publisher', ref: 'publisher' } }),
      ],
    })
    expect(r.warnings.map((w) => w.target?.id)).toEqual([
      `notes-${HASH}-c-c1`,
      `notes-${HASH}-v-v1`,
      `notes-${HASH}-t-t1`,
      `notes-${HASH}-cat-bethel`,
      'publisher',
    ])
  })

  it('keeps a general warning with no target', () => {
    const r = map({
      warnings: [warn({ id: 'w1', severity: 'warning', message: 'Vague' })],
    })
    expect(r.warnings[0]).toEqual({
      id: 'w1',
      severity: 'warning',
      message: 'Vague',
    })
  })

  it('drops a dangling target but keeps the warning', () => {
    const r = map({
      warnings: [warn({ id: 'w1', target: { kind: 'contact', ref: 'ghost' } })],
    })
    expect(r.warnings[0].target).toBeUndefined()
    expect(r.warnings[0].id).toBe('w1')
  })
})

describe('mapNotesImport — dates & determinism', () => {
  it('honors a full datetime and falls back on garbage', () => {
    const r = map({
      visits: [
        visit({ ref: 'v1', contactId: 'x', date: '2026-06-01T09:30:00-05:00' }),
        visit({ ref: 'v2', contactId: 'x', date: 'not-a-date' }),
      ],
    })
    expect(r.visits[0].date.toISOString()).toBe('2026-06-01T14:30:00.000Z')
    expect(r.visits[1].date).toEqual(IMPORTED_AT)
  })

  it('produces identical ids for identical input + hash', () => {
    const input: Partial<NotesImportResult> = {
      contacts: [contact({ tempId: 'c1' })],
      visits: [visit({ ref: 'v1', contactTempId: 'c1' })],
    }
    const a = map(input)
    const b = map(input)
    expect(a.contacts[0].id).toBe(b.contacts[0].id)
    expect(a.visits[0].id).toBe(b.visits[0].id)
  })

  it('maps an empty result to empty arrays', () => {
    const r = map({})
    expect(r.contacts).toHaveLength(0)
    expect(r.visits).toHaveLength(0)
    expect(r.timeEntries).toHaveLength(0)
    expect(r.categories).toHaveLength(0)
    expect(r.warnings).toHaveLength(0)
    expect(r.publisher).toBeNull()
    expect(r.customFieldDefs).toHaveLength(0)
  })
})
