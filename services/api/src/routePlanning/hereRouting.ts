import { HERE_API } from '../config'
import type { Coordinate } from './contracts'
import { decodeFlexiblePolyline } from './flexiblePolyline'

/**
 * HERE Routing v8 (`/v8/routes`): the driving route through the points in the
 * order given, one transaction per route. Every point between the first and
 * last is a stopover `via`, so the route comes back as one section per leg,
 * each with its road shape, length, and time with traffic at request time.
 *
 * Routing v8 takes waypoints only in the query string, so unlike Waypoints
 * Sequence the coordinates are in the URL. The caller fetches with an
 * uninstrumented `fetch`, so the URL (and the key in it) never reaches a trace.
 */

export interface RouteLeg {
  distanceMeters: number
  durationSeconds: number
  /** Flat `[lat, lng, lat, lng, …]`, rounded to 5 decimals (about 1 m). */
  coordinates: number[]
}

export type RoutingResult =
  | { kind: 'ok'; legs: RouteLeg[] }
  /** HERE answered but found no route (e.g. a point with no road access). */
  | { kind: 'no_route'; status: number }
  /** HERE failed, timed out, or answered with something we can't read. */
  | { kind: 'upstream_error'; status: number | null }

const point = ({ lat, lng }: Coordinate) =>
  `${Number(lat.toFixed(6))},${Number(lng.toFixed(6))}`

export const buildRoutesRequestUrl = (
  points: Coordinate[],
  apiKey: string
): string => {
  const query = new URLSearchParams({
    transportMode: 'car',
    routingMode: 'fast',
    origin: point(points[0]!),
    destination: point(points[points.length - 1]!),
  })
  for (const via of points.slice(1, -1)) query.append('via', point(via))
  query.set('return', 'polyline,summary')
  query.set('apiKey', apiKey)
  return `${HERE_API.ROUTES_URL}?${query.toString()}`
}

interface HereSection {
  polyline?: unknown
  summary?: { duration?: unknown; length?: unknown } | null
}

interface HereRoutesBody {
  routes?: Array<{ sections?: HereSection[] | null }> | null
}

const round5 = (value: number) => Math.round(value * 1e5) / 1e5

type ParsedRoutes =
  | Extract<RoutingResult, { kind: 'ok' }>
  /** A readable body with no route in it. */
  | { kind: 'none' }

/** Maps a parsed HERE body onto legs, or `null` if it's unusable. */
export const parseRoutes = (
  body: unknown,
  legCount: number
): ParsedRoutes | null => {
  if (!body || typeof body !== 'object') return null
  const routes = (body as HereRoutesBody).routes
  if (routes != null && !Array.isArray(routes)) return null
  const route = routes?.[0]
  if (!route) return { kind: 'none' }
  const sections = route.sections
  if (!Array.isArray(sections) || sections.length !== legCount) return null

  const legs: RouteLeg[] = []
  for (const section of sections) {
    const distanceMeters = section.summary?.length
    const durationSeconds = section.summary?.duration
    const decoded =
      typeof section.polyline === 'string'
        ? decodeFlexiblePolyline(section.polyline)
        : null
    if (
      !decoded ||
      typeof distanceMeters !== 'number' ||
      typeof durationSeconds !== 'number' ||
      !Number.isFinite(distanceMeters) ||
      !Number.isFinite(durationSeconds) ||
      distanceMeters < 0 ||
      durationSeconds < 0
    )
      return null
    legs.push({
      distanceMeters: Math.round(distanceMeters),
      durationSeconds: Math.round(durationSeconds),
      coordinates: decoded.map(round5),
    })
  }
  return { kind: 'ok', legs }
}

export const fetchRoute = async (
  points: Coordinate[],
  apiKey: string,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<RoutingResult> => {
  let response: Response
  let body: unknown
  try {
    response = await fetchImpl(buildRoutesRequestUrl(points, apiKey), {
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await response.text()
    try {
      body = JSON.parse(text)
    } catch {
      // HERE sits behind Cloudflare; outages arrive as plain-text pages.
      return { kind: 'upstream_error', status: response.status }
    }
  } catch {
    return { kind: 'upstream_error', status: null }
  }

  const { status } = response
  // Bad key, quota, or HERE-side failure: nothing the user can fix.
  if (status === 401 || status === 403 || status === 429 || status >= 500)
    return { kind: 'upstream_error', status }
  const parsed = parseRoutes(body, points.length - 1)
  if (response.ok && parsed?.kind === 'ok') return parsed
  // A readable refusal: no route, or a 400 about the points themselves.
  if (response.ok ? parsed?.kind === 'none' : status === 400)
    return { kind: 'no_route', status }
  return { kind: 'upstream_error', status }
}
