import type { Coordinate } from '@/types/contact'
import type { BuilderStop } from '@/features/route-planning/lib/routeBuilder'
import type { RoadLeg } from '@/features/route-planning/lib/roadLegs'

const EARTH_RADIUS_M = 6_371_000

const ROAD_FACTOR = 1.3

const CITY_METERS_PER_MINUTE = 32_000 / 60

const PARKING_MINUTES = 2

export const SAME_PLACE_M = 75

export const LATE_GRACE_MINUTES = 5

export type TimelineLeg = {
  meters: number
  minutes: number
}

export type RoadLegLookup = (
  from: Coordinate,
  to: Coordinate
) => RoadLeg | null | undefined

export type TimelineEntry = {
  key: string

  leg?: TimelineLeg

  arrive: number

  waitMinutes: number

  lateMinutes: number

  begin: number
  depart: number
}

export type RouteTimeline = {
  entries: TimelineEntry[]
  start: number

  end: number

  finishLeg?: TimelineLeg
  meters: number
  driveMinutes: number
}

const radians = (degrees: number) => (degrees * Math.PI) / 180

export const straightLineMeters = (a: Coordinate, b: Coordinate): number => {
  const dLat = radians(b.latitude - a.latitude)
  const dLon = radians(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export const estimateLeg = (
  from: Coordinate,
  to: Coordinate,
  roadLeg?: RoadLegLookup
): TimelineLeg => {
  const straight = straightLineMeters(from, to)
  if (straight < SAME_PLACE_M) return { meters: 0, minutes: 0 }
  const road = roadLeg?.(from, to)
  if (road) {
    return {
      meters: road.meters,
      minutes: Math.round(road.seconds / 60) + PARKING_MINUTES,
    }
  }
  const meters = straight * ROAD_FACTOR
  return {
    meters,
    minutes: Math.round(meters / CITY_METERS_PER_MINUTE) + PARKING_MINUTES,
  }
}

export const buildTimeline = ({
  origin,
  startTime,
  stops,
  keepSetTimes,
  finish = null,
  roadLeg,
}: {
  origin: Coordinate | null
  startTime: number
  stops: BuilderStop[]
  keepSetTimes: boolean

  finish?: Coordinate | null

  roadLeg?: RoadLegLookup
}): RouteTimeline => {
  const entries: TimelineEntry[] = []
  let clock = startTime
  let at = origin
  let meters = 0
  let driveMinutes = 0

  for (const stop of stops) {
    const leg = at ? estimateLeg(at, stop.coordinate, roadLeg) : undefined
    const arrive = clock + (leg?.minutes ?? 0)
    const setTime = stop.setTime
    const waitMinutes =
      keepSetTimes && setTime !== undefined ? Math.max(0, setTime - arrive) : 0
    const late = setTime !== undefined ? arrive - setTime : 0
    const begin = arrive + waitMinutes
    const depart = begin + stop.stayMinutes
    entries.push({
      key: stop.key,
      ...(leg && { leg }),
      arrive,
      waitMinutes,
      lateMinutes: late > LATE_GRACE_MINUTES ? late : 0,
      begin,
      depart,
    })
    meters += leg?.meters ?? 0
    driveMinutes += leg?.minutes ?? 0
    clock = depart
    at = stop.coordinate
  }

  const finishLeg =
    finish && at && stops.length > 0
      ? estimateLeg(at, finish, roadLeg)
      : undefined
  if (finishLeg) {
    meters += finishLeg.meters
    driveMinutes += finishLeg.minutes
    clock += finishLeg.minutes
  }

  return {
    entries,
    start: startTime,
    end: clock,
    ...(finishLeg && { finishLeg }),
    meters,
    driveMinutes,
  }
}
