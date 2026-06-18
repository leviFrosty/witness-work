import { describe, it, expect } from 'vitest'
import { mapNotesImport } from '@/features/notes-import/lib/mapNotesImport'
import {
  buildNotesImportPreview,
  selectMappedImport,
} from '@/features/notes-import/lib/buildNotesImportPreview'
import type { NotesImportResult } from '@/features/notes-import/lib/notesImportTypes'

const HASH = 'h'
const AT = new Date('2026-06-08T12:00:00.000Z')

const base = (over: Partial<NotesImportResult>): NotesImportResult => ({
  contacts: [],
  visits: [],
  timeEntries: [],
  categories: [],
  publisher: null,
  warnings: [],
  ...over,
})

const map = (over: Partial<NotesImportResult>) =>
  mapNotesImport(base(over), { contentHash: HASH, importedAt: AT })

describe('buildNotesImportPreview', () => {
  it('attaches warnings to rows and starts error rows deselected', () => {
    const mapped = map({
      contacts: [
        { tempId: 'c1', name: 'Maria' },
        { tempId: 'c2', name: 'Guess' },
      ],
      warnings: [
        {
          id: 'w1',
          severity: 'error',
          message: 'Unsure',
          target: { kind: 'contact', ref: 'c2' },
        },
        { id: 'w2', severity: 'info', message: 'FYI' },
      ],
    })
    const { preview, selection } = buildNotesImportPreview(mapped)

    const guess = preview.contacts.find((r) => r.title === 'Guess')!
    expect(guess.severity).toBe('error')
    expect(guess.warnings).toHaveLength(1)
    // Error row is deselected; the clean row is selected.
    expect(selection.ids.has(guess.id)).toBe(false)
    expect(
      selection.ids.has(preview.contacts.find((r) => r.title === 'Maria')!.id)
    ).toBe(true)
    // Untargeted warning is general.
    expect(preview.generalWarnings.map((w) => w.id)).toEqual(['w2'])
  })

  it('totals service time across entries', () => {
    const mapped = map({
      timeEntries: [
        { ref: 't1', date: '2026-06-01', hours: 1, minutes: 30 },
        { ref: 't2', date: '2026-06-02', hours: 0, minutes: 45 },
      ],
    })
    expect(buildNotesImportPreview(mapped).preview.totalMinutes).toBe(135)
  })
})

describe('selectMappedImport', () => {
  it('drops a visit when its new contact is deselected', () => {
    const mapped = map({
      contacts: [{ tempId: 'c1', name: 'Maria' }],
      visits: [
        {
          ref: 'v1',
          contactTempId: 'c1',
          date: '2026-06-01',
          isBibleStudy: false,
        },
      ],
    })
    const { selection } = buildNotesImportPreview(mapped)
    selection.ids.delete(`notes-${HASH}-c-c1`) // deselect the contact

    const selected = selectMappedImport(mapped, selection)
    expect(selected.contacts).toHaveLength(0)
    expect(selected.visits).toHaveLength(0)
  })

  it('includes only categories referenced by selected time entries', () => {
    const mapped = map({
      categories: [{ name: 'Bethel', isCredit: true }],
      timeEntries: [
        {
          ref: 't1',
          date: '2026-06-01',
          hours: 1,
          minutes: 0,
          categoryName: 'Bethel',
        },
      ],
    })
    const { selection } = buildNotesImportPreview(mapped)
    // With the entry selected, its category rides along.
    expect(selectMappedImport(mapped, selection).categories).toHaveLength(1)

    // Deselect the entry → its category drops.
    selection.ids.delete(`notes-${HASH}-t-t1`)
    expect(selectMappedImport(mapped, selection).categories).toHaveLength(0)
  })
})
