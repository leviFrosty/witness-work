import { describe, expect, it } from 'vitest'
import {
  areaBounds,
  areaCentroid,
  cornerAt,
  cornerPoint,
  distanceToArea,
  draggedCorner,
  edgeAt,
  insertCorner,
  isNearArea,
  isOutline,
  pointInArea,
  regionFor,
  removeCorner,
  replaceCorner,
  tappedAfterInsert,
  tappedAfterRemove,
  territoryPoint,
} from '@/features/territories/lib/territoryArea'

const square = [
  { latitude: 40, longitude: -75 },
  { latitude: 40, longitude: -74.99 },
  { latitude: 40.01, longitude: -74.99 },
  { latitude: 40.01, longitude: -75 },
]

const lShape = [
  { latitude: 0, longitude: 0 },
  { latitude: 0, longitude: 0.02 },
  { latitude: 0.01, longitude: 0.02 },
  { latitude: 0.01, longitude: 0.01 },
  { latitude: 0.02, longitude: 0.01 },
  { latitude: 0.02, longitude: 0 },
]

describe('isOutline', () => {
  it('needs at least three corners', () => {
    expect(isOutline(undefined)).toBe(false)
    expect(isOutline(square.slice(0, 2))).toBe(false)
    expect(isOutline(square.slice(0, 3))).toBe(true)
  })
})

describe('areaBounds', () => {
  it('spans every point', () => {
    expect(areaBounds(square)).toEqual({
      south: 40,
      north: 40.01,
      west: -75,
      east: -74.99,
    })
  })

  it('has nothing to bound without points', () => {
    expect(areaBounds([])).toBeUndefined()
  })
})

describe('areaCentroid', () => {
  it('finds the middle of a square', () => {
    const middle = areaCentroid(square)!
    expect(middle.latitude).toBeCloseTo(40.005, 9)
    expect(middle.longitude).toBeCloseTo(-74.995, 9)
  })

  it('weights by area, not by corner count', () => {
    const middle = areaCentroid(lShape)!
    expect(middle.latitude).toBeCloseTo(0.008333, 5)
    expect(middle.longitude).toBeCloseTo(0.008333, 5)
  })

  it('does not depend on the direction the corners were tapped', () => {
    const forward = areaCentroid(lShape)!
    const backward = areaCentroid([...lShape].reverse())!
    expect(backward.latitude).toBeCloseTo(forward.latitude, 9)
    expect(backward.longitude).toBeCloseTo(forward.longitude, 9)
  })

  it('averages points that enclose no area', () => {
    expect(
      areaCentroid([
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 2 },
      ])
    ).toEqual({ latitude: 0, longitude: 1 })
    expect(
      areaCentroid([
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
        { latitude: 2, longitude: 2 },
      ])
    ).toEqual({ latitude: 1, longitude: 1 })
  })

  it('has no middle without points', () => {
    expect(areaCentroid([])).toBeUndefined()
  })
})

describe('pointInArea', () => {
  it('finds points inside and outside a square', () => {
    expect(pointInArea({ latitude: 40.005, longitude: -74.995 }, square)).toBe(
      true
    )
    expect(pointInArea({ latitude: 40.02, longitude: -74.995 }, square)).toBe(
      false
    )
  })

  it('leaves out the notch of an L shape', () => {
    expect(pointInArea({ latitude: 0.005, longitude: 0.015 }, lShape)).toBe(
      true
    )
    expect(pointInArea({ latitude: 0.015, longitude: 0.015 }, lShape)).toBe(
      false
    )
  })

  it('is never inside something that is not an area', () => {
    expect(pointInArea({ latitude: 0, longitude: 0 }, square.slice(0, 2))).toBe(
      false
    )
  })
})

describe('distanceToArea', () => {
  it('is zero inside', () => {
    expect(
      distanceToArea({ latitude: 40.005, longitude: -74.995 }, square)
    ).toBe(0)
  })

  it('measures to the nearest edge in meters', () => {
    const north = distanceToArea(
      { latitude: 40.011, longitude: -74.995 },
      square
    )!
    expect(north).toBeGreaterThan(105)
    expect(north).toBeLessThan(117)
  })

  it('measures to a single point', () => {
    const distance = distanceToArea({ latitude: 0.001, longitude: 0 }, [
      { latitude: 0, longitude: 0 },
    ])!
    expect(distance).toBeCloseTo(111.32, 1)
  })

  it('has no distance without corners', () => {
    expect(distanceToArea({ latitude: 0, longitude: 0 }, [])).toBeUndefined()
  })
})

describe('isNearArea', () => {
  it('counts points within the given meters', () => {
    const point = { latitude: 40.011, longitude: -74.995 }
    expect(isNearArea(point, square, 150)).toBe(true)
    expect(isNearArea(point, square, 50)).toBe(false)
    expect(isNearArea(point, [], 1000)).toBe(false)
  })
})

describe('territoryPoint', () => {
  it('prefers the pin', () => {
    const pin = { latitude: 1, longitude: 2 }
    expect(territoryPoint({ coordinate: pin, outline: square })).toBe(pin)
  })

  it('falls back to the middle of the outline', () => {
    const point = territoryPoint({ outline: square })!
    expect(point.latitude).toBeCloseTo(40.005, 9)
  })

  it('ignores an unfinished outline', () => {
    expect(territoryPoint({ outline: square.slice(0, 2) })).toBeUndefined()
    expect(territoryPoint({})).toBeUndefined()
  })
})

