import { describe, expect, it } from 'vitest'
import {
  cleanHouses,
  compareHouses,
} from '@/features/territories/lib/houseList'
import {
  readStreetData,
  streetData,
} from '@/features/territories/lib/shared/territoryRecords'
import type { TerritoryStreet } from '@/features/territories/types/territory'

const street = (over: Partial<TerritoryStreet> = {}): TerritoryStreet => ({
  id: '3f0c0c8e-7f5b-4d0e-9a51-0d1c5a5f2b11',
  name: 'Oak Street',
  numbering: 'both',
  next: 1,
  first: 1,
  doors: [],
  ...over,
})

describe('stored house lists', () => {
  it('sorts numerically with suffixes, drops duplicates and junk', () => {
    expect(
      cleanHouses([
        '12B',
        '9',
        '12A',
        '12',
        '12a',
        'Rear',
        '',
        4,
        'x'.repeat(20),
      ])
    ).toEqual(['9', '12', '12A', '12B', 'Rear'])
    expect(['10', '9', '9A'].sort(compareHouses)).toEqual(['9', '9A', '10'])
  })

  it('round-trips a list a street already has and cleans what it reads', () => {
    const data = streetData(street({ houses: ['2', '4', '4A'] }), 0)
    expect(data.houses).toEqual(['2', '4', '4A'])
    expect(readStreetData(data)?.houses).toEqual(['2', '4', '4A'])
    expect(
      readStreetData({ ...data, houses: ['3', 1, '2', '2'] })?.houses
    ).toEqual(['2', '3'])
    expect(readStreetData({ ...data, houses: 'nope' })?.houses).toBeUndefined()
    expect(streetData(street({ houses: [] }), 0)).not.toHaveProperty('houses')
  })
})
