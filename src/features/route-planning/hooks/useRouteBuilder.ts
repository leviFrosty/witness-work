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
import useRoadLegs from '@/features/route-planning/hooks/useRoadLegs'
import type { RoutePlannerFailure } from '@/features/route-planning/lib/routePlanErrors'
import { currentCoordinate } from '@/features/route-planning/lib/currentLocation'
import {
  builderStops,
  contactStopsToAdd,
  defaultStartTime,
  moveKey,
  newSavedRoute,
  optimizedOrder,
  reorderableStops,
  startingPlan,
  type AddedStop,
  type BuilderStop,
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
import { routePlanOptions } from '@/features/route-planning/lib/routePlanOptions'
import {
  buildTimeline,
  estimateLeg,
} from '@/features/route-planning/lib/routeTimeline'
import { legKey } from '@/features/route-planning/lib/roadLegs'
import type { Coordinate } from '@/types/contact'
import { atMinutesOfDay } from '@/lib/normalizeDate'
import { useSavedRoutes } from '@/features/route-planning/stores/savedRoutes'

export type { RoutePlanOption } from '@/features/route-planning/lib/routePlanOptions'

export type AddedStopSource =
  | 'place'
  | 'contact'
  | 'coordinates'
  | 'map'
  | 'map_pin'
  | 'home'
  | 'kingdom_hall'
  | 'contacts_map'

export type PlanLinkSource = 'menu' | 'plan' | 'new_plan'

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

  const [lastOpened, setLastOpened] = useState<{
    order: string
    index: number
  } | null>(null)
  const optimizeAbort = useRef<AbortController>(null)

  useEffect(() => () => optimizeAbort.current?.abort(), [dayKey])
  const [shownDay, setShownDay] = useState(dayKey)
  if (shownDay !== dayKey) {
    setShownDay(dayKey)
    setOptimizing(false)
    setError(null)
    setOptimized(null)
    setLastOpened(null)
  }

  const planOptions = routePlanOptions({ day, dayPlans, recurringPlans })
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

  const finishCoordinate =
    finish.kind === 'place'
      ? finish.coordinate
      : finish.kind === 'start'
        ? (originCoordinate ?? stops[0]?.coordinate ?? null)
        : null
  const keepSetTimes = route.keepSetTimes ?? true

  const roads = useRoadLegs([
    ...(originCoordinate ? [originCoordinate] : []),
    ...stops.map((stop) => stop.coordinate),
    ...(finishCoordinate && stops.length > 0 ? [finishCoordinate] : []),
  ])
  const roadLeg = (from: Coordinate, to: Coordinate) =>
    roads.get(legKey(from, to))
  const firstLeg =
    originCoordinate && stops[0]
      ? estimateLeg(originCoordinate, stops[0].coordinate, roadLeg).minutes
      : 0
  const startTime =
    route.startTimeInMinutes ?? defaultStartTime(stops, firstLeg)
  const timeline = buildTimeline({
    origin: originCoordinate,
    startTime,
    stops,
    keepSetTimes,
    finish: finishCoordinate,
    roadLeg,
  })

  const linkedPlan = planOptions.find((plan) => plan.id === route.planId)

  const update = (change: Partial<SavedRoute>) => {
    setError(null)

    const latest = useSavedRoutes.getState().routes[route.day] ?? route
    saveRoute({ ...latest, ...change })
  }

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

  const addContactStops = (picked: AddedStop[], source: AddedStopSource) => {
    const { added, leftOff } = contactStopsToAdd(stops, picked)
    if (added.length > 0) {
      const addedKeys = new Set(added.map((stop) => stop.key))
      update({
        added: [
          ...route.added.filter((stop) => !addedKeys.has(stop.key)),
          ...added,
        ],
        order: [...keys, ...added.map((stop) => stop.key)],
      })
      analytics.capture('route_stop_added', { source, count: added.length })
    }
    return { added: added.length, leftOff }
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

  const handoffOrder = handoffStops.map((stop) => stop.destination).join('|')
  const opened = lastOpened?.order === handoffOrder ? lastOpened.index : null
  const next =
    handoff.mode === 'stopByStop' && opened !== null
      ? Math.min(opened + 1, handoff.links.length - 1)
      : 0

  const startNavigation = () => {
    const link = handoff.links[next]
    if (!link) return
    openLink(link)
    setLastOpened({ order: handoffOrder, index: next })

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

    hasSetTimes: stops.some((stop) => stop.setTime !== undefined),
    timeline,
    roads,
    note: { note: route.note, noteDoc: route.noteDoc },
    planOptions,
    linkedPlan,
    canAdd,
    optimizing,
    error,

    optimized: optimized?.order === keys.join('|') ? optimized : null,
    handoff,

    nextStop:
      opened !== null
        ? { position: next + 1, title: handoffStops[next]!.title }
        : null,
    edited: !!saved,
    setOrder,
    move: (key: string, by: number) => setOrder(moveKey(keys, key, by)),
    addStop,
    addContactStops,
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
