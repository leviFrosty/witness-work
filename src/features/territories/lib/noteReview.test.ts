import { describe, expect, it } from 'vitest'
import {
  entriesWithoutStreet,
  entryFromProblem,
  groupNoteEntries,
  noteFlags,
  readyNoteDoors,
} from '@/features/territories/lib/noteReview'
import { parseDoorNotes } from '@/features/territories/lib/parseDoorNotes'
import type { Territory } from '@/features/territories/types/territory'

const territory: Territory = {
  id: 't',
  number: '4',
  checkedOutAt: 0,
  createdAt: 0,
  streets: [
    {
      id: 'oak',
      name: 'Oak Street',
      numbering: 'both',
      next: 1,
      doors: [
        { id: 'd12', label: '12', outcome: 'notHome', at: 5, tries: 1 },
        { id: 'd18', label: '18', outcome: 'doNotCall', at: 6, tries: 1 },
      ],
    },
    { id: 'elm', name: 'Elm Road', numbering: 'even', next: 2, doors: [] },
  ],
  doNotCalls: [
    { id: 'n1', address: '30 Elm Road', at: 7, streetId: 'elm', label: '30' },
  ],
}

const format = (street: { name: string }, door: { label: string }) =>
  `${door.label} ${street.name}`

const parse = (text: string) =>
  parseDoorNotes(text, { streets: territory.streets }).entries

describe('groupNoteEntries', () => {
  it('groups by street, then by unknown heading, in note order', () => {
    const groups = groupNoteEntries(
      parse('Elm Road\n2 NH\nBirch Street\n4 NH\nOak St\n6 NH\nElm Rd\n8 NH')
    )
    expect(
      groups.map((group) => [group.key, group.entries.map((e) => e.label)])
    ).toEqual([
      ['street:elm', ['2', '8']],
      ['heading:Birch Street', ['4']],
      ['street:oak', ['6']],
    ])
  })
})

describe('noteFlags', () => {
  it('flags a house already recorded on the street', () => {
    const entries = parse('Oak St\n12 spoke')
    expect(noteFlags(entries[0], entries, territory, format).recorded?.id).toBe(
      'd12'
    )
  })

  it('flags a house on the do-not-call list', () => {
    const entries = parse('Elm Rd\n30 NH\nOak St\n18 NH')
    expect(
      noteFlags(entries[0], entries, territory, format).doNotCall?.id
    ).toBe('n1')
    const oak = noteFlags(entries[1], entries, territory, format)
    expect(oak.doNotCall?.id).toBe('d18')
    expect(oak.recorded).toBeUndefined()
  })

  it('flags a house listed twice on one street', () => {
    const entries = parse('Oak St\n3 NH\n3 spoke\nElm Rd\n4 NH')
    expect(
      entries.map((e) => noteFlags(e, entries, territory, format).twice)
    ).toEqual([true, true, false])
  })

  it('marks the first entry of a range', () => {
    const entries = parse('Elm Rd\n2-6 NH')
    expect(
      entries.map((e) => noteFlags(e, entries, territory, format).rangeStart)
    ).toEqual([true, false, false])
  })
})

describe('entryFromProblem', () => {
  it('starts from the first number and any outcome in the line', () => {
    expect(
      entryFromProblem(
        {
          key: 'u1',
          text: '16 blue house no answer',
          line: 1,
          source: '16 blue house no answer',
          streetId: 'oak',
        },
        undefined
      )
    ).toMatchObject({
      label: '16',
      outcome: 'notHome',
      streetId: 'oak',
      written: '16 blue house no answer',
    })
    expect(
      entryFromProblem(
        { key: 'u2', text: 'lady said do not call', line: 2, source: '' },
        'elm'
      )
    ).toMatchObject({ label: '', outcome: 'doNotCall', streetId: 'elm' })
  })

  it('keeps an unknown heading instead of the fallback street', () => {
    expect(
      entryFromProblem(
        { key: 'u3', text: '4 x', line: 3, source: '4 x', heading: 'Birch' },
        'elm'
      )
    ).toMatchObject({ streetId: undefined, heading: 'Birch' })
  })
})

describe('readyNoteDoors', () => {
  it('keeps only entries with a street and a number', () => {
    const entries = parse('Birch Street\n4 NH\nOak St\n6 spoke')
    entries.push({ ...entries[1], key: 'blank', label: ' ' })
    expect(readyNoteDoors(entries)).toEqual([
      { streetId: 'oak', label: '6', outcome: 'spoke' },
    ])
    expect(entriesWithoutStreet(entries)).toBe(1)
  })
})
