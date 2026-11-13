import { describe, expect, it } from 'vitest'
import {
  logDoor,
  nextUnrecorded,
  stepNumber,
} from '@/features/territories/lib/doors'
import {
  cleanHouses,
  compareHouses,
  firstKnownHouse,
  nextKnownHouse,
} from '@/features/territories/lib/houseList'
import {
  fillHouses,
  groupAddresses,
  houseProgress,
  progressShare,
  streetsToFill,
  territoryHouseProgress,
} from '@/features/territories/lib/houses'
import { suggestedStreet } from '@/features/territories/lib/streetSuggestions'
import {
  readStreetData,
  streetData,
} from '@/features/territories/lib/shared/territoryRecords'
import type {
  Territory,
  TerritoryStreet,
} from '@/features/territories/types/territory'

const STREET_ID = '6f1c2f3e-6a0b-4b8e-9a51-1f2d3c4b5a69'

const street = (over: Partial<TerritoryStreet> = {}): TerritoryStreet => ({
  id: STREET_ID,
  name: 'Fillmore Street',
  numbering: 'both',
  next: 701,
  first: 701,
  doors: [],
  houses: ['701', '705', '709', '710', '712', '745'],
  ...over,
})

const territory = (streets: TerritoryStreet[]): Territory => ({
  id: 't1',
  number: '12',
  checkedOutAt: 0,
  createdAt: 0,
  streets,
  doNotCalls: [],
})

describe('house lists', () => {
  it('sorts numerically with suffixes, drops duplicates and junk', () => {
    expect(
      cleanHouses([
        '12B',
        '9',
        ' 12 ',
        '12A',
        '12',
        'Rear',
        '',
        4,
        'x'.repeat(20),
      ])
    ).toEqual(['9', '12', '12A', '12B', 'Rear'])
    expect(['10', '9', '9A'].sort(compareHouses)).toEqual(['9', '9A', '10'])
  })

  it('steps through known houses instead of counting', () => {
    expect(stepNumber(street(), 701, 1)).toBe(705)
    expect(stepNumber(street(), 712, 1)).toBe(745)
    expect(stepNumber(street(), 745, -1)).toBe(712)
    expect(stepNumber(street(), 745, 1)).toBe(746)
  })

  it('keeps to the side of an odd or even street', () => {
    const odd = street({ numbering: 'odd' })
    expect(nextKnownHouse(odd, 705, 1)).toBe(709)
    expect(nextKnownHouse(odd, 709, 1)).toBe(745)
    expect(firstKnownHouse({ ...odd, descending: true })).toBe(745)
    const even = street({ numbering: 'even' })
    expect(firstKnownHouse(even)).toBe(710)
  })

  it('ignores the list on an unnumbered street', () => {
    expect(
      nextKnownHouse(street({ numbering: 'none' }), 701, 1)
    ).toBeUndefined()
  })

  it('suggests the next unrecorded known house after a visit', () => {
    const logged = logDoor(street(), {
      id: 'd1',
      label: '701',
      outcome: 'notHome',
      at: 1,
    })
    expect(logged.next).toBe(705)
    expect(
      nextUnrecorded(
        {
          ...logged,
          doors: [
            ...logged.doors,
            { ...logged.doors[0]!, id: 'd2', label: '705' },
          ],
        },
        701
      )
    ).toBe(709)
  })

  it('counts visited houses for a street and a territory', () => {
    const worked = street({
      doors: [
        { id: 'a', label: '701', outcome: 'notHome', at: 1, tries: 1 },
        { id: 'b', label: '705', outcome: 'spoke', at: 1, tries: 1 },
        { id: 'c', label: '999', outcome: 'spoke', at: 1, tries: 1 },
      ],
    })
    const progress = houseProgress(worked)!
    expect(progress).toEqual({
      total: 6,
      visited: 2,
      spoke: 1,
      notHome: 1,
      doNotCall: 0,
    })
    expect(progressShare(progress)).toBeCloseTo(1 / 3)
    expect(houseProgress(street({ houses: undefined }))).toBeUndefined()

    const whole = territoryHouseProgress(
      territory([
        worked,
        street({ id: 'other', houses: ['1', '3'] }),
        street({ id: 'x', houses: undefined }),
      ])
    )!
    expect(whole.total).toBe(8)
    expect(whole.visited).toBe(2)
    expect(
      territoryHouseProgress(territory([street({ houses: undefined })]))
    ).toBeUndefined()
  })
})

describe('map addresses', () => {
  const found = groupAddresses([
    { street: 'Fillmore Street', number: '745' },
    { street: 'Fillmore Street', number: '701' },
    { street: 'Fillmore Street', number: '701' },
    { street: 'Grove St', number: '930' },
    { street: '  ', number: '1' },
  ])

  it('groups by the same key street names match on', () => {
    expect(found.get('fillmore st')).toEqual({
      name: 'Fillmore Street',
      houses: ['701', '745'],
    })
    expect(found.get('grove st')?.houses).toEqual(['930'])
    expect(found.size).toBe(2)
  })

  it('fills only numbered streets without a list', () => {
    const before = territory([
      street({ id: 'a', name: 'Grove Street', houses: undefined }),
      street({ id: 'b', name: 'Fillmore St', houses: ['1'] }),
      street({
        id: 'c',
        name: 'Grove St',
        numbering: 'none',
        houses: undefined,
      }),
    ])
    expect(streetsToFill(before.streets, found)).toBe(1)
    const after = fillHouses(before, found)
    expect(after.streets.map((s) => s.houses)).toEqual([
      ['930'],
      ['1'],
      undefined,
    ])
    expect(fillHouses(after, found)).toBe(after)
  })

  it('starts a suggested street at its first house', () => {
    const made = suggestedStreet('id', 'Fillmore Street', ['745', '701'])
    expect(made).toMatchObject({
      next: 701,
      first: 701,
      houses: ['701', '745'],
    })
    expect(suggestedStreet('id', 'Elm').houses).toBeUndefined()
  })
})

describe('shared street records', () => {
  it('round-trips the house list and cleans what it reads', () => {
    const data = streetData(street(), 2)
    expect(data.houses).toEqual(street().houses)
    expect(readStreetData(data)?.houses).toEqual(street().houses)
    expect(
      readStreetData({ ...data, houses: ['3', 1, '2', '2'] })?.houses
    ).toEqual(['2', '3'])
    expect(readStreetData({ ...data, houses: 'nope' })?.houses).toBeUndefined()
    expect(streetData(street({ houses: [] }), 0)).not.toHaveProperty('houses')
  })
})
