import { Platform } from 'react-native'
import type { Coordinate } from '@/types/contact'
import * as RouteDirections from '../../../../modules/route-directions'
import { fetchRouteDirections } from '@/features/route-planning/lib/routeDirectionsClient'
import {
  SAME_PLACE_M,
  straightLineMeters,
} from '@/features/route-planning/lib/routeTimeline'

export type RoadLeg = {
  meters: number
  seconds: number

  coordinates: Coordinate[]
}

export type RoadLegs = ReadonlyMap<string, RoadLeg | null>

const MAX_LEGS = 300

const MAX_ANDROID_LEGS = 11

const IOS_CONCURRENCY = 3

const pointKey = ({ latitude, longitude }: Coordinate) =>
  `${latitude.toFixed(5)},${longitude.toFixed(5)}`

export const legKey = (from: Coordinate, to: Coordinate) =>
  `${pointKey(from)}>${pointKey(to)}`

const cache = new Map<string, RoadLeg | null>()

let quietUntil = 0

const remember = (key: string, leg: RoadLeg | null) => {
  cache.delete(key)
  cache.set(key, leg)

  while (cache.size > MAX_LEGS) cache.delete(cache.keys().next().value!)
}

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

export const canLoadRoadLegs = () =>
  Platform.OS === 'ios'
    ? RouteDirections.isAvailable
    : Platform.OS === 'android'

export const loadRoadLegs = async (
  path: Coordinate[],
  signal: AbortSignal
): Promise<boolean> => {
  if (!canLoadRoadLegs() || Date.now() < quietUntil) return false

  const legs = path
    .slice(1)
    .map((to, index) => ({ from: path[index]!, to }))
    .filter(({ from, to }) => straightLineMeters(from, to) >= SAME_PLACE_M)
  const missing = legs.filter(({ from, to }) => !cache.has(legKey(from, to)))
  if (missing.length === 0) return false

  if (Platform.OS === 'android') {
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

        if (signal.aborted) return
        remember(legKey(next.from, next.to), leg && toRoadLeg(leg))
        learned = true
      } catch (error) {
        if (signal.aborted) return

        const code = (error as { code?: unknown } | null)?.code
        quietUntil = Date.now() + (code === 'rate_limited' ? 60_000 : 30_000)
        return
      }
    }
  }
  await Promise.all(Array.from({ length: IOS_CONCURRENCY }, worker))
  return learned && !signal.aborted
}

export const resetRoadLegs = () => {
  cache.clear()
  quietUntil = 0
}
