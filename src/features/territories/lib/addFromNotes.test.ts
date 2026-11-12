import { describe, expect, it } from 'vitest'
import {
  addNoteDoors,
  findPerson,
  noteDoorCount,
  notesAuthorName,
  notesAuthorReady,
  undoNoteDoors,
} from '@/features/territories/lib/addFromNotes'
import { territoryDoNotCalls } from '@/features/territories/lib/doors'
import type {
  Territory,
  TerritoryStreet,
} from '@/features/territories/types/territory'

const DAY = 24 * 60 * 60 * 1000
const today = new Date(2026, 10, 11, 15).getTime()
const lastWeek = today - 7 * DAY

const street = (
  id: string,
  change: Partial<TerritoryStreet> = {}
): TerritoryStreet => ({
  id,
  name: `${id} Street`,
  numbering: 'both',
  next: 1,
  doors: [],
  ...change,
})

const territory = (change: Partial<Territory> = {}): Territory => ({
  id: 't',
  number: '12',
  checkedOutAt: lastWeek - DAY,
  streets: [
    street('oak', {
      next: 14,
      doors: [
        {
          id: 'had',
          label: '12',
          outcome: 'notHome',
          at: lastWeek - DAY,
          tries: 1,
          coordinate: { latitude: 1, longitude: 2 },
        },
      ],
    }),
    street('elm'),
  ],
  doNotCalls: [],
  createdAt: lastWeek,
  ...change,
})

const ids = () => {
  let count = 0
  return () => `id${++count}`
}

const format = (s: { name: string }, door: { label: string }) =>
  `${door.label} ${s.name}`

describe('addNoteDoors', () => {
  it('adds new doors with the chosen date and no map pin', () => {
    const { territory: saved } = addNoteDoors(
      territory(),
      [
        { streetId: 'oak', label: '14', outcome: 'notHome' },
        { streetId: 'elm', label: '3', outcome: 'spoke' },
      ],
      { at: lastWeek, newId: ids() }
    )
    const oak = saved.streets[0]
    const added = oak.doors.find((door) => door.label === '14')
    expect(added).toMatchObject({ outcome: 'notHome', at: lastWeek, tries: 1 })
    expect(added?.coordinate).toBeUndefined()
    expect(saved.streets[1].doors).toHaveLength(1)
    expect(oak.next).toBe(15)
  })

  it('records a repeat visit the way the recorder does', () => {
    const { territory: saved } = addNoteDoors(
      territory(),
      [{ streetId: 'oak', label: '12', outcome: 'spoke' }],
      { at: lastWeek, newId: ids() }
    )
    const doors = saved.streets[0].doors
    expect(doors).toHaveLength(1)
    expect(doors[0]).toMatchObject({
      id: 'had',
      outcome: 'spoke',
      at: lastWeek,
      tries: 2,
    })
  })

  it('puts do-not-calls on the territory list with the chosen date', () => {
    const { territory: saved } = addNoteDoors(
      territory(),
      [{ streetId: 'elm', label: '7', outcome: 'doNotCall' }],
      { at: lastWeek, newId: ids() }
    )
    expect(territoryDoNotCalls(saved, format)).toEqual([
      expect.objectContaining({
        address: '7 elm Street',
        at: lastWeek,
        streetId: 'elm',
        fromDoor: true,
      }),
    ])
  })

  it('records who worked the doors as a guest of the territory', () => {
    const { territory: saved, undo } = addNoteDoors(
      territory(),
      [{ streetId: 'elm', label: '3', outcome: 'spoke' }],
      { at: lastWeek, recordedBy: '  Ana R. ', newId: ids() }
    )
    expect(saved.people).toEqual([{ id: 'id1', name: 'Ana R.', kind: 'guest' }])
    expect(saved.streets[1].doors[0].by).toBe('id1')
    expect(undo.personId).toBe('id1')
  })

  it('reuses a person already on the territory', () => {
    const before = territory({
      people: [{ id: 'p1', name: 'Ana R.', kind: 'buddy' }],
    })
    const { territory: saved, undo } = addNoteDoors(
      before,
      [{ streetId: 'elm', label: '3', outcome: 'spoke' }],
      { at: lastWeek, recordedBy: 'ana r.', newId: ids() }
    )
    expect(saved.people).toHaveLength(1)
    expect(saved.streets[1].doors[0].by).toBe('p1')
    expect(undo.personId).toBeUndefined()
  })

  it('keeps the last outcome when the notes list a house twice', () => {
    const { territory: saved } = addNoteDoors(
      territory(),
      [
        { streetId: 'elm', label: '3', outcome: 'notHome' },
        { streetId: 'elm', label: '3', outcome: 'spoke' },
      ],
      { at: lastWeek, newId: ids() }
    )
    expect(saved.streets[1].doors).toEqual([
      expect.objectContaining({ label: '3', outcome: 'spoke', tries: 1 }),
    ])
  })

  it('skips doors for streets that are gone and blank labels', () => {
    const { territory: saved, undo } = addNoteDoors(
      territory(),
      [
        { streetId: 'gone', label: '3', outcome: 'spoke' },
        { streetId: 'elm', label: '  ', outcome: 'spoke' },
      ],
      { at: lastWeek, newId: ids() }
    )
    expect(saved.streets[1].doors).toEqual([])
    expect(undo.streets).toEqual([
      { streetId: 'elm', added: [], previous: [], next: 1 },
    ])
  })
})

