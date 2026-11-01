import type { DefaultNavigationMapProvider } from '@/stores/preferences'
import { resolveNavigationMapProvider } from '@/lib/navigationMapProvider'
import { coordinateText } from '@/features/route-planning/lib/coordinateText'
import type { RouteStop } from '@/features/route-planning/lib/routeStops'

export type NavigationApp = 'apple' | 'google' | 'waze'

export type RouteHandoff = {
  app: NavigationApp
  mode: 'route' | 'stopByStop'

  links: string[]
}

const GOOGLE_MAX_STOPS = 10

const APPLE_MAX_STOPS = 14

const GOOGLE_MAX_URL_LENGTH = 2048

export const resolveNavigationApp = (
  provider: DefaultNavigationMapProvider,
  platform: string
): NavigationApp => resolveNavigationMapProvider(provider, platform) ?? 'apple'

export const supportsAppleMultiStop = (platform: string, version: unknown) => {
  if (platform !== 'ios') return false
  const [major = 0, minor = 0] = String(version).split('.').map(Number)
  return major > 18 || (major === 18 && minor >= 4)
}

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

type HandoffStop = Pick<RouteStop, 'coordinate' | 'destination'>

const stopLink = (app: NavigationApp, stop: HandoffStop) => {
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

const googleDestination = (stop: HandoffStop) =>
  stop.destination.replace(/\|/g, ' ')

export const buildRouteHandoff = ({
  app,
  stops,
  appleMultiStop,
}: {
  app: NavigationApp

  stops: HandoffStop[]
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
