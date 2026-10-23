import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  platform: { OS: 'ios' as 'ios' | 'android' },
  directions: vi.fn(),
  fetchRouteDirections: vi.fn(),
}))
vi.mock('react-native', () => ({ Platform: mocks.platform }))
vi.mock('../../../../modules/route-directions', () => ({
  isAvailable: true,
  directions: mocks.directions,
}))
vi.mock('@/features/route-planning/lib/routeDirectionsClient', () => ({
  fetchRouteDirections: mocks.fetchRouteDirections,
}))

import {
  knownRoadLegs,
  legKey,
  loadRoadLegs,
  resetRoadLegs,
} from '@/features/route-planning/lib/roadLegs'

/** About 1.1 km apart, north of the equator. */
const north = (km: number) => ({ latitude: km * 0.009, longitude: 0 })
const A = north(0)
const B = north(1)
const C = north(2)
/** Across the street from B: the same place. */
const B2 = { latitude: B.latitude + 0.0001, longitude: 0 }

const leg = (meters: number) => ({
  distanceMeters: meters,
  durationSeconds: meters / 10,
  coordinates: [0, 0, 1, 1],
})
const signal = () => new AbortController().signal

beforeEach(() => {
  resetRoadLegs()
  mocks.platform.OS = 'ios'
  mocks.directions.mockReset()
  mocks.fetchRouteDirections.mockReset()
})

describe('loadRoadLegs on iOS', () => {
  it('asks MapKit for each leg once, and keeps the answers', async () => {
    mocks.directions.mockImplementation(async () => leg(1500))
    expect(await loadRoadLegs([A, B, C], signal())).toBe(true)
    expect(mocks.directions).toHaveBeenCalledTimes(2)
    expect(knownRoadLegs().get(legKey(A, B))).toEqual({
      meters: 1500,
      seconds: 150,
      coordinates: [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
      ],
    })

    // Reversed, only the new legs are asked about.
    expect(await loadRoadLegs([C, B, A, B], signal())).toBe(true)
    expect(mocks.directions).toHaveBeenCalledTimes(4)
    expect(await loadRoadLegs([A, B, C], signal())).toBe(false)
    expect(mocks.directions).toHaveBeenCalledTimes(4)
  })

  it('skips a drive between places at the same spot', async () => {
    mocks.directions.mockImplementation(async () => leg(1500))
    await loadRoadLegs([A, B, B2, C], signal())
    expect(mocks.directions).toHaveBeenCalledTimes(2)
    expect(knownRoadLegs().has(legKey(B, B2))).toBe(false)
    expect(knownRoadLegs().has(legKey(B2, C))).toBe(true)
  })

  it('remembers no road, and waits after a failure', async () => {
    mocks.directions.mockResolvedValueOnce(null)
    await loadRoadLegs([A, B], signal())
    expect(knownRoadLegs().get(legKey(A, B))).toBeNull()

    mocks.directions.mockRejectedValue(
      Object.assign(new Error('throttled'), { code: 'rate_limited' })
    )
    expect(await loadRoadLegs([B, C], signal())).toBe(false)
    expect(await loadRoadLegs([C, A], signal())).toBe(false)
    expect(mocks.directions).toHaveBeenCalledTimes(2)
  })
})

describe('loadRoadLegs when the route changes meanwhile', () => {
  it('keeps nothing, and doesn’t wait, on iOS', async () => {
    const controller = new AbortController()
    mocks.directions.mockImplementationOnce(async () => {
      controller.abort()
      return leg(1500)
    })
    expect(await loadRoadLegs([A, B], controller.signal)).toBe(false)
    expect(knownRoadLegs().size).toBe(0)

    const again = new AbortController()
    mocks.directions.mockImplementationOnce(async () => {
      again.abort()
      throw Object.assign(new Error('offline'), { code: 'offline' })
    })
    await loadRoadLegs([A, B], again.signal)
    mocks.directions.mockImplementation(async () => leg(1500))
    expect(await loadRoadLegs([A, B], signal())).toBe(true)
  })
})

describe('loadRoadLegs on Android', () => {
  beforeEach(() => {
    mocks.platform.OS = 'android'
  })

  it('asks ww-api once for the route, each place once', async () => {
    mocks.fetchRouteDirections.mockResolvedValue({
      ok: true,
      legs: [leg(1000), leg(2000)],
    })
    expect(await loadRoadLegs([A, B, B2, C], signal())).toBe(true)
    expect(mocks.fetchRouteDirections).toHaveBeenCalledTimes(1)
    expect(mocks.fetchRouteDirections.mock.calls[0]![0].points).toEqual([
      A,
      B,
      C,
    ])
    const known = knownRoadLegs()
    expect(known.get(legKey(A, B))?.meters).toBe(1000)
    // The leg from B's twin carries B's directions onward.
    expect(known.get(legKey(B2, C))?.meters).toBe(2000)
  })

  it('keeps estimates when there’s no road, and backs off on trouble', async () => {
    mocks.fetchRouteDirections.mockResolvedValueOnce({
      ok: false,
      noRoute: true,
    })
    expect(await loadRoadLegs([A, B], signal())).toBe(true)
    expect(knownRoadLegs().get(legKey(A, B))).toBeNull()

    mocks.fetchRouteDirections.mockResolvedValue({
      ok: false,
      retryAfterMs: 60_000,
    })
    expect(await loadRoadLegs([B, C], signal())).toBe(false)
    expect(await loadRoadLegs([B, C], signal())).toBe(false)
    expect(mocks.fetchRouteDirections).toHaveBeenCalledTimes(2)
  })

  it('splits a route with more places than one request takes', async () => {
    mocks.fetchRouteDirections.mockImplementation(
      async ({ points }: { points: unknown[] }) => ({
        ok: true,
        legs: points.slice(1).map(() => leg(1000)),
      })
    )
    const path = Array.from({ length: 15 }, (_, i) => north(i))
    expect(await loadRoadLegs(path, signal())).toBe(true)
    const sent = mocks.fetchRouteDirections.mock.calls.map(
      ([{ points }]) => points
    )
    expect(sent.map((points) => points.length)).toEqual([12, 4])
    expect(sent[1]![0]).toEqual(path[11])
    expect(knownRoadLegs().size).toBe(14)
  })
})
