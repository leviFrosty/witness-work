import { HERE_API } from '../config'
import type { Coordinate } from './contracts'

/**
 * HERE Waypoints Sequence v8 (`findsequence2`): the shortest driving order
 * through up to 100 stops from a fixed start, for one transaction. No `end` is
 * sent, so the route finishes at whichever stop makes the trip shortest.
 *
 * The request is a form POST so coordinates travel in the body, never in a URL
 * that tracing or logs could record. Waypoint ids are opaque (`start`, `s0`…).
 */

export interface WaypointsSequenceInput {
  start: Coordinate
  stops: Coordinate[]
}

export type WaypointsSequenceResult =
  | {
      kind: 'ok'
      order: number[]
      distanceMeters: number
      durationSeconds: number
    }
  /** HERE answered but found no sequence (e.g. a stop with no road access). */
  | { kind: 'no_route'; status: number }
  /** HERE failed, timed out, or answered with something we can't read. */
  | { kind: 'upstream_error'; status: number | null }

const point = ({ lat, lng }: Coordinate) =>
  `${Number(lat.toFixed(6))},${Number(lng.toFixed(6))}`

export const buildWaypointsSequenceRequest = (
  input: WaypointsSequenceInput,
  apiKey: string
): { url: string; init: RequestInit } => {
  const query = new URLSearchParams({
    mode: 'fastest;car;traffic:enabled',
    departure: 'now',
    improveFor: 'time',
    apiKey,
  })
  const body = new URLSearchParams({ start: `start;${point(input.start)}` })
  input.stops.forEach((stop, index) => {
    body.set(`destination${index}`, `s${index};${point(stop)}`)
  })
  return {
    url: `${HERE_API.WAYPOINTS_SEQUENCE_URL}?${query.toString()}`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
  }
}

interface HereWaypoint {
  id?: unknown
  sequence?: unknown
}

interface HereSequenceBody {
  results?: Array<{
    waypoints?: HereWaypoint[]
    distance?: unknown
    time?: unknown
  }> | null
}

const STOP_ID = /^s(\d+)$/

type ParsedSequence =
  | Extract<WaypointsSequenceResult, { kind: 'ok' }>
  /** A readable body with no sequence in it. */
  | { kind: 'none' }

/** Maps a parsed HERE body onto stop indices, or `null` if it's unusable. */
export const parseWaypointsSequence = (
  body: unknown,
  stopCount: number
): ParsedSequence | null => {
  if (!body || typeof body !== 'object') return null
  const results = (body as HereSequenceBody).results
  if (results != null && !Array.isArray(results)) return null
  const result = results?.[0]
  if (!result) return { kind: 'none' }
  if (!Array.isArray(result.waypoints)) return null

  const visits = result.waypoints
    .map((waypoint) => ({
      match:
        typeof waypoint.id === 'string' ? STOP_ID.exec(waypoint.id) : null,
      sequence: Number(waypoint.sequence),
    }))
    .filter((visit) => visit.match)
  if (visits.some((visit) => !Number.isFinite(visit.sequence))) return null
  const order = visits
    .sort((a, b) => a.sequence - b.sequence)
    .map((visit) => Number(visit.match![1]))

  const isPermutation =
    order.length === stopCount &&
    new Set(order).size === stopCount &&
    order.every((index) => index >= 0 && index < stopCount)
  const distanceMeters = Number(result.distance)
  const durationSeconds = Number(result.time)
  if (
    !isPermutation ||
    !Number.isFinite(distanceMeters) ||
    !Number.isFinite(durationSeconds) ||
    distanceMeters < 0 ||
    durationSeconds < 0
  )
    return null
  return { kind: 'ok', order, distanceMeters, durationSeconds }
}

export const fetchWaypointsSequence = async (
  input: WaypointsSequenceInput,
  apiKey: string,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<WaypointsSequenceResult> => {
  const { url, init } = buildWaypointsSequenceRequest(input, apiKey)
  let response: Response
  let body: unknown
  try {
    response = await fetchImpl(url, {
      ...init,
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
  const parsed = parseWaypointsSequence(body, input.stops.length)
  if (response.ok && parsed?.kind === 'ok') return parsed
  // A readable refusal (no sequence, or a 4xx about the points themselves).
  if (parsed?.kind === 'none' || !response.ok) return { kind: 'no_route', status }
  return { kind: 'upstream_error', status }
}
