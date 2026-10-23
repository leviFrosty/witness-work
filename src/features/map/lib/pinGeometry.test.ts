import { describe, expect, it } from 'vitest'
import {
  contactsInLoop,
  groupOverlappingPins,
  isSamePlace,
  pointInPolygon,
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

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
]

describe('pointInPolygon', () => {
  it('finds points inside a drawn shape', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true)
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false)
  })
})

describe('contactsInLoop', () => {
  // Coordinates are map points, so the loop reads like a drawing.
  const project = (c: { latitude: number; longitude: number }) => ({
    x: c.longitude,
    y: c.latitude,
  })
  const at = (id: string, x: number, y: number) => ({
    id,
    coordinate: { latitude: y, longitude: x },
  })
  const contacts = [at('in', 5, 5), at('out', 15, 5), at('alsoIn', 2, 8)]

  it('picks the Contacts inside the loop, in their order', () => {
    expect(contactsInLoop(contacts, square, project)).toEqual(['in', 'alsoIn'])
  })

  it('picks nothing from a stroke too short to be a loop', () => {
    expect(contactsInLoop(contacts, square.slice(0, 2), project)).toEqual([])
  })

  it('skips Contacts without a place on the map', () => {
    expect(contactsInLoop([{ id: 'nowhere' }], square, project)).toEqual([])
  })
})
