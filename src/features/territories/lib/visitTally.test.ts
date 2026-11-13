import { describe, expect, it } from 'vitest'
import { CORRECTION_MS, logDoor } from '@/features/territories/lib/doors'
import {
  addPastVisits,
  cellKeyAt,
  EMPTY_TALLY,
  forgetDoors,
  GONE_KEPT_MS,
  MIN_INSIGHT_VISITS,
  parseCellKey,
  tallyDoors,
  tallyTotal,
  type TallyOptions,
  type VisitTally,
} from '@/features/territories/lib/visitTally'
import type {
  DoorOutcome,
  Territory,
  TerritoryDoor,
  TerritoryStreet,
} from '@/features/territories/types/territory'

const SATURDAY_10AM = new Date(2026, 10, 7, 10, 15).getTime()
const TUESDAY_2PM = new Date(2026, 10, 10, 14, 5).getTime()
const HOUR = 60 * 60 * 1000
const WEEK = 7 * 24 * HOUR

const options = (patch: Partial<TallyOptions> = {}): TallyOptions => ({
  now: 0,
  title: (t) => `Territory ${t.number}`,
  keepGone: true,
  ...patch,
})

const door = (
  id: string,
  outcome: DoorOutcome,
  at: number,
  patch: Partial<TerritoryDoor> = {}
): TerritoryDoor => ({ id, label: id, outcome, at, tries: 1, ...patch })

const street = (doors: TerritoryDoor[]): TerritoryStreet => ({
  id: 's1',
  name: 'Oak',
  numbering: 'both',
  next: 1,
  doors,
})

const territory = (
  doors: TerritoryDoor[],
  patch: Partial<Territory> = {}
): Territory => ({
  id: 't1',
  number: '14',
  checkedOutAt: 0,
  createdAt: 0,
  doNotCalls: [],
  streets: [street(doors)],
  ...patch,
})

const record = (
  doors: TerritoryDoor[],
  entry: { label: string; outcome: DoorOutcome; at: number; untimed?: boolean }
) => logDoor(street(doors), { id: entry.label, ...entry }).doors

const cells = (tally: VisitTally, id = 't1') =>
  tally.territories[id]?.cells ?? {}

const cell = (tally: VisitTally, at: number, id = 't1') =>
  cells(tally, id)[cellKeyAt(at)]

describe('cell keys', () => {
  it('carry the month, weekday and hour', () => {
    const date = new Date(SATURDAY_10AM)
    expect(parseCellKey(cellKeyAt(SATURDAY_10AM))).toEqual({
      month: date.getFullYear() * 12 + date.getMonth(),
      day: 6,
      hour: 10,
    })
    expect(parseCellKey('nonsense')).toBeUndefined()
  })
})

