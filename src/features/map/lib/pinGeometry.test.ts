import { describe, expect, it } from 'vitest'
import {
  groupOverlappingPins,
  isSamePlace,
} from '@/features/map/lib/pinGeometry'

describe('groupOverlappingPins', () => {
  it('gathers pins within the radius around the most pressing one', () => {
    const groups = groupOverlappingPins(
      [
        { id: 'a', x: 100, y: 100 },
        { id: 'far', x: 300, y: 300 },
        { id: 'b', x: 110, y: 105 },
        // Close to b, but too far from a, which leads.
        { id: 'c', x: 125, y: 115 },
      ],
      22
    )
    expect(groups.map((g) => g.map((p) => p.id))).toEqual([
      ['a', 'b'],
      ['far'],
      ['c'],
    ])
  })
})

describe('isSamePlace', () => {
  it('tells one building from a crowd', () => {
    const a = { latitude: 39.1, longitude: -84.5 }
    expect(isSamePlace([a, { latitude: 39.1001, longitude: -84.5001 }])).toBe(
      true
    )
    expect(isSamePlace([a, { latitude: 39.11, longitude: -84.5 }])).toBe(false)
  })
})
