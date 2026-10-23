import { describe, expect, it } from 'vitest'
import {
  addPicks,
  picksInView,
  stopCountBucket,
  togglePicks,
} from '@/features/map/lib/mapSelection'

describe('picks', () => {
  it('adds only new picks, in order', () => {
    expect(addPicks(['a'], ['b', 'a', 'c'])).toEqual(['a', 'b', 'c'])
    const current = ['a']
    expect(addPicks(current, ['a'])).toBe(current)
  })

  it("toggles a pin's Contacts together", () => {
    expect(togglePicks(['a', 'b', 'c'], ['a', 'b'])).toEqual(['c'])
    // Partly picked: picking finishes the group rather than undoing it.
    expect(togglePicks(['a'], ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('shows and counts only the picks still on the map', () => {
    const shown = [{ id: 'b' }, { id: 'c' }]
    expect([...picksInView(['a', 'b'], shown)]).toEqual(['b'])
  })
})

describe('stopCountBucket', () => {
  it('buckets a route by its stops', () => {
    expect([1, 2, 5, 6, 10, 11, 30].map(stopCountBucket)).toEqual([
      '1',
      '2-5',
      '2-5',
      '6-10',
      '6-10',
      '11+',
      '11+',
    ])
  })
})