describe('undoNoteDoors', () => {
  it('removes exactly what was added and restores what was changed', () => {
    const before = territory()
    const { territory: saved, undo } = addNoteDoors(
      before,
      [
        { streetId: 'oak', label: '12', outcome: 'doNotCall' },
        { streetId: 'oak', label: '14', outcome: 'notHome' },
        { streetId: 'oak', label: '14', outcome: 'spoke' },
        { streetId: 'elm', label: '3', outcome: 'spoke' },
      ],
      { at: lastWeek, recordedBy: 'Ana', newId: ids() }
    )
    const later = {
      ...saved,
      streets: saved.streets.map((s) =>
        s.id === 'elm'
          ? {
              ...s,
              doors: [
                ...s.doors,
                {
                  id: 'mine',
                  label: '5',
                  outcome: 'notHome' as const,
                  at: today,
                  tries: 1,
                },
              ],
            }
          : s
      ),
    }
    const undone = undoNoteDoors(later, undo)
    expect(undone.streets[0]).toEqual(before.streets[0])
    expect(undone.streets[1].doors.map((door) => door.id)).toEqual(['mine'])
    expect(undone.people).toEqual([])
  })
})

describe('findPerson', () => {
  it('matches names regardless of case and spacing', () => {
    const t = territory({ people: [{ id: 'p', name: 'Ana', kind: 'guest' }] })
    expect(findPerson(t, ' ANA ')?.id).toBe('p')
    expect(findPerson(t, '')).toBeUndefined()
  })
})

describe('noteDoorCount', () => {
  it('counts one outcome', () => {
    expect(
      noteDoorCount(
        [
          { streetId: 'a', label: '1', outcome: 'doNotCall' },
          { streetId: 'a', label: '2', outcome: 'spoke' },
        ],
        'doNotCall'
      )
    ).toBe(1)
  })
})

describe('notesAuthorName', () => {
  const people = {
    people: [{ id: 'p1', name: 'Marta Silva', kind: 'buddy' as const }],
  }

  it('records nobody else when I worked them', () => {
    expect(notesAuthorName(people, { kind: 'me' })).toBeUndefined()
  })

  it('names a person on the territory', () => {
    expect(notesAuthorName(people, { kind: 'person', personId: 'p1' })).toBe(
      'Marta Silva'
    )
  })

  it('uses a typed name, trimmed', () => {
    expect(notesAuthorName(people, { kind: 'other', name: ' Ana Ruiz ' })).toBe(
      'Ana Ruiz'
    )
  })
})

describe('notesAuthorReady', () => {
  it('waits for a name when someone else worked them', () => {
    expect(notesAuthorReady({ kind: 'other', name: ' ' })).toBe(false)
    expect(notesAuthorReady({ kind: 'other', name: 'Ana' })).toBe(true)
    expect(notesAuthorReady({ kind: 'me' })).toBe(true)
  })
})
