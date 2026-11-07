import { describe, expect, it } from 'vitest'
import {
  coordinateFor,
  fromWorld,
  pointFor,
  rectFitting,
  rectFor,
  regionFor,
  toWorld,
} from '@/lib/mapsFrame/projection'

const size = { width: 400, height: 300 }
const close = (a: number, b: number, digits = 6) =>
  expect(a).toBeCloseTo(b, digits)

describe('Web Mercator in the unit square', () => {
  it('puts the null island in the middle and round-trips coordinates', () => {
    expect(toWorld({ latitude: 0, longitude: 0 })).toEqual({ x: 0.5, y: 0.5 })
    for (const coordinate of [
      { latitude: 39.1, longitude: -84.5 },
      { latitude: -33.86, longitude: 151.2 },
      { latitude: 64.1, longitude: -21.9 },
    ]) {
      const back = fromWorld(toWorld(coordinate))
      close(back.latitude, coordinate.latitude)
      close(back.longitude, coordinate.longitude)
    }
  })

  it('stretches latitudes toward the poles', () => {
    const at = (latitude: number) => toWorld({ latitude, longitude: 0 }).y
    expect(at(0) - at(10)).toBeLessThan(at(60) - at(70))
  })
})

describe('points and coordinates in a view', () => {
  const region = {
    latitude: 39.1,
    longitude: -84.5,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  }
  const rect = rectFor(region, size)

  it('draws the region center in the middle of the view', () => {
    const middle = pointFor(region, rect, size)
    close(middle.x, 200, 3)
    close(middle.y, 150, 3)
  })

  it('maps a point back to its coordinate', () => {
    const coordinate = { latitude: 39.104, longitude: -84.497 }
    const point = pointFor(coordinate, rect, size)
    const back = coordinateFor(point, rect, size)
    close(back.latitude, coordinate.latitude)
    close(back.longitude, coordinate.longitude)
  })

  it('keeps the whole region in view, growing the narrower side', () => {
    const shown = regionFor(rect)
    expect(shown.latitudeDelta).toBeGreaterThanOrEqual(
      region.latitudeDelta - 1e-9
    )
    expect(shown.longitudeDelta).toBeGreaterThanOrEqual(
      region.longitudeDelta - 1e-9
    )
    close(shown.latitude, region.latitude, 4)
    close(shown.longitude, region.longitude, 6)
  })

  it('draws a pin across the antimeridian on the near side', () => {
    const fiji = rectFor(
      { latitude: -17, longitude: 179.9, latitudeDelta: 1, longitudeDelta: 1 },
      size
    )
    const east = pointFor({ latitude: -17, longitude: -179.9 }, fiji, size)
    expect(east.x).toBeGreaterThan(200)
    expect(east.x).toBeLessThan(400)
  })
})

describe('fitting coordinates', () => {
  const padding = { top: 20, right: 30, bottom: 40, left: 10 }

  it('shows every coordinate inside the padding', () => {
    const coordinates = [
      { latitude: 39.1, longitude: -84.5 },
      { latitude: 39.2, longitude: -84.3 },
      { latitude: 39.05, longitude: -84.6 },
    ]
    const rect = rectFitting(coordinates, size, padding)!
    for (const coordinate of coordinates) {
      const { x, y } = pointFor(coordinate, rect, size)
      expect(x).toBeGreaterThanOrEqual(padding.left - 1e-6)
      expect(x).toBeLessThanOrEqual(size.width - padding.right + 1e-6)
      expect(y).toBeGreaterThanOrEqual(padding.top - 1e-6)
      expect(y).toBeLessThanOrEqual(size.height - padding.bottom + 1e-6)
    }
  })

  it('stops at street level for a single place', () => {
    const rect = rectFitting(
      [{ latitude: 39.1, longitude: -84.5 }],
      size,
      padding
    )!
    expect(rect.width).toBeCloseTo(1 / 2 ** 19, 12)
  })

  it('has nothing to fit without coordinates', () => {
    expect(rectFitting([], size, padding)).toBeNull()
  })
})
