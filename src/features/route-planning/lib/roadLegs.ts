import { Platform } from 'react-native'
import type { Coordinate } from '@/types/contact'
import * as RouteDirections from '../../../../modules/route-directions'
import { fetchRouteDirections } from '@/features/route-planning/lib/routeDirectionsClient'
import {
  SAME_PLACE_M,
  straightLineMeters,
} from '@/features/route-planning/lib/routeTimeline'

/**
 * Driving directions for each leg of a route, by road: MapKit on the device on
 * iOS, ww-api (HERE Routing) on Android. Legs are kept for the app's lifetime,
 * keyed by their ends, so reordering stops only asks about legs it hasn't seen.
 * A leg with no directions yet keeps its straight-line estimate.
 */

export type RoadLeg = {
  meters: number
  seconds: number
  /** The road shape, from one end to the other. */
  coordinates: Coordinate[]
}

/** Known legs by `legKey`; `null` when there's no road between the ends. */
export type RoadLegs = ReadonlyMap<string, RoadLeg | null>

/** Legs kept; a busy day of planning sees a few dozen. */
const MAX_LEGS = 300
/** Ww-api routes up to 12 places (11 legs) per request. */
const MAX_ANDROID_LEGS = 11
/** MapKit throttles bursts; a few legs at a time stays under it. */
const IOS_CONCURRENCY = 3

const pointKey = ({ latitude, longitude }: Coordinate) =>
  `${latitude.toFixed(5)},${longitude.toFixed(5)}`

export const legKey = (from: Coordinate, to: Coordinate) =>
  `${pointKey(from)}>${pointKey(to)}`

const cache = new Map<string, RoadLeg | null>()
/** No asking again before this, after a failure (`Date.now()` ms). */
let quietUntil = 0

const remember = (key: string, leg: RoadLeg | null) => {
  cache.delete(key)
  cache.set(key, leg)
  // Oldest first in insertion order.
  while (cache.size > MAX_LEGS) cache.delete(cache.keys().next().value!)
}

/** What's known now, as a value React can compare. */
export const knownRoadLegs = (): RoadLegs => new Map(cache)

const toCoordinates = (flat: number[]): Coordinate[] => {
  const coordinates: Coordinate[] = []
  for (let i = 0; i + 1 < flat.length; i += 2) {
    coordinates.push({ latitude: flat[i]!, longitude: flat[i + 1]! })
  }
  return coordinates
}

const toRoadLeg = (leg: RouteDirections.RouteDirectionsLeg): RoadLeg => ({
  meters: leg.distanceMeters,
  seconds: leg.durationSeconds,
  coordinates: toCoordinates(leg.coordinates),
})

/** Whether this device can get directions at all. */
export const canLoadRoadLegs = () =>
  Platform.OS === 'ios'
    ? RouteDirections.isAvailable
    : Platform.OS === 'android'

/**
 * Asks for the legs of `path` (start, stops, finish) that aren't known yet.
 * Resolves true when it learned something new. Never rejects: a leg that can't
 * be had keeps its estimate.
 */
export const loadRoadLegs = async (
  path: Coordinate[],
  signal: AbortSignal
): Promise<boolean> => {
  if (!canLoadRoadLegs() || Date.now() < quietUntil) return false
  // Consecutive places with a drive between them.
  const legs = path
    .slice(1)
    .map((to, index) => ({ from: path[index]!, to }))
    .filter(({ from, to }) => straightLineMeters(from, to) >= SAME_PLACE_M)
  const missing = legs.filter(({ from, to }) => !cache.has(legKey(from, to)))
  if (missing.length === 0) return false

  if (Platform.OS === 'android') {
    // One HERE transaction per run of legs, so every leg in it comes along: the
    // whole route, unless it has more places than one request takes. A place
    // at the same spot as the one before isn't sent again.
    let learned = false
    for (let i = 0; i < legs.length; i += MAX_ANDROID_LEGS) {
      const run = legs.slice(i, i + MAX_ANDROID_LEGS)
      const runMissing = run.filter(
        ({ from, to }) => !cache.has(legKey(from, to))
      )
      if (runMissing.length === 0) continue
      const points = [run[0]!.from, ...run.map((leg) => leg.to)]
      const result = await fetchRouteDirections({ points, signal })
      if (signal.aborted) return false
      if (!result.ok) {
        // HERE can't say which leg has no road; they keep their estimates.
        if (result.noRoute) {
          for (const { from, to } of runMissing) {
            remember(legKey(from, to), null)
          }
          learned = true
          continue
        }
        quietUntil = Date.now() + (result.retryAfterMs ?? 0)
        return learned
      }
      result.legs.forEach((leg, index) => {
        const { from, to } = run[index]!
        remember(legKey(from, to), toRoadLeg(leg))
      })
      learned = true
    }
    return learned
  }

  let learned = false
  const queue = [...missing]
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      if (signal.aborted || Date.now() < quietUntil) return
      try {
        const leg = await RouteDirections.directions(next.from, next.to)
        // A route that changed meanwhile asks again for what it needs.
        if (signal.aborted) return
        remember(legKey(next.from, next.to), leg && toRoadLeg(leg))
        learned = true
      } catch (error) {
        if (signal.aborted) return
        // Offline, throttled, or MapKit trouble: wait before asking again.
        const code = (error as { code?: unknown } | null)?.code
        quietUntil = Date.now() + (code === 'rate_limited' ? 60_000 : 30_000)
        return
      }
    }
  }
  await Promise.all(Array.from({ length: IOS_CONCURRENCY }, worker))
  return learned && !signal.aborted
}

/** Forgets every leg; for tests. */
export const resetRoadLegs = () => {
  cache.clear()
  quietUntil = 0
}
