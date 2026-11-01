import type { Coordinate } from '@/types/contact'
import type { RichText } from '@/types/richText'
import { MAX_ROUTE_STOPS } from '@/features/route-planning/lib/routeLimits'
import type { RouteStop } from '@/features/route-planning/lib/routeStops'

export type BuilderStopKind = 'followUp' | 'plan' | 'contact' | 'place'

export type AddedStop = {
  key: string
  kind: 'contact' | 'place'
  title: string
  subtitle?: string
  coordinate: Coordinate

  destination: string
}

export type SavedPlaceKind = 'home' | 'kingdomHall'

export const SAVED_PLACE_KINDS: SavedPlaceKind[] = ['home', 'kingdomHall']

export type RouteOriginPlace = {
  title: string
  subtitle?: string
  coordinate: Coordinate
  destination: string

  stopKey?: string

  savedPlace?: SavedPlaceKind
}

export type SavedPlace = Omit<RouteOriginPlace, 'stopKey' | 'savedPlace'>

export type RouteOrigin =
  | { kind: 'firstStop' }
  | { kind: 'currentLocation' }
  | ({ kind: 'place' } & RouteOriginPlace)

export type RouteFinish =
  | { kind: 'lastStop' }
  | { kind: 'start' }
  | ({ kind: 'place' } & RouteOriginPlace)

export type SavedRoute = {
  day: string

  order: string[]

  removed: string[]
  added: AddedStop[]

  stay: Record<string, number>

  startTimeInMinutes?: number
  origin?: RouteOrigin

  finish?: RouteFinish

  keepSetTimes?: boolean

  note?: string
  noteDoc?: RichText

  planId?: string
  updatedAt: number
}

export type BuilderStop = {
  key: string
  kind: BuilderStopKind

  contactId?: string
  title: string
  subtitle?: string
  coordinate: Coordinate
  destination: string

  setTime?: number

  stayMinutes: number
}

export const DEFAULT_STAY_MINUTES = 15

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

export type PlanStart = {
  id: string

  stopKey: string
  time: number
  anytime: boolean
  place?: Omit<RouteOriginPlace, 'stopKey'>
}

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

    keys.add(stop.key)
    return true
  })
  const room = Math.max(0, MAX_ROUTE_STOPS - stops.length)
  return {
    added: fresh.slice(0, room),
    leftOff: Math.max(0, fresh.length - room),
  }
}

const roundDown5 = (minutes: number) => Math.max(0, Math.floor(minutes / 5) * 5)

export const DEFAULT_ROUTE_START = 9 * 60

export const defaultStartTime = (
  stops: BuilderStop[],
  firstLegMinutes: number
): number => {
  const first = stops[0]
  if (first?.setTime === undefined) return DEFAULT_ROUTE_START
  return roundDown5(first.setTime - firstLegMinutes)
}

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

export const reorderableStops = (
  stops: BuilderStop[],
  startsAtFirstStop: boolean
): { fixed: BuilderStop | null; movable: BuilderStop[] } =>
  startsAtFirstStop && stops.length > 0
    ? { fixed: stops[0]!, movable: stops.slice(1) }
    : { fixed: null, movable: stops }

export const optimizedOrder = (
  { fixed, movable }: ReturnType<typeof reorderableStops>,
  order: number[]
): string[] => [
  ...(fixed ? [fixed.key] : []),
  ...order.map((index) => movable[index]!.key),
]
