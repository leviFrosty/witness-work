import { describe, expect, it } from 'vitest'
import {
  estimateCardWidth,
  placeLabels,
  placeProjectedLabels,
  projectionFrom,
  projectToMap,
  type MapRegion,
} from '@/lib/mapLabels'

const region: MapRegion = {
  latitude: 37.75,
  longitude: -122.42,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
}
const size = { width: 400, height: 400 }
const metrics = { cardHeight: 38, gap: 8, pin: 26 }

const point = (x: number, y: number) => ({
  latitude: region.latitude + region.latitudeDelta / 2 - (y / 400) * 0.02,
  longitude: region.longitude - region.longitudeDelta / 2 + (x / 400) * 0.02,
})

describe('projectToMap', () => {
  it('puts the center in the middle', () => {
    const { x, y } = projectToMap(region, region, size)
    expect(x).toBeCloseTo(200)
    expect(y).toBeCloseTo(200, 0)
  })
})

describe('placeLabels', () => {
  it('puts cards above pins when there is room', () => {
    const placements = placeLabels(
      [
        { key: 'a', coordinate: point(100, 200), width: 80 },
        { key: 'b', coordinate: point(300, 200), width: 80 },
      ],
      region,
      size,
      metrics
    )
    expect([...placements]).toEqual([
      ['a', 'above'],
      ['b', 'above'],
    ])
  })

  it('moves a card below when a pin is above, and drops it with no room', () => {
    const placements = placeLabels(
      [
        { key: 'first', coordinate: point(200, 200), width: 80 },
        { key: 'second', coordinate: point(200, 150), width: 80 },

        { key: 'third', coordinate: point(200, 300), width: 80 },
        { key: 'fourth', coordinate: point(200, 340), width: 80 },
      ],
      region,
      size,
      metrics
    )
    expect(Object.fromEntries(placements)).toEqual({
      first: 'below',
      second: 'above',
      third: 'none',
      fourth: 'below',
    })
  })

  it('keeps cards on the map', () => {
    const placements = placeLabels(
      [{ key: 'top', coordinate: point(200, 20), width: 80 }],
      region,
      size,
      metrics
    )
    expect(placements.get('top')).toBe('below')
  })
})

describe('estimateCardWidth', () => {
  it('grows with the longer line within its limits', () => {
    expect(estimateCardWidth(['9:00 AM', 'Al'])).toBe(16 + 6.4 * 7)
    expect(estimateCardWidth(['x'.repeat(80)])).toBe(132)
    expect(estimateCardWidth([''])).toBe(56)
  })

  it('counts wide characters about twice', () => {
    expect(estimateCardWidth(['田中さん김'])).toBe(16 + 6.4 * 10)
    expect(estimateCardWidth(['𠮷'])).toBe(56)
    expect(estimateCardWidth(['𠮷'.repeat(5)])).toBe(16 + 6.4 * 10)

    expect(estimateCardWidth(['Zoë Ángel'])).toBe(16 + 6.4 * 9)
    expect(estimateCardWidth(['مريم'])).toBe(56)
  })
})

describe('placeProjectedLabels options', () => {
  const at = (key: string, x: number, y: number) => ({
    key,
    coordinate: { latitude: 0, longitude: 0 },
    x,
    y,
    width: 80,
  })

  it('stops at maxCards, skips pin-only candidates, and avoids controls', () => {
    const placements = placeProjectedLabels(
      [
        { ...at('pinOnly', 100, 100), pinOnly: true },
        at('blocked', 300, 100),
        at('first', 100, 300),
        at('second', 300, 300),
      ],
      size,
      metrics,
      {
        maxCards: 1,

        avoid: [{ left: 240, top: 0, right: 400, bottom: 180 }],
      }
    )
    expect([...placements]).toEqual([
      ['pinOnly', 'none'],
      ['blocked', 'none'],
      ['first', 'above'],
      ['second', 'none'],
    ])
  })
})

describe('projectionFrom', () => {
  it('matches the map at its reference points and between them', () => {
    const project = projectionFrom(
      { coordinate: { latitude: 10, longitude: 0 }, point: { x: 0, y: 0 } },
      { coordinate: { latitude: 0, longitude: 10 }, point: { x: 100, y: 100 } }
    )!
    expect(project({ latitude: 0, longitude: 10 })).toEqual({ x: 100, y: 100 })
    expect(project({ latitude: 5, longitude: 5 }).x).toBeCloseTo(50)
    expect(
      projectionFrom(
        { coordinate: { latitude: 1, longitude: 1 }, point: { x: 0, y: 0 } },
        { coordinate: { latitude: 1, longitude: 1 }, point: { x: 0, y: 0 } }
      )
    ).toBeNull()
  })
})
