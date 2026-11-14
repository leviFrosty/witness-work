import { describe, expect, it } from 'vitest'
import { findGuestStreets } from '@/features/territories/lib/guestStreets'

const streets = [
  'Oak Street',
  'Birch Road',
  'Chestnut Drive',
  '2nd Avenue',
  '10th Avenue',
].map((name) => ({ name }))
const names = (query: string) =>
  findGuestStreets(streets, query).map((street) => street.name)

describe('finding a street', () => {
  it('lists every street A to Z, numbers in order', () => {
    expect(names('')).toEqual([
      '2nd Avenue',
      '10th Avenue',
      'Birch Road',
      'Chestnut Drive',
      'Oak Street',
    ])
  })

  it('puts names that start with the text first', () => {
    expect(names(' CH ')).toEqual(['Chestnut Drive', 'Birch Road'])
    expect(names('zz')).toEqual([])
  })
})
