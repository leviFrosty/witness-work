import type { Coordinate } from '@/types/contact'
import type { RichText } from '@/types/richText'
import { MAX_ROUTE_STOPS } from '@/features/route-planning/lib/routeLimits'
import type { RouteStop } from '@/features/route-planning/lib/routeStops'

/** Where a stop on a built route came from. */
export type BuilderStopKind = 'followUp' | 'plan' | 'contact' | 'place'

/**
 * A stop the User added by hand: a Contact, a searched place, typed
 * coordinates, or a pin dropped on the map.
 */
export type AddedStop = {
  /** `contact:<contactId>` or `place:<uuid>`. */
  key: string
  kind: 'contact' | 'place'
  title: string
  subtitle?: string
  coordinate: Coordinate
  /** What navigation apps receive, as for the day's stops. */
  destination: string
}

/** A place the User saved for one tap: their home or Kingdom Hall. */
export type SavedPlaceKind = 'home' | 'kingdomHall'

export const SAVED_PLACE_KINDS: SavedPlaceKind[] = ['home', 'kingdomHall']

/** A place the route leaves from before its first stop, or ends at. */
export type RouteOriginPlace = {
  title: string
  subtitle?: string
  coordinate: Coordinate
  destination: string
  /** The Plan this place came from, so the Plan isn't also a stop. */
  stopKey?: string
  /** The saved place it was picked as. */
  savedPlace?: SavedPlaceKind
}

export type SavedPlace = Omit<RouteOriginPlace, 'stopKey' | 'savedPlace'>

/**
 * Where the day starts: at the first stop, wherever the device is when the
 * route opens, or a chosen place such as the meeting for field service.
 */
export type RouteOrigin =
  | { kind: 'firstStop' }
  | { kind: 'currentLocation' }
  | ({ kind: 'place' } & RouteOriginPlace)

/**
 * Where the day ends: at the last stop, back where it started, or a chosen
 * place such as home. It isn't a stop: there's no time spent there.
 */
export type RouteFinish =
  | { kind: 'lastStop' }
  | { kind: 'start' }
  | ({ kind: 'place' } & RouteOriginPlace)

/**
 * One day's route as the User built it. Stops come from the day (open
 * Follow-ups and Plans with a location) plus the ones added by hand. Kept on
 * this device only for now.
 */
export type SavedRoute = {
  /** Local day, `YYYY-MM-DD`. */
  day: string
  /** Stop keys in visiting order; day stops not listed yet join by time. */
  order: string[]
  /** The day's stops the User took off the route. */
  removed: string[]
  added: AddedStop[]
  /** Minutes at a stop, where the User changed it. */
  stay: Record<string, number>
  /** Local minutes since midnight the route starts. */
  startTimeInMinutes?: number
  origin?: RouteOrigin
  /** Where the day ends; at the last stop when unset. */
  finish?: RouteFinish
  /** Arrive no earlier than each stop's set time. Defaults to on. */
  keepSetTimes?: boolean
  /** The route's note, as plain text and formatted (see `noteFields`). */
  note?: string
  noteDoc?: RichText
  /** The Plan (`dayPlan` or `recurringPlan` id) this route belongs to. */
  planId?: string
  updatedAt: number
}

/** A stop as the builder shows it, in visiting order. */
export type BuilderStop = {
  key: string
  kind: BuilderStopKind
  /** The Contact visited there, for Follow-ups and added Contacts. */
  contactId?: string
  title: string
  subtitle?: string
  coordinate: Coordinate
  destination: string
  /**
   * The time it's set for (a Follow-up's, a Plan's start); none when Anytime or
   * added.
   */
  setTime?: number
  /** Minutes spent there. */
  stayMinutes: number
}

/** Minutes at a Follow-up, an added Contact, or a place, until changed. */
export const DEFAULT_STAY_MINUTES = 15
/** Choices offered for the time spent at a stop. */
export const STAY_CHOICES = [5, 10, 15, 20, 30, 45, 60, 90, 120]

