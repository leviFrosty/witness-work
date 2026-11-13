import { describe, expect, it } from 'vitest'
import {
  matchesTerritoryFilters,
  sortTerritories,
} from '@/features/territories/lib/listView'
import type {
  Territory,
  TerritoryStreet,
} from '@/features/territories/types/territory'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date(2026, 5, 15).getTime()

const street = (change: Partial<TerritoryStreet> = {}): TerritoryStreet => ({
  id: Math.random().toString(36),
  name: 'Oak Street',
  numbering: 'both',
  next: 1,
  doors: [],
  ...change,
})

const territory = (change: Partial<Territory> = {}): Territory => ({
  id: change.number ?? 'id',
  number: '1',
  checkedOutAt: NOW - 10 * DAY,
  streets: [],
  doNotCalls: [],
  createdAt: NOW - 10 * DAY,
  ...change,
})

const numbers = (list: Territory[]) => list.map((item) => item.number)
const checkedOut = (item: Territory) => item.checkedOutAt
const newest = { sort: 'recent', direction: 'desc' } as const

describe('sortTerritories', () => {
  it('puts the most recent first by default', () => {
    const list = [
      territory({ number: '1', checkedOutAt: NOW - 30 * DAY }),
      territory({ number: '2', checkedOutAt: NOW - 5 * DAY }),
    ]
    expect(numbers(sortTerritories(list, newest, checkedOut))).toEqual([
      '2',
      '1',
    ])
  })

  it('orders numbers the way they are counted', () => {
    const list = ['10', 'B-2', '2', 'b-10', '1'].map((number) =>
      territory({ number })
    )
    expect(
      numbers(
        sortTerritories(list, { sort: 'number', direction: 'asc' }, checkedOut)
      )
    ).toEqual(['1', '2', '10', 'B-2', 'b-10'])
  })

  it('puts the soonest return date first', () => {
    const list = [
      territory({ number: '1', checkedOutAt: NOW - 5 * DAY }),
      territory({ number: '2', returnBy: NOW + 3 * DAY }),
      territory({ number: '3', checkedOutAt: NOW - 60 * DAY }),
    ]
    expect(
      numbers(
        sortTerritories(
          list,
          { sort: 'returnBy', direction: 'asc' },
          checkedOut
        )
      )
    ).toEqual(['2', '3', '1'])
  })

  it('puts the least worked first, then the most recent', () => {
    const list = [
      territory({
        number: '1',
        streets: [street({ workedAt: NOW }), street({ workedAt: NOW })],
      }),
      territory({ number: '2', checkedOutAt: NOW - 20 * DAY }),
      territory({
        number: '3',
        streets: [street({ workedAt: NOW }), street()],
      }),
      territory({ number: '4', streets: [street()] }),
    ]
    expect(
      numbers(
        sortTerritories(
          list,
          { sort: 'progress', direction: 'asc' },
          checkedOut
        )
      )
    ).toEqual(['4', '2', '3', '1'])
  })

  it('reverses with the direction', () => {
    const list = [
      territory({ number: '1', checkedOutAt: NOW - 30 * DAY }),
      territory({ number: '2', checkedOutAt: NOW - 5 * DAY }),
      territory({ number: '3', checkedOutAt: NOW - 9 * DAY }),
    ]
    expect(
      numbers(
        sortTerritories(list, { sort: 'recent', direction: 'asc' }, checkedOut)
      )
    ).toEqual(['1', '3', '2'])
    expect(
      numbers(
        sortTerritories(list, { sort: 'number', direction: 'desc' }, checkedOut)
      )
    ).toEqual(['3', '2', '1'])
  })

  it('leaves the list it was given alone', () => {
    const list = [territory({ number: '2' }), territory({ number: '1' })]
    sortTerritories(list, { sort: 'number', direction: 'asc' }, checkedOut)
    expect(numbers(list)).toEqual(['2', '1'])
  })
})

describe('matchesTerritoryFilters', () => {
  const notHome = street({
    doors: [{ id: 'd', label: '1', outcome: 'notHome', at: NOW, tries: 1 }],
  })

  it('matches everything with no filters', () => {
    expect(matchesTerritoryFilters(territory(), [], NOW)).toBe(true)
  })

  it('finds overdue territories, and never a returned one', () => {
    const late = territory({ returnBy: NOW - 2 * DAY })
    expect(matchesTerritoryFilters(late, ['overdue'], NOW)).toBe(true)
    expect(matchesTerritoryFilters(territory(), ['overdue'], NOW)).toBe(false)
    expect(
      matchesTerritoryFilters({ ...late, finishedAt: NOW }, ['overdue'], NOW)
    ).toBe(false)
  })

  it('finds territories with not-at-homes', () => {
    expect(
      matchesTerritoryFilters(
        territory({ streets: [notHome] }),
        ['notHome'],
        NOW
      )
    ).toBe(true)
    expect(
      matchesTerritoryFilters(
        territory({ streets: [street()] }),
        ['notHome'],
        NOW
      )
    ).toBe(false)
  })

  it('finds territories with streets left, not counting handed-off ones', () => {
    const left = (
      streets: TerritoryStreet[],
      change: Partial<Territory> = {}
    ) =>
      matchesTerritoryFilters(
        territory({ streets, ...change }),
        ['streetsLeft'],
        NOW
      )
    expect(left([street(), street({ workedAt: NOW })])).toBe(true)
    expect(left([street({ workedAt: NOW })])).toBe(false)
    expect(left([])).toBe(false)
    expect(left([street({ handoff: { personId: 'p', at: NOW } })])).toBe(false)
    expect(left([street()], { finishedAt: NOW })).toBe(false)
  })

  it('needs every filter to match', () => {
    const late = territory({ returnBy: NOW - 2 * DAY, streets: [notHome] })
    expect(matchesTerritoryFilters(late, ['overdue', 'notHome'], NOW)).toBe(
      true
    )
    expect(
      matchesTerritoryFilters(
        territory({ streets: [notHome] }),
        ['overdue', 'notHome'],
        NOW
      )
    ).toBe(false)
  })
})
