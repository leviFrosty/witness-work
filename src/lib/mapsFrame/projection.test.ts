import { describe, expect, it } from 'vitest'
import {
  coordinateFor,
  fromWorld,
  paddedRect,
  pointFor,
  rectFitting,
  rectFor,
  regionFor,
  toWorld,
  viewRect,
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

describe('a padded MapKit view', () => {
  const mapkit = {
    size: { width: 1040, height: 900 },
    padding: { top: 102, right: 392, bottom: 0, left: 0 },
    visibleMapRect: {
      x: 0.26524030341880345,
      y: 0.3817745638616576,
      width: 0.00006277777777774493,
      height: 0.00007730967078185256,
    },
    pins: [
      { latitude: 39.1012, longitude: -84.5121, x: 39.9, y: 542 },
      { latitude: 39.1048, longitude: -84.5047, x: 252.1, y: 409 },
      { latitude: 39.0981, longitude: -84.5008, x: 363.9, y: 656.6 },
    ],
  }

  it('places pins where MapKit draws their coordinates', () => {
    const rect = viewRect(mapkit.visibleMapRect, mapkit.size, mapkit.padding)
    for (const pin of mapkit.pins) {
      const point = pointFor(pin, rect, mapkit.size)
      expect(Math.abs(point.x - pin.x)).toBeLessThan(0.5)
      expect(Math.abs(point.y - pin.y)).toBeLessThan(0.5)
    }
  })

  it('keeps the padded area where MapKit puts it', () => {
    const rect = viewRect(mapkit.visibleMapRect, mapkit.size, mapkit.padding)
    const back = paddedRect(rect, mapkit.size, mapkit.padding)
    close(back.x, mapkit.visibleMapRect.x, 12)
    close(back.y, mapkit.visibleMapRect.y, 12)
    close(back.width, mapkit.visibleMapRect.width, 12)
    close(back.height, mapkit.visibleMapRect.height, 12)
  })

  it('ignores padding that leaves no room', () => {
    const rect = { x: 0.2, y: 0.3, width: 0.01, height: 0.01 }
    const padding = { top: 0, right: 600, bottom: 0, left: 600 }
    expect(viewRect(rect, mapkit.size, padding)).toEqual(rect)
    expect(paddedRect(rect, mapkit.size, padding)).toEqual(rect)
  })
})
