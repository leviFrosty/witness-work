import { useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import moment from 'moment'
import useLocation from '@/hooks/useLocation'
import { analytics } from '@/lib/analytics'
import { openURL } from '@/lib/links'
import i18n from '@/lib/locales'
import type { NoteUpdate } from '@/lib/richText/notes'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import useDayRouteStops from '@/features/route-planning/hooks/useDayRouteStops'
import type { RoutePlannerFailure } from '@/features/route-planning/lib/routePlanErrors'
import { currentCoordinate } from '@/features/route-planning/lib/currentLocation'
import {
  builderStops,
  defaultStartTime,
  moveKey,
  newSavedRoute,
  optimizedOrder,
  reorderableStops,
  startingPlan,
  type AddedStop,
  type BuilderStop,
  type PlanStart,
  type RouteFinish,
  type RouteOrigin,
  type SavedRoute,
} from '@/features/route-planning/lib/routeBuilder'
import {
  buildRouteHandoff,
  resolveNavigationApp,
  supportsAppleMultiStop,
} from '@/features/route-planning/lib/routeHandoff'
import { coordinateText } from '@/features/route-planning/lib/coordinateText'
import { MAX_ROUTE_STOPS } from '@/features/route-planning/lib/routeLimits'
import { optimizeRoute } from '@/features/route-planning/lib/routePlanningClient'
import { plansOnDay } from '@/features/route-planning/lib/routeStops'
import {
  buildTimeline,
  estimateLeg,
} from '@/features/route-planning/lib/routeTimeline'
import { formatPlanLocation } from '@/lib/placeSearch'
import { formatStartTime } from '@/lib/dates'
import { atMinutesOfDay } from '@/lib/normalizeDate'
import { useSavedRoutes } from '@/features/route-planning/stores/savedRoutes'

/** A Plan on the day the route can belong to. */
export type RoutePlanOption = PlanStart & { title: string; recurring: boolean }

/** Where a stop added by hand came from, for analytics. */
export type AddedStopSource =
  | 'place'
  | 'contact'
  | 'coordinates'
  | 'map'
  | 'map_pin'
  | 'home'
  | 'kingdom_hall'

/**
 * How the route came to belong to a Plan: picked in Details, opened from the
 * Plan, or made from the route (to invite buddies).
 */
export type PlanLinkSource = 'menu' | 'plan' | 'new_plan'

/** For analytics: where the route ends. */
const finishKey = (finish: RouteFinish) =>
  finish.kind === 'lastStop'
    ? 'last_stop'
    : finish.kind === 'start'
      ? 'start'
      : finish.savedPlace === 'home'
        ? 'home'
        : finish.savedPlace === 'kingdomHall'
          ? 'kingdom_hall'
          : 'place'

/**
 * The route builder for one day: the day's stops in the User's order, the
 * start, estimated times through the day, and the details (note, buddies,
 * linked Plan). Every change saves at once.
 */
export default function useRouteBuilder(day: Date) {
  const dayKey = moment(day).format('YYYY-MM-DD')
  const isToday = moment(day).isSame(moment(), 'day')
  const provider = usePreferences((s) => s.defaultNavigationMapProvider)
  const dayPlans = useServiceReport((s) => s.dayPlans)
  const recurringPlans = useServiceReport((s) => s.recurringPlans)
  const { stops: dayStops, missingLocationCount } = useDayRouteStops(day)
  const saved = useSavedRoutes((s) => s.routes[dayKey])
  const saveRoute = useSavedRoutes((s) => s.save)
  const clearRoute = useSavedRoutes((s) => s.clear)
  const { location } = useLocation()
  const [optimizing, setOptimizing] = useState(false)
  const [error, setError] = useState<RoutePlannerFailure | null>(null)
  const [optimized, setOptimized] = useState<{
    order: string
    distanceMeters: number
    durationSeconds: number
  } | null>(null)
  const reorderedOnce = useRef(false)
  const navigatedOnce = useRef(false)
  /** One stop at a time: the last stop opened, by the handoff's order. */
  const [lastOpened, setLastOpened] = useState<{
    order: string
    index: number
  } | null>(null)
  const optimizeAbort = useRef<AbortController>(null)
  // Shortest Order belongs to the day it was asked for: leaving the day (or
  // the screen) stops it, so a late answer or error can't land on another day.
  useEffect(() => () => optimizeAbort.current?.abort(), [dayKey])
  const [shownDay, setShownDay] = useState(dayKey)
  if (shownDay !== dayKey) {
    setShownDay(dayKey)
    setOptimizing(false)
    setError(null)
    setOptimized(null)
    setLastOpened(null)
  }

  const planOptions: RoutePlanOption[] = plansOnDay({
    day,
    dayPlans,
    recurringPlans,
  })
    .map(({ plan, recurring, time, anytime }) => {
      const meets = plan.location
      const place =
        typeof meets?.latitude === 'number' &&
        typeof meets.longitude === 'number'
          ? formatPlanLocation(meets)
          : undefined
      return {
        id: plan.id,
        stopKey: `plan:${plan.id}`,
        title:
          plan.title?.trim() ||
          place?.primary ||
          (anytime ? i18n.t('planAnytime') : formatStartTime(time)),
        time,
        anytime,
        recurring,
        ...(place &&
          meets && {
            place: {
              title: plan.title?.trim() || place.primary,
              subtitle: plan.title?.trim() ? place.primary : place.secondary,
              coordinate: {
                latitude: meets.latitude!,
                longitude: meets.longitude!,
              },
              destination:
                meets.address?.trim() ||
                coordinateText({
                  latitude: meets.latitude!,
                  longitude: meets.longitude!,
                }),
            },
          }),
      }
    })
    .sort((a, b) => a.time - b.time)
  const route: SavedRoute =
    saved ??
    newSavedRoute(dayKey, dayStops, startingPlan(planOptions, dayStops))
  const { stops, removed } = builderStops(dayStops, route)
  const origin: RouteOrigin = route.origin ?? {
    kind: isToday ? 'currentLocation' : 'firstStop',
  }
  const here = location
    ? {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      }
    : null
  const originCoordinate =
    origin.kind === 'place'
      ? origin.coordinate
      : origin.kind === 'currentLocation'
        ? here
        : null
  const finish: RouteFinish = route.finish ?? { kind: 'lastStop' }
  // Back to the start is back to the first stop when the day starts there.
  const finishCoordinate =
    finish.kind === 'place'
      ? finish.coordinate
      : finish.kind === 'start'
        ? (originCoordinate ?? stops[0]?.coordinate ?? null)
        : null
  const keepSetTimes = route.keepSetTimes ?? true
  const firstLeg =
    originCoordinate && stops[0]
      ? estimateLeg(originCoordinate, stops[0].coordinate).minutes
      : 0
  const startTime =
    route.startTimeInMinutes ?? defaultStartTime(stops, firstLeg)
  const timeline = buildTimeline({
    origin: originCoordinate,
    startTime,
    stops,
    keepSetTimes,
    finish: finishCoordinate,
  })

  const linkedPlan = planOptions.find((plan) => plan.id === route.planId)

  const update = (change: Partial<SavedRoute>) => {
    setError(null)
    // On top of what's saved now, so a change made while Shortest Order or a
    // note was pending isn't undone.
    const latest = useSavedRoutes.getState().routes[route.day] ?? route
    saveRoute({ ...latest, ...change })
  }

  /** Writes the visible order, so new day stops keep the place they showed in. */
  const setOrder = (keys: string[]) => {
    update({ order: keys })
    if (!reorderedOnce.current) {
      reorderedOnce.current = true
      analytics.capture('route_stops_reordered', { stop_count: keys.length })
    }
  }

  const keys = stops.map((stop) => stop.key)
  const canAdd = stops.length < MAX_ROUTE_STOPS

  const addStop = (stop: AddedStop, source: AddedStopSource) => {
    if (!canAdd || keys.includes(stop.key)) return
    update({
      added: [...route.added.filter((s) => s.key !== stop.key), stop],
      order: [...keys, stop.key],
    })
    analytics.capture('route_stop_added', { source })
  }

  const remove = (key: string) => {
    const isAdded = route.added.some((stop) => stop.key === key)
    update({
      order: keys.filter((k) => k !== key),
      ...(isAdded
        ? { added: route.added.filter((stop) => stop.key !== key) }
        : { removed: [...route.removed, key] }),
    })
  }

  /** Puts a removed day stop back, in its place by time. */
  const restore = (key: string) => {
    if (!canAdd) return
    update({
      removed: route.removed.filter((k) => k !== key),
      order: keys.filter((k) => k !== key),
    })
  }

  const setOrigin = (next: RouteOrigin) => update({ origin: next })

  const setFinish = (next: RouteFinish) => {
    update({ finish: next })
    analytics.capture('route_finish_set', { finish: finishKey(next) })
  }

  /**
   * Ties the route to one of the day's Plans: it starts when the Plan does,
   * from the Plan's place when it has one.
   */
  const linkPlan = (planId: string | null, source: PlanLinkSource = 'menu') => {
    const plan = planOptions.find((option) => option.id === planId)
    if (!plan) {
      const unlinkOrigin =
        route.origin?.kind === 'place' &&
        route.origin.stopKey === linkedPlan?.stopKey
      update({
        planId: undefined,
        ...(unlinkOrigin && { origin: undefined }),
      })
      return
    }
    update({
      planId: plan.id,
      ...(!plan.anytime && { startTimeInMinutes: plan.time }),
      ...(plan.place && {
        origin: { kind: 'place', ...plan.place, stopKey: plan.stopKey },
      }),
    })
    analytics.capture('route_plan_linked', {
      starts_at_plan: !!plan.place,
      source,
    })
  }

  /**
   * A new Plan for the day, seeded from the route (its start, place, and
   * length), so buddies can be invited to it. Invitations travel with Plans.
   */
  const planPrefill = {
    startTime: atMinutesOfDay(day, startTime).toISOString(),
    ...(stops.length > 0 && {
      minutes: Math.max(15, Math.round((timeline.end - startTime) / 5) * 5),
    }),
    ...(origin.kind === 'place' &&
      !origin.stopKey && {
        location: {
          name: origin.title,
          address: origin.subtitle ?? origin.destination,
          latitude: origin.coordinate.latitude,
          longitude: origin.coordinate.longitude,
        },
      }),
  }

  const fail = (code: RoutePlannerFailure['code'], retryAfterMs?: number) => {
    setError({ code, ...(retryAfterMs !== undefined && { retryAfterMs }) })
    analytics.capture('route_plan_failed', { error_code: code })
  }

  /** Asks ww-api for the shortest driving order from the start. */
  const optimize = async () => {
    if (optimizing || stops.length < 2) return
    const controller = new AbortController()
    optimizeAbort.current = controller
    setOptimizing(true)
    setError(null)
    try {
      const { fixed, movable } = reorderableStops(
        stops,
        origin.kind === 'firstStop'
      )
      let start = fixed?.coordinate ?? originCoordinate
      if (!start) {
        const position = await currentCoordinate()
        if (controller.signal.aborted) return
        if (!position.ok) {
          return fail(
            position.reason === 'denied' ? 'location_denied' : 'location'
          )
        }
        start = position.coordinate
      }
      const result = await optimizeRoute({
        start,
        stops: movable.map((stop) => stop.coordinate),
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (!result.ok) {
        if (result.error === 'cancelled') return
        return fail(result.error, result.retryAfterMs)
      }
      const order = optimizedOrder({ fixed, movable }, result.order)
      update({ order })
      setOptimized({
        order: order.join('|'),
        distanceMeters: result.distanceMeters,
        durationSeconds: result.durationSeconds,
      })
      analytics.capture('route_plan_created', {
        stop_count: order.length,
        removed_count: removed.length,
        start:
          origin.kind === 'firstStop'
            ? 'stop'
            : origin.kind === 'place'
              ? 'place'
              : 'current_location',
        optimized: true,
      })
    } finally {
      if (!controller.signal.aborted) setOptimizing(false)
    }
  }

  // Back to the start goes where the day began: the chosen place, the first
  // stop, or (from the current location) wherever that was.
  const finishStop =
    stops.length === 0 || !finishCoordinate || finish.kind === 'lastStop'
      ? null
      : finish.kind === 'place'
        ? finish
        : {
            title: i18n.t('routeBuilder_finish'),
            coordinate: finishCoordinate,
            destination:
              origin.kind === 'place'
                ? origin.destination
                : origin.kind === 'firstStop'
                  ? stops[0]!.destination
                  : coordinateText(finishCoordinate),
          }

  /**
   * The navigation app's way through the stops: from the chosen place if any,
   * on to the finish when it's somewhere else.
   */
  const handoffStops: Pick<
    BuilderStop,
    'title' | 'coordinate' | 'destination'
  >[] = [
    ...(origin.kind === 'place' ? [origin] : []),
    ...stops,
    ...(finishStop ? [finishStop] : []),
  ]
  const handoff = buildRouteHandoff({
    app: resolveNavigationApp(provider, Platform.OS),
    stops: handoffStops,
    appleMultiStop: supportsAppleMultiStop(Platform.OS, Platform.Version),
  })

  const openLink = (link: string | undefined) => {
    if (!link) return
    openURL(link, {
      alert: {
        title: i18n.t('couldNotOpenMaps'),
        description: i18n.t('couldNotOpenMaps_description'),
      },
    })
  }

  /** Directions to one stop, e.g. picking up partway through the day. */
  const navigateTo = (key: string) => {
    const stop = stops.find((s) => s.key === key)
    if (!stop) return
    openLink(
      buildRouteHandoff({
        app: handoff.app,
        stops: [stop],
        appleMultiStop: false,
      }).links[0]
    )
  }

  // A reorder starts the one-at-a-time hand-off over.
  const handoffOrder = handoffStops.map((stop) => stop.destination).join('|')
  const opened = lastOpened?.order === handoffOrder ? lastOpened.index : null
  const next =
    handoff.mode === 'stopByStop' && opened !== null
      ? Math.min(opened + 1, handoff.links.length - 1)
      : 0

  /**
   * Opens the route in the navigation app: all of it, or the next stop when the
   * app takes one stop at a time.
   */
  const startNavigation = () => {
    const link = handoff.links[next]
    if (!link) return
    openLink(link)
    setLastOpened({ order: handoffOrder, index: next })
    // One per visit: did the plan turn into a drive?
    if (navigatedOnce.current) return
    navigatedOnce.current = true
    analytics.capture('route_plan_navigation_started', {
      app: handoff.app,
      handoff: handoff.mode,
      stop_count: handoffStops.length,
    })
  }

  return {
    dayKey,
    isToday,
    stops,
    removed,
    /** Contacts already on the route, as Follow-ups or added. */
    contactIds: stops.flatMap((stop) =>
      stop.contactId ? [stop.contactId] : []
    ),
    missingLocationCount,
    origin,
    originCoordinate,
    finish,
    finishCoordinate,
    startTime,
    keepSetTimes,
    /** Some stop has a set time, so Keep Set Times changes something. */
    hasSetTimes: stops.some((stop) => stop.setTime !== undefined),
    timeline,
    note: { note: route.note, noteDoc: route.noteDoc },
    planOptions,
    linkedPlan,
    canAdd,
    optimizing,
    error,
    /** Ww-api's figures, while the stops are still in the order it gave. */
    optimized: optimized?.order === keys.join('|') ? optimized : null,
    handoff,
    /** One stop at a time, after the first: the stop Start Route opens next. */
    nextStop:
      opened !== null
        ? { position: next + 1, title: handoffStops[next]!.title }
        : null,
    edited: !!saved,
    setOrder,
    move: (key: string, by: number) => setOrder(moveKey(keys, key, by)),
    addStop,
    remove,
    restore,
    setStay: (key: string, minutes: number) =>
      update({ stay: { ...route.stay, [key]: minutes } }),
    setStartTime: (minutes: number) => update({ startTimeInMinutes: minutes }),
    setOrigin,
    setFinish,
    setKeepSetTimes: (on: boolean) => update({ keepSetTimes: on }),
    setNote: (note: NoteUpdate) => update(note),
    linkPlan,
    planPrefill,
    optimize,
    startNavigation,
    navigateTo,
    reset: () => {
      clearRoute(dayKey)
      setOptimized(null)
      setError(null)
    },
  }
}

export type RouteBuilder = ReturnType<typeof useRouteBuilder>
