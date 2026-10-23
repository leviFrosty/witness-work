import type { Coordinate } from '@/types/contact'
import type { BuilderStop } from '@/features/route-planning/lib/routeBuilder'
import type { RoadLeg } from '@/features/route-planning/lib/roadLegs'

/**
 * Driving times through the day. A leg with directions by road (`roadLegs`)
 * uses them; until then, or offline, a rough estimate with no network call:
 * straight-line distance stretched to road distance, at a city speed. Either
 * way plus a couple of minutes to park.
 */
const EARTH_RADIUS_M = 6_371_000
/** Roads wind; a straight line underestimates the drive by about this much. */
const ROAD_FACTOR = 1.3
/** Typical door-to-door city driving, in meters per minute (about 20 mph). */
const CITY_METERS_PER_MINUTE = 32_000 / 60
/** Finding parking and walking to the door. */
const PARKING_MINUTES = 2
/** Closer than this is the same place: no drive. */
export const SAME_PLACE_M = 75
/** Arriving this much after a stop's set time counts as late. */
export const LATE_GRACE_MINUTES = 5

export type TimelineLeg = {
  /** Road distance, measured or estimated. */
  meters: number
  minutes: number
}

/** Directions by road between two places, when known. */
export type RoadLegLookup = (
  from: Coordinate,
  to: Coordinate
) => RoadLeg | null | undefined

export type TimelineEntry = {
  key: string
  /**
   * The drive here from the start or the stop before; none for a first stop the
   * route starts at.
   */
  leg?: TimelineLeg
  /** Local minutes since midnight; may pass 1440 on a long day. */
  arrive: number
  /** Waiting for the stop's set time, when arriving early. */
  waitMinutes: number
  /** How late against the stop's set time, past the grace minutes. */
  lateMinutes: number
  /** When the stop's time starts: on arrival, or at its set time. */
  begin: number
  depart: number
}

export type RouteTimeline = {
  entries: TimelineEntry[]
  start: number
  /** When the day ends: leaving the last stop, or reaching the finish. */
  end: number
  /** The drive from the last stop to the finish, when it's elsewhere. */
  finishLeg?: TimelineLeg
  meters: number
  driveMinutes: number
}

const radians = (degrees: number) => (degrees * Math.PI) / 180

/** Great-circle distance in meters. */
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

/**
 * Times through the day: leave `origin` (or start at the first stop) at
 * `startTime`, drive to each stop, stay its minutes, and move on, then drive to
 * `finish` if there is one. With `keepSetTimes`, arriving before a stop's set
 * time waits for it.
 */
export const buildTimeline = ({
  origin,
  startTime,
  stops,
  keepSetTimes,
  finish = null,
  roadLeg,
}: {
  /** Where the route leaves from; null starts at the first stop. */
  origin: Coordinate | null
  startTime: number
  stops: BuilderStop[]
  keepSetTimes: boolean
  /** Where the day ends; null ends at the last stop. */
  finish?: Coordinate | null
  /** Directions by road, for the legs that have them. */
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