const fromDayStop = (stop: RouteStop, stay: Record<string, number>) =>
  ({
    key: stop.key,
    kind: stop.kind,
    contactId: stop.contactId,
    title: stop.title,
    subtitle: stop.subtitle,
    coordinate: stop.coordinate,
    destination: stop.destination,
    ...(stop.anytime ? {} : { setTime: stop.startTimeInMinutes }),
    stayMinutes:
      stay[stop.key] ??
      (stop.kind === 'plan' && stop.minutes
        ? stop.minutes
        : DEFAULT_STAY_MINUTES),
  }) satisfies BuilderStop

const fromAddedStop = (stop: AddedStop, stay: Record<string, number>) =>
  ({
    ...stop,
    ...(stop.kind === 'contact' && {
      contactId: stop.key.slice('contact:'.length),
    }),
    stayMinutes: stay[stop.key] ?? DEFAULT_STAY_MINUTES,
  }) satisfies BuilderStop

/** One of the day's Plans, as the route can start from it. */
export type PlanStart = {
  id: string
  /** `plan:<id>`, as the Plan's stop key. */
  stopKey: string
  time: number
  anytime: boolean
  place?: Omit<RouteOriginPlace, 'stopKey'>
}

/**
 * The Plan the day likely starts from, such as a meeting for field service: the
 * earliest Plan with a set time and a place, when it starts no later than the
 * first Follow-up.
 */
export const startingPlan = <P extends PlanStart>(
  plans: P[],
  dayStops: RouteStop[]
): P | undefined => {
  const first = plans
    .filter((plan) => !plan.anytime && plan.place)
    .sort((a, b) => a.time - b.time)[0]
  if (!first) return undefined
  const firstFollowUp = dayStops.find((stop) => stop.kind === 'followUp')
  return !firstFollowUp || first.time <= firstFollowUp.startTimeInMinutes
    ? first
    : undefined
}

/**
 * A new route for the day: its stops by time, those past the limit left off,
 * starting from `start` (and linked to it) when the day has a starting Plan.
 */
export const newSavedRoute = (
  day: string,
  dayStops: RouteStop[],
  start?: PlanStart
): SavedRoute => {
  const stops = dayStops.filter((stop) => stop.key !== start?.stopKey)
  return {
    day,
    order: stops.slice(0, MAX_ROUTE_STOPS).map((stop) => stop.key),
    removed: stops.slice(MAX_ROUTE_STOPS).map((stop) => stop.key),
    added: [],
    stay: {},
    ...(start?.place && {
      planId: start.id,
      startTimeInMinutes: start.time,
      origin: { kind: 'place', ...start.place, stopKey: start.stopKey },
    }),
    updatedAt: 0,
  }
}

/**
 * The route's stops in visiting order, and the day's stops left off it. A day
 * stop the saved order doesn't know yet (a Follow-up set after the route was
 * built) slots in before the first stop set for a later time. Stops that no
 * longer exist drop out. A Plan used as the starting place isn't a stop.
 */
export const builderStops = (
  dayStops: RouteStop[],
  route: SavedRoute
): { stops: BuilderStop[]; removed: BuilderStop[] } => {
  const originKey =
    route.origin?.kind === 'place' ? route.origin.stopKey : undefined
  const all = new Map<string, BuilderStop>()
  for (const stop of dayStops) all.set(stop.key, fromDayStop(stop, route.stay))
  for (const stop of route.added)
    all.set(stop.key, fromAddedStop(stop, route.stay))

  const removedKeys = new Set(route.removed)
  const stops = route.order.flatMap((key) => {
    const stop = all.get(key)
    return stop && !removedKeys.has(key) && key !== originKey ? [stop] : []
  })
  const listed = new Set(route.order)
  for (const dayStop of dayStops) {
    if (listed.has(dayStop.key) || removedKeys.has(dayStop.key)) continue
    if (dayStop.key === originKey) continue
    const stop = all.get(dayStop.key)!
    const later = stops.findIndex(
      (other) =>
        other.setTime !== undefined &&
        stop.setTime !== undefined &&
        other.setTime > stop.setTime
    )
    stops.splice(later < 0 ? stops.length : later, 0, stop)
  }

  const removed = dayStops.flatMap((stop) =>
    removedKeys.has(stop.key) && stop.key !== originKey
      ? [all.get(stop.key)!]
      : []
  )
  return { stops, removed }
}

