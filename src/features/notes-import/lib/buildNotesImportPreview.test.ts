import { describe, it, expect } from 'vitest'
import { mapNotesImport } from '@/features/notes-import/lib/mapNotesImport'
import {
  buildNotesImportPreview,
  isEmptyPreview,
  selectMappedImport,
  setGroupSelection,
  setRowsSelection,
  togglePublisherSelection,
  toggleRowSelection,
  type PreviewSelection,
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
  summary: '',
  assistantMessage: '',
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

  it('keeps visit notes and follow-up details for review', () => {
    const mapped = map({
      contacts: [{ tempId: 'c1', name: 'Mindy' }],
      visits: [
        {
          ref: 'v1',
          contactTempId: 'c1',
          date: '2026-06-23',
          note: 'Listened to the Bible together.',
          isBibleStudy: false,
          followUp: {
            date: '2026-06-26',
            topic: 'Continue the discussion about hope.',
          },
        },
      ],
    })

    const [visit] = buildNotesImportPreview(mapped).preview.visits
    expect(visit.title).toBe('Listened to the Bible together.')
    expect(visit.followUp).toEqual({
      date: new Date('2026-06-26T12:00:00.000Z'),
      topic: 'Continue the discussion about hope.',
    })
  })
})

describe('isEmptyPreview', () => {
  it('is true when there are no records and no publisher', () => {
    expect(isEmptyPreview(buildNotesImportPreview(map({})).preview)).toBe(true)
  })

  it('is false when a record is present', () => {
    const mapped = map({ contacts: [{ tempId: 'c1', name: 'Maria' }] })
    expect(isEmptyPreview(buildNotesImportPreview(mapped).preview)).toBe(false)
  })

  it('is false when only a publisher is present', () => {
    const mapped = map({ publisher: { role: 'regularPioneer' } })
    expect(isEmptyPreview(buildNotesImportPreview(mapped).preview)).toBe(false)
  })
})

describe('PreviewSelection transitions', () => {
  const sel = (ids: string[], publisher = false): PreviewSelection => ({
    ids: new Set(ids),
    publisher,
  })

  /** Asserts a transition never mutated its input selection or its Set. */
  const assertUnmutated = (
    before: PreviewSelection,
    snapshotIds: string[],
    snapshotPublisher: boolean,
    after: PreviewSelection
  ) => {
    expect(after.ids).not.toBe(before.ids)
    expect([...before.ids]).toEqual(snapshotIds)
    expect(before.publisher).toBe(snapshotPublisher)
  }

  describe('toggleRowSelection', () => {
    it('adds an absent id then removes it on re-toggle', () => {
      const s0 = sel([])
      const s1 = toggleRowSelection(s0, 'a')
      expect(s1.ids.has('a')).toBe(true)
      const s2 = toggleRowSelection(s1, 'a')
      expect(s2.ids.has('a')).toBe(false)
    })

    it('leaves the publisher flag untouched', () => {
      expect(toggleRowSelection(sel([], true), 'a').publisher).toBe(true)
      expect(toggleRowSelection(sel([], false), 'a').publisher).toBe(false)
    })

    it('does not mutate the input or its Set', () => {
      const before = sel(['a'], true)
      const after = toggleRowSelection(before, 'b')
      assertUnmutated(before, ['a'], true, after)
    })
  })

  describe('togglePublisherSelection', () => {
    it('flips only the publisher flag, leaving ids alone', () => {
      const on = togglePublisherSelection(sel(['a'], false))
      expect(on.publisher).toBe(true)
      expect([...on.ids]).toEqual(['a'])
      expect(togglePublisherSelection(sel([], true)).publisher).toBe(false)
    })

    it('does not mutate the input (ids and publisher unchanged)', () => {
      const before = sel(['a'], false)
      togglePublisherSelection(before)
      expect([...before.ids]).toEqual(['a'])
      expect(before.publisher).toBe(false)
    })
  })

  describe('setRowsSelection', () => {
    it('adds a batch, including ids already present', () => {
      const after = setRowsSelection(sel(['a']), ['a', 'b', 'c'], true)
      expect([...after.ids].sort()).toEqual(['a', 'b', 'c'])
    })

    it('removes a batch, including ids already absent', () => {
      const after = setRowsSelection(sel(['a', 'b']), ['b', 'c'], false)
      expect([...after.ids]).toEqual(['a'])
    })

    it('does not mutate the input or its Set', () => {
      const before = sel(['a'], true)
      const after = setRowsSelection(before, ['b'], true)
      assertUnmutated(before, ['a'], true, after)
    })
  })

  describe('setGroupSelection', () => {
    const rows = [{ id: 'r1' }, { id: 'r2' }]

    it('adds every row in the group', () => {
      const after = setGroupSelection(sel(['x']), rows, true)
      expect([...after.ids].sort()).toEqual(['r1', 'r2', 'x'])
    })

    it('removes every row in the group', () => {
      const after = setGroupSelection(sel(['r1', 'r2', 'x']), rows, false)
      expect([...after.ids]).toEqual(['x'])
    })

    it('does not mutate the input or its Set', () => {
      const before = sel(['x'], false)
      const after = setGroupSelection(before, rows, true)
      assertUnmutated(before, ['x'], false, after)
    })
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
