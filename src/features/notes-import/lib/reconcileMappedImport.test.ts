import { describe, it, expect } from 'vitest'
import {
  reconcileMappedImport,
  normalizeReconcileName,
  type ReconcileSnapshot,
} from '@/features/notes-import/lib/reconcileMappedImport'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'
import type { MappedImport } from '@/lib/import/types'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { TimeEntry } from '@/types/timeEntry'
import type { Category } from '@/types/category'

const at = new Date('2026-06-01T12:00:00Z')

const contact = (id: string, name: string): Contact => ({
  id,
  name,
  createdAt: at,
})
const visit = (id: string, contactId: string): Visit => ({
  id,
  contact: { id: contactId },
  date: at,
  isBibleStudy: false,
})
const timeEntry = (id: string, categoryId?: string): TimeEntry => ({
  id,
  hours: 1,
  minutes: 0,
  date: at,
  ...(categoryId ? { categoryId } : {}),
})
const category = (id: string, name: string): Category => ({
  id,
  name,
  isCredit: false,
})

const mapped = (over: Partial<MappedImport> = {}): MappedImport => ({
  contacts: [],
  visits: [],
  timeEntries: [],
  categories: [],
  customFieldDefs: [],
  publisher: null,
  ...over,
})

const empty: ReconcileSnapshot = { contacts: [], categories: [] }

describe('normalizeReconcileName', () => {
  it('trims, lowercases, and collapses whitespace', () => {
    expect(normalizeReconcileName('  John   Smith ')).toBe('john smith')
    expect(normalizeReconcileName('MARIA')).toBe('maria')
  })
})

describe('reconcileMappedImport — contacts', () => {
  it('attaches a uniquely-name-matched new contact to the existing record', () => {
    const input = mapped({
      contacts: [contact('notes-h-c-c1', 'Maria Lopez')],
      visits: [visit('notes-h-v-v1', 'notes-h-c-c1')],
    })
    const snapshot: ReconcileSnapshot = {
      contacts: [{ id: 'existing-maria', name: 'maria  lopez' }],
      categories: [],
    }
    const { mapped: out, warnings } = reconcileMappedImport(input, snapshot)

    // The duplicate contact is NOT inserted...
    expect(out.contacts).toHaveLength(0)
    // ...and its visit is re-pointed onto the existing contact.
    expect(out.visits[0].contact.id).toBe('existing-maria')
    expect(warnings).toHaveLength(0)
  })

  it('keeps a non-matching new contact as a fresh insert', () => {
    const input = mapped({
      contacts: [contact('notes-h-c-c1', 'New Person')],
      visits: [visit('notes-h-v-v1', 'notes-h-c-c1')],
    })
    const snapshot: ReconcileSnapshot = {
      contacts: [{ id: 'existing', name: 'Someone Else' }],
      categories: [],
    }
    const { mapped: out, warnings } = reconcileMappedImport(input, snapshot)
    expect(out.contacts).toHaveLength(1)
    expect(out.visits[0].contact.id).toBe('notes-h-c-c1') // unchanged
    expect(warnings).toHaveLength(0)
  })

  it('fails safe on an ambiguous match: imports new + warns, never auto-merges', () => {
    const input = mapped({
      contacts: [contact('notes-h-c-c1', 'John Smith')],
      visits: [visit('notes-h-v-v1', 'notes-h-c-c1')],
    })
    const snapshot: ReconcileSnapshot = {
      contacts: [
        { id: 'john-a', name: 'John Smith' },
        { id: 'john-b', name: 'john smith' },
      ],
      categories: [],
    }
    const { mapped: out, warnings } = reconcileMappedImport(input, snapshot)
    expect(out.contacts).toHaveLength(1) // imported as new
    expect(out.visits[0].contact.id).toBe('notes-h-c-c1') // not re-pointed
    expect(warnings).toHaveLength(1)
    expect(warnings[0].severity).toBe('warning')
    expect(warnings[0].target).toEqual({ kind: 'contact', id: 'notes-h-c-c1' })
  })

  it('does not re-point onto itself when the same import was already committed', () => {
    const input = mapped({
      contacts: [contact('notes-h-c-c1', 'Maria')],
      visits: [visit('notes-h-v-v1', 'notes-h-c-c1')],
    })
    // Snapshot already contains this import's own contact (re-accept scenario).
    const snapshot: ReconcileSnapshot = {
      contacts: [{ id: 'notes-h-c-c1', name: 'Maria' }],
      categories: [],
    }
    const { mapped: out } = reconcileMappedImport(input, snapshot)
    // Treated as already-present (no spurious self-remap); commit layer skips by id.
    expect(out.contacts).toHaveLength(1)
    expect(out.visits[0].contact.id).toBe('notes-h-c-c1')
  })
})

describe('reconcileMappedImport — categories', () => {
  it('re-points a name-matched new category and drops it from the insert set', () => {
    const input = mapped({
      categories: [category('notes-h-cat-bethel', 'Bethel')],
      timeEntries: [timeEntry('notes-h-t-t1', 'notes-h-cat-bethel')],
    })
    const snapshot: ReconcileSnapshot = {
      contacts: [],
      categories: [{ id: 'existing-bethel', name: 'bethel' }],
    }
    const { mapped: out } = reconcileMappedImport(input, snapshot)
    expect(out.categories).toHaveLength(0)
    expect(out.timeEntries[0].categoryId).toBe('existing-bethel')
  })

  it('never reconciles the shared LDC builtin category', () => {
    const input = mapped({
      categories: [
        { id: LDC_BUILTIN_CATEGORY_ID, name: 'LDC', isCredit: true },
      ],
      timeEntries: [timeEntry('notes-h-t-t1', LDC_BUILTIN_CATEGORY_ID)],
    })
    const snapshot: ReconcileSnapshot = {
      contacts: [],
      categories: [{ id: LDC_BUILTIN_CATEGORY_ID, name: 'LDC' }],
    }
    const { mapped: out } = reconcileMappedImport(input, snapshot)
    expect(out.categories).toHaveLength(1)
    expect(out.timeEntries[0].categoryId).toBe(LDC_BUILTIN_CATEGORY_ID)
  })
})

describe('reconcileMappedImport — passthrough', () => {
  it('returns the input unchanged when there is nothing to match', () => {
    const input = mapped({
      contacts: [contact('notes-h-c-c1', 'Solo')],
      visits: [visit('notes-h-v-v1', 'notes-h-c-c1')],
      timeEntries: [timeEntry('notes-h-t-t1')],
    })
    const { mapped: out, warnings } = reconcileMappedImport(input, empty)
    expect(out.contacts).toHaveLength(1)
    expect(out.visits).toBe(input.visits) // same ref — no needless copy
    expect(out.timeEntries).toBe(input.timeEntries)
    expect(warnings).toHaveLength(0)
  })

  it('uses injected messages for ambiguity copy', () => {
    const input = mapped({ contacts: [contact('notes-h-c-c1', 'Dup')] })
    const snapshot: ReconcileSnapshot = {
      contacts: [
        { id: 'a', name: 'Dup' },
        { id: 'b', name: 'Dup' },
      ],
      categories: [],
    }
    const { warnings } = reconcileMappedImport(input, snapshot, {
      ambiguousContact: (name) => `AMBIG:${name}`,
      ambiguousCategory: (name) => `CAT:${name}`,
    })
    expect(warnings[0].message).toBe('AMBIG:Dup')
  })
})
