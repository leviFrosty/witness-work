import type { DefaultNavigationMapProvider } from '@/stores/preferences'
import { resolveNavigationMapProvider } from '@/lib/navigationMapProvider'
import { coordinateText } from '@/features/route-planning/lib/coordinateText'
import type { RouteStop } from '@/features/route-planning/lib/routeStops'

export type NavigationApp = 'apple' | 'google' | 'waze'

/**
 * How a planned route reaches the navigation app. Every link starts from the
 * device's current location, so a chosen starting stop is simply the first
 * stop.
 *
 * - `route`: one link carrying every stop in order.
 * - `stopByStop`: one link per stop, opened in turn, for apps whose links take a
 *   single destination.
 */
export type RouteHandoff = {
  app: NavigationApp
  mode: 'route' | 'stopByStop'
  /** One link for `route`; one per stop, in order, for `stopByStop`. */
  links: string[]
}

/** Google Maps: up to 9 waypoints plus the destination in its apps. */
const GOOGLE_MAX_STOPS = 10
/** Apple Maps: up to 14 stops on a route. */
const APPLE_MAX_STOPS = 14
/** Google Maps URLs are limited to 2,048 characters. */
const GOOGLE_MAX_URL_LENGTH = 2048

export const resolveNavigationApp = (
  provider: DefaultNavigationMapProvider,
  platform: string
): NavigationApp => resolveNavigationMapProvider(provider, platform) ?? 'apple'

/** Apple Maps opens multi-stop directions links from iOS 18.4 on. */
export const supportsAppleMultiStop = (platform: string, version: unknown) => {
  if (platform !== 'ios') return false
  const [major = 0, minor = 0] = String(version).split('.').map(Number)
  return major > 18 || (major === 18 && minor >= 4)
}

/** Percent-encodes values (spaces as `%20`, never `+`). */
const query = (params: [string, string][]) =>
  params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')

const googleRouteUrl = (destinations: string[]) => {
  const params: [string, string][] = [
    ['api', '1'],
    ['destination', destinations[destinations.length - 1]!],
  ]
  if (destinations.length > 1) {
    params.push(['waypoints', destinations.slice(0, -1).join('|')])
  }
  params.push(['travelmode', 'driving'])
  return `https://www.google.com/maps/dir/?${query(params)}`
}

const appleRouteUrl = (destinations: string[]) =>
  `https://maps.apple.com/directions?${query([
    ['destination', destinations[destinations.length - 1]!],
    ...destinations
      .slice(0, -1)
      .map((waypoint): [string, string] => ['waypoint', waypoint]),
    ['mode', 'driving'],
  ])}`

const stopLink = (app: NavigationApp, stop: RouteStop) => {
  switch (app) {
    case 'waze':
      return `https://waze.com/ul?${query([
        ['ll', coordinateText(stop.coordinate)],
        ['navigate', 'yes'],
      ])}`
    case 'google':
      return googleRouteUrl([stop.destination])
    case 'apple':
      return `https://maps.apple.com/?${query([
        ['daddr', stop.destination],
        ['dirflg', 'd'],
      ])}`
  }
}

// `|` separates Google waypoints; an address can't contain one.
const googleDestination = (stop: RouteStop) =>
  stop.destination.replace(/\|/g, ' ')

export const buildRouteHandoff = ({
  app,
  stops,
  appleMultiStop,
}: {
  app: NavigationApp
  /** In visiting order, the starting stop first when there is one. */
  stops: RouteStop[]
  appleMultiStop: boolean
}): RouteHandoff => {
  const stopByStop = (): RouteHandoff => ({
    app,
    mode: 'stopByStop',
    links: stops.map((stop) => stopLink(app, stop)),
  })
  if (stops.length === 0) return { app, mode: 'route', links: [] }

  if (app === 'google' && stops.length <= GOOGLE_MAX_STOPS) {
    let url = googleRouteUrl(stops.map(googleDestination))
    // Long addresses can overflow the URL; coordinates always fit.
    if (url.length > GOOGLE_MAX_URL_LENGTH) {
      url = googleRouteUrl(stops.map((stop) => coordinateText(stop.coordinate)))
    }
    return { app, mode: 'route', links: [url] }
  }
  if (app === 'apple' && appleMultiStop && stops.length <= APPLE_MAX_STOPS) {
    return {
      app,
      mode: 'route',
      links: [appleRouteUrl(stops.map((stop) => stop.destination))],
    }
  }
  return stopByStop()
}
