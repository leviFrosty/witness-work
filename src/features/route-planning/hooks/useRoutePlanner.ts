import { useState } from 'react'
import { Platform } from 'react-native'
import useAccount from '@/hooks/useAccount'
import { analytics } from '@/lib/analytics'
import { openURL } from '@/lib/links'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { currentCoordinate } from '@/features/route-planning/lib/currentLocation'
import {
  buildRouteHandoff,
  resolveNavigationApp,
  supportsAppleMultiStop,
  type RouteHandoff,
} from '@/features/route-planning/lib/routeHandoff'
import {
  optimizeRoute,
  type RoutePlanningError,
} from '@/features/route-planning/lib/routePlanningClient'
import { MAX_ROUTE_STOPS } from '@/features/route-planning/lib/routeLimits'
import type { RouteStop } from '@/features/route-planning/lib/routeStops'

export type RoutePlannerError = RoutePlanningError | 'location'

export type PlannedRoute = {
  /** Visiting order; a chosen starting stop comes first. */
  stops: RouteStop[]
  startsAtCurrentLocation: boolean
  /** Absent when there was nothing to reorder (one stop to visit). */
  summary?: { distanceMeters: number; durationSeconds: number }
  handoff: RouteHandoff
}

/**
 * Review → plan → hand off for one day's stops. Stops past the limit start out
 * removed; the User can swap them in.
 */
export default function useRoutePlanner(stops: RouteStop[]) {
  const { accountId } = useAccount()
  const provider = usePreferences((s) => s.defaultNavigationMapProvider)
  const [removedKeys, setRemovedKeys] = useState(() =>
    stops.slice(MAX_ROUTE_STOPS).map((stop) => stop.key)
  )
  const [startKey, setStartKey] = useState<string | null>(null)
  const [planning, setPlanning] = useState(false)
  const [error, setError] = useState<RoutePlannerError | null>(null)
  const [route, setRoute] = useState<PlannedRoute | null>(null)
  /** Stop-by-stop handoff: the last link opened. */
  const [lastOpened, setLastOpened] = useState<number | null>(null)

  const included = stops.filter((stop) => !removedKeys.includes(stop.key))
  const removed = stops.filter((stop) => removedKeys.includes(stop.key))
  const startStop = included.find((stop) => stop.key === startKey) ?? null
  const canRestore = included.length < MAX_ROUTE_STOPS

  const remove = (key: string) => {
    setRemovedKeys((keys) => [...keys, key])
    if (key === startKey) setStartKey(null)
    setError(null)
  }

  const restore = (key: string) => {
    if (!canRestore) return
    setRemovedKeys((keys) => keys.filter((k) => k !== key))
    setError(null)
  }

  const chooseStart = (key: string | null) => {
    setStartKey(key)
    setError(null)
  }

  const fail = (code: RoutePlannerError) => {
    setError(code)
    analytics.capture('route_plan_failed', { error_code: code })
  }

  const plan = async () => {
    if (planning || included.length === 0) return
    setPlanning(true)
    setError(null)
    try {
      const destinations = included.filter((stop) => stop !== startStop)
      let ordered = destinations
      let summary: PlannedRoute['summary']
      // One stop to visit has nothing to reorder; skip the server.
      if (destinations.length > 1) {
        const start = startStop?.coordinate ?? (await currentCoordinate())
        if (!start) return fail('location')
        if (!accountId) return fail('failed')
        const result = await optimizeRoute({
          accountId,
          start,
          stops: destinations.map((stop) => stop.coordinate),
        })
        if (!result.ok) return fail(result.error)
        ordered = result.order.map((index) => destinations[index]!)
        summary = {
          distanceMeters: result.distanceMeters,
          durationSeconds: result.durationSeconds,
        }
      }

      const routeStops = startStop ? [startStop, ...ordered] : ordered
      setRoute({
        stops: routeStops,
        startsAtCurrentLocation: !startStop,
        summary,
        handoff: buildRouteHandoff({
          app: resolveNavigationApp(provider, Platform.OS),
          stops: routeStops,
          appleMultiStop: supportsAppleMultiStop(Platform.OS, Platform.Version),
        }),
      })
      setLastOpened(null)
      analytics.capture('route_plan_created', {
        stop_count: routeStops.length,
        removed_count: removed.length,
        start: startStop ? 'stop' : 'current_location',
        optimized: !!summary,
      })
    } finally {
      setPlanning(false)
    }
  }

  const open = (index: number) => {
    const link = route?.handoff.links[index]
    if (!route || !link) return
    openURL(link, {
      alert: {
        title: i18n.t('couldNotOpenMaps'),
        description: i18n.t('couldNotOpenMaps_description'),
      },
    })
    // One per planned route: did the plan turn into a drive?
    if (lastOpened === null) {
      analytics.capture('route_plan_navigation_started', {
        app: route.handoff.app,
        handoff: route.handoff.mode,
        stop_count: route.stops.length,
      })
    }
    setLastOpened(index)
  }

  return {
    included,
    removed,
    startStop,
    canRestore,
    planning,
    error,
    route,
    lastOpened,
    remove,
    restore,
    chooseStart,
    plan,
    open,
    editStops: () => setRoute(null),
  }
}