describe('tallyDoors', () => {
  it('counts each recorded door in its territory, weekday and hour', () => {
    const tally = tallyDoors(
      EMPTY_TALLY,
      [
        territory([
          door('a', 'spoke', SATURDAY_10AM),
          door('b', 'notHome', SATURDAY_10AM + 60_000),
          door('c', 'notHome', TUESDAY_2PM),
          door('d', 'doNotCall', TUESDAY_2PM),
        ]),
        territory([door('e', 'spoke', TUESDAY_2PM)], {
          id: 't2',
          number: '15',
        }),
      ],
      options()
    )
    expect(cell(tally, SATURDAY_10AM)).toEqual([1, 1])
    expect(cell(tally, TUESDAY_2PM)).toEqual([0, 1])
    expect(cell(tally, TUESDAY_2PM, 't2')).toEqual([1, 0])
    expect(tally.territories.t2.title).toBe('Territory 15')
    expect(tallyTotal(tally)).toBe(4)
  })

  it('counts a door once however often the territories change', () => {
    const territories = [territory([door('a', 'spoke', SATURDAY_10AM)])]
    const once = tallyDoors(EMPTY_TALLY, territories, options())
    expect(tallyDoors(once, territories, options())).toBe(once)
  })

  it('counts every visit in a door history, including ones synced in later', () => {
    const answered = record([door('a', 'notHome', TUESDAY_2PM)], {
      label: 'a',
      outcome: 'spoke',
      at: SATURDAY_10AM + WEEK,
    })
    const tally = tallyDoors(EMPTY_TALLY, [territory(answered)], options())
    expect(cell(tally, TUESDAY_2PM)).toEqual([0, 1])
    expect(cell(tally, SATURDAY_10AM + WEEK)).toEqual([1, 0])
    expect(tally.doors.a.visits).toHaveLength(2)
  })

  it('swaps a quick correction for what it corrected', () => {
    const first = [door('a', 'notHome', SATURDAY_10AM)]
    const counted = tallyDoors(EMPTY_TALLY, [territory(first)], options())
    const fixed = record(first, {
      label: 'a',
      outcome: 'spoke',
      at: SATURDAY_10AM + CORRECTION_MS / 2,
    })
    const tally = tallyDoors(counted, [territory(fixed)], options())
    expect(cell(tally, SATURDAY_10AM)).toEqual([1, 0])
    expect(tally.doors.a.visits).toHaveLength(1)
  })

  it('drops a visit that was undone back to the earlier record', () => {
    const earlier = [door('a', 'notHome', TUESDAY_2PM)]
    const later = record(earlier, {
      label: 'a',
      outcome: 'spoke',
      at: SATURDAY_10AM + WEEK,
    })
    const both = tallyDoors(EMPTY_TALLY, [territory(later)], options())
    const undone = tallyDoors(both, [territory(earlier)], options())
    expect(cell(undone, TUESDAY_2PM)).toEqual([0, 1])
    expect(cell(undone, SATURDAY_10AM + WEEK)).toBeUndefined()
    expect(undone.doors.a.visits).toEqual([[TUESDAY_2PM, 'n']])
  })

  it('never counts doors added from notes until recorded at the door', () => {
    const noted = record([], {
      label: 'a',
      outcome: 'notHome',
      at: TUESDAY_2PM,
      untimed: true,
    })
    const skipped = tallyDoors(EMPTY_TALLY, [territory(noted)], options())
    expect(cells(skipped)).toEqual({})
    const answered = record(noted, {
      label: 'a',
      outcome: 'spoke',
      at: SATURDAY_10AM + WEEK,
    })
    const tally = tallyDoors(skipped, [territory(answered)], options())
    expect(cells(tally)).toEqual({
      [cellKeyAt(SATURDAY_10AM + WEEK)]: [1, 0],
    })
  })

  it('keeps the counts when a returned territory clears its doors', () => {
    const counted = tallyDoors(
      EMPTY_TALLY,
      [territory([door('a', 'spoke', SATURDAY_10AM)])],
      options()
    )
    const cleared = tallyDoors(counted, [territory([])], options({ now: 5 }))
    expect(cleared.doors.a.goneAt).toBe(5)
    expect(cell(cleared, SATURDAY_10AM)).toEqual([1, 0])
    const later = tallyDoors(
      cleared,
      [],
      options({ now: 5 + GONE_KEPT_MS + 1 })
    )
    expect(later.doors).toEqual({})
    expect(cell(later, SATURDAY_10AM)).toEqual([1, 0])
    expect(later.territories.t1.title).toBe('Territory 14')
  })

  it("doesn't count a door twice when it briefly goes missing", () => {
    const doors = [door('a', 'spoke', SATURDAY_10AM)]
    const counted = tallyDoors(EMPTY_TALLY, [territory(doors)], options())
    const gone = tallyDoors(counted, [territory([])], options({ now: 5 }))
    const back = tallyDoors(gone, [territory(doors)], options({ now: 9 }))
    expect(cell(back, SATURDAY_10AM)).toEqual([1, 0])
    expect(back.doors.a.goneAt).toBeUndefined()
  })

  it('keeps no door records in privacy mode, only the counts', () => {
    const counted = tallyDoors(
      EMPTY_TALLY,
      [territory([door('a', 'spoke', SATURDAY_10AM)])],
      options()
    )
    const cleared = tallyDoors(
      counted,
      [territory([])],
      options({ keepGone: false })
    )
    expect(cleared.doors).toEqual({})
    expect(cell(cleared, SATURDAY_10AM)).toEqual([1, 0])
  })

  it('notes when there are first enough visits', () => {
    const doors = Array.from({ length: MIN_INSIGHT_VISITS }, (_, i) =>
      door(`d${i}`, i % 2 ? 'spoke' : 'notHome', SATURDAY_10AM + i * HOUR)
    )
    const short = tallyDoors(
      EMPTY_TALLY,
      [territory(doors.slice(1))],
      options({ now: 5 })
    )
    expect(short.readyAt).toBeUndefined()
    const ready = tallyDoors(short, [territory(doors)], options({ now: 9 }))
    expect(ready.readyAt).toBe(9)
    expect(
      tallyDoors(ready, [territory([])], options({ now: 20 })).readyAt
    ).toBe(9)
  })
})

describe('forgetDoors', () => {
  it('uncounts every visit of a door removed by mistake', () => {
    const both = record([door('a', 'notHome', TUESDAY_2PM)], {
      label: 'a',
      outcome: 'spoke',
      at: SATURDAY_10AM + WEEK,
    })
    const counted = tallyDoors(EMPTY_TALLY, [territory(both)], options())
    const forgotten = forgetDoors(counted, ['a'], 0)
    expect(cells(forgotten)).toEqual({})
    expect(forgotten.doors).toEqual({})
  })
})

describe('addPastVisits', () => {
  it('adds visits to a territory without doors', () => {
    const tally = addPastVisits(
      EMPTY_TALLY,
      { id: 't9', title: 'Territory 9' },
      [
        { at: SATURDAY_10AM, outcome: 'spoke' },
        { at: SATURDAY_10AM, outcome: 'notHome' },
        { at: SATURDAY_10AM, outcome: 'doNotCall' },
      ],
      0
    )
    expect(cell(tally, SATURDAY_10AM, 't9')).toEqual([1, 1])
    expect(tally.territories.t9.title).toBe('Territory 9')
    expect(tally.doors).toEqual({})
  })
})
