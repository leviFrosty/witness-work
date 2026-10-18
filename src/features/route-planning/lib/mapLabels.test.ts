import { describe, expect, it } from 'vitest'
import {
  estimateCardWidth,
  placeLabels,
  projectToMap,
  type MapRegion,
} from '@/features/route-planning/lib/mapLabels'

const region: MapRegion = {
  latitude: 37.75,
  longitude: -122.42,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
}
const size = { width: 400, height: 400 }
const metrics = { cardHeight: 38, gap: 8, pin: 26 }

/** A coordinate at map point (x, y). */
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
        // A pin sits where its card would go above.
        { key: 'first', coordinate: point(200, 200), width: 80 },
        { key: 'second', coordinate: point(200, 150), width: 80 },
        // Above is first's card, below is fourth's pin.
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
})