/**
 * The stops `day`'s route has: the saved route's, or, when there's none or it
 * has no stops, the day's stops a new route would take (see `newSavedRoute`).
 * `planned` says it's the saved route's.
 */
export const dayRouteStopsFor = (
  day: string,
  dayStops: RouteStop[],
  saved: SavedRoute | undefined,
  start?: PlanStart
): { stops: BuilderStop[]; planned: boolean } => {
  const savedStops = saved ? builderStops(dayStops, saved).stops : []
  return savedStops.length > 0
    ? { stops: savedStops, planned: true }
    : {
        stops: builderStops(dayStops, newSavedRoute(day, dayStops, start))
          .stops,
        planned: false,
      }
}

/**
 * Which Contacts picked elsewhere (the Contacts map) join a route that has
 * `stops`: those not on it yet, as a stop or a Follow-up, in the order picked,
 * up to the room left. `leftOff` counts the new ones there wasn't room for.
 */
export const contactStopsToAdd = (
  stops: Pick<BuilderStop, 'key' | 'contactId'>[],
  picked: AddedStop[]
): { added: AddedStop[]; leftOff: number } => {
  const keys = new Set(stops.map((stop) => stop.key))
  const contactIds = new Set(stops.map((stop) => stop.contactId))
  const fresh = picked.filter((stop) => {
    const contactId =
      stop.kind === 'contact' ? stop.key.slice('contact:'.length) : undefined
    if (keys.has(stop.key) || (contactId && contactIds.has(contactId)))
      return false
    // Picked twice, it's added once.
    keys.add(stop.key)
    return true
  })
  const room = Math.max(0, MAX_ROUTE_STOPS - stops.length)
  return {
    added: fresh.slice(0, room),
    leftOff: Math.max(0, fresh.length - room),
  }
}

/** Rounds down to the 5 minutes before, for a start time people would pick. */
const roundDown5 = (minutes: number) => Math.max(0, Math.floor(minutes / 5) * 5)

/** 9:00 AM, when nothing on the day says otherwise. */
export const DEFAULT_ROUTE_START = 9 * 60

/**
 * When the route starts unless the User picked a time: early enough to reach
 * the first stop by its set time, or 9:00 AM.
 */
export const defaultStartTime = (
  stops: BuilderStop[],
  firstLegMinutes: number
): number => {
  const first = stops[0]
  if (first?.setTime === undefined) return DEFAULT_ROUTE_START
  return roundDown5(first.setTime - firstLegMinutes)
}

/** The keys in `order` with `key` moved `by` places, kept within the list. */
export const moveKey = (order: string[], key: string, by: number): string[] => {
  const from = order.indexOf(key)
  if (from < 0) return order
  const to = Math.max(0, Math.min(order.length - 1, from + by))
  if (to === from) return order
  const next = [...order]
  next.splice(from, 1)
  next.splice(to, 0, key)
  return next
}

/**
 * What Shortest Order may reorder: every stop, or all but the first when the
 * day starts at the first stop (it's where the drive leaves from).
 */
export const reorderableStops = (
  stops: BuilderStop[],
  startsAtFirstStop: boolean
): { fixed: BuilderStop | null; movable: BuilderStop[] } =>
  startsAtFirstStop && stops.length > 0
    ? { fixed: stops[0]!, movable: stops.slice(1) }
    : { fixed: null, movable: stops }

/**
 * Stop keys in ww-api's order (`order` indexes `movable`), the fixed first stop
 * kept first.
 */
export const optimizedOrder = (
  { fixed, movable }: ReturnType<typeof reorderableStops>,
  order: number[]
): string[] => [
  ...(fixed ? [fixed.key] : []),
  ...order.map((index) => movable[index]!.key),
]