describe('regionFor', () => {
  it('centers on the points with a margin', () => {
    const region = regionFor(square, 0.001, 2)!
    expect(region.latitude).toBeCloseTo(40.005, 9)
    expect(region.latitudeDelta).toBeCloseTo(0.02, 9)
  })

  it('keeps a single point from zooming in too far', () => {
    expect(regionFor([{ latitude: 1, longitude: 1 }], 0.003)).toEqual({
      latitude: 1,
      longitude: 1,
      latitudeDelta: 0.003,
      longitudeDelta: 0.003,
    })
    expect(regionFor([])).toBeUndefined()
  })
})

describe('corner editing', () => {
  const region = {
    latitude: 40.005,
    longitude: -74.995,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  }
  const size = { width: 400, height: 400 }

  it('places the middle of the region in the middle of the map', () => {
    const point = cornerPoint(
      { latitude: 40.005, longitude: -74.995 },
      region,
      size
    )
    expect(point.x).toBeCloseTo(200, 3)
    expect(point.y).toBeCloseTo(200, 1)
  })

  it('puts west on the left and north at the top', () => {
    const [southWest, , northEast] = square.map((corner) =>
      cornerPoint(corner, region, size)
    )
    expect(southWest!.x).toBeLessThan(northEast!.x)
    expect(southWest!.y).toBeGreaterThan(northEast!.y)
  })

  it('finds the corner under a touch, and nothing when the touch is far', () => {
    const at = cornerPoint(square[2]!, region, size)
    expect(
      cornerAt({ x: at.x + 10, y: at.y - 10 }, square, region, size, 30)
    ).toBe(2)
    expect(
      cornerAt({ x: at.x + 40, y: at.y }, square, region, size, 30)
    ).toBeUndefined()
  })

  it('picks the closest corner when two are within reach', () => {
    const near = [
      { latitude: 40.005, longitude: -74.995 },
      { latitude: 40.005, longitude: -74.9949 },
    ]
    const second = cornerPoint(near[1]!, region, size)
    expect(cornerAt(second, near, region, size, 30)).toBe(1)
  })

  it('leaves a corner where it is until the finger moves', () => {
    const corner = square[1]!
    const moved = draggedCorner(corner, { x: 0, y: 0 }, region, size)
    expect(moved.latitude).toBeCloseTo(corner.latitude, 9)
    expect(moved.longitude).toBeCloseTo(corner.longitude, 9)
  })

  it('moves a corner with the finger', () => {
    const corner = square[0]!
    const moved = draggedCorner(corner, { x: 100, y: -100 }, region, size)
    expect(moved.longitude).toBeGreaterThan(corner.longitude + 0.003)
    expect(moved.latitude).toBeGreaterThan(corner.latitude + 0.004)
    const back = cornerPoint(moved, region, size)
    const start = cornerPoint(corner, region, size)
    expect(back.x - start.x).toBeCloseTo(100, 6)
    expect(back.y - start.y).toBeCloseTo(-100, 6)
  })

  it('replaces and removes one corner, keeping the rest in order', () => {
    const next = { latitude: 1, longitude: 2 }
    expect(replaceCorner(square, 1, next)).toEqual([
      square[0],
      next,
      square[2],
      square[3],
    ])
    expect(removeCorner(square, 0)).toEqual(square.slice(1))
  })

  const midpoint = (from: number, to: number, outline = square) => {
    const a = cornerPoint(outline[from]!, region, size)
    const b = cornerPoint(outline[to]!, region, size)
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }

  it("adds a corner tapped on an edge between that edge's corners", () => {
    expect(edgeAt(midpoint(0, 1), square, region, size, 22)).toBe(1)
    expect(edgeAt(midpoint(1, 2), square, region, size, 22)).toBe(2)
    expect(edgeAt(midpoint(2, 3), square, region, size, 22)).toBe(3)
  })

  it('adds a corner on the closing edge at the end', () => {
    expect(edgeAt(midpoint(3, 0), square, region, size, 22)).toBe(4)
  })

  it('reaches an edge from either side, but not from far away', () => {
    const on = midpoint(0, 1)
    expect(edgeAt({ x: on.x, y: on.y + 15 }, square, region, size, 22)).toBe(1)
    expect(edgeAt({ x: on.x, y: on.y - 15 }, square, region, size, 22)).toBe(1)
    expect(
      edgeAt({ x: on.x, y: on.y - 60 }, square, region, size, 22)
    ).toBeUndefined()
  })

  it('has no edges to tap before the outline is finished', () => {
    const line = square.slice(0, 2)
    expect(edgeAt(midpoint(0, 1, line), line, region, size, 22)).toBeUndefined()
  })

  it('inserts a corner, keeping the rest in order', () => {
    const next = { latitude: 1, longitude: 2 }
    expect(insertCorner(square, 1, next)).toEqual([
      square[0],
      next,
      square[1],
      square[2],
      square[3],
    ])
    expect(insertCorner(square, 4, next)).toEqual([...square, next])
  })

  it('remembers the order corners were tapped as corners come and go', () => {
    let tapped = [0, 1, 2]
    tapped = tappedAfterInsert(tapped, 1)
    expect(tapped).toEqual([0, 2, 3, 1])
    tapped = tappedAfterRemove(tapped, tapped.at(-1)!)
    expect(tapped).toEqual([0, 1, 2])
    expect(tappedAfterRemove([0, 2, 3, 1], 0)).toEqual([1, 2, 0])
  })
})
