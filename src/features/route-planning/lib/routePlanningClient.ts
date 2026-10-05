import axios, { isAxiosError } from 'axios'
import apis from '@/constants/apis'
import type { Coordinate } from '@/types/contact'

/**
 * Client for ww-api `POST /route-planning/optimize`. Sends the account id (for
 * the server's Supporter check) and bare coordinates — never names, addresses,
 * notes, or topics.
 */

export type RouteOptimization = {
  /** Indices into the stops sent, in visiting order. */
  order: number[]
  distanceMeters: number
  durationSeconds: number
}

/** Server codes the screen explains, plus client-side failures. */
export type RoutePlanningError =
  | 'supporter_required'
  | 'supporter_check_failed'
  | 'daily_limit'
  | 'rate_limited'
  | 'no_route'
  | 'unavailable'
  | 'offline'
  | 'failed'

export type OptimizeRouteResult =
  | ({ ok: true } & RouteOptimization)
  | { ok: false; error: RoutePlanningError }

const SERVER_ERRORS = new Set<RoutePlanningError>([
  'supporter_required',
  'supporter_check_failed',
  'daily_limit',
  'rate_limited',
  'no_route',
  'unavailable',
])

// Dev builds talk to the dev worker, which accepts this in place of a real
// Supporter entitlement. Production builds never send it.
const DEV_BYPASS_TOKEN = process.env.EXPO_PUBLIC_API_DEV_BYPASS || ''

const point = ({ latitude, longitude }: Coordinate) => ({
  lat: latitude,
  lng: longitude,
})

const isOrder = (value: unknown, count: number): value is number[] =>
  Array.isArray(value) &&
  value.length === count &&
  new Set(value).size === count &&
  value.every((index) => Number.isInteger(index) && index >= 0 && index < count)

export const optimizeRoute = async ({
  accountId,
  start,
  stops,
}: {
  accountId: string
  start: Coordinate
  stops: Coordinate[]
}): Promise<OptimizeRouteResult> => {
  try {
    const { data } = await axios.post<Record<string, unknown>>(
      apis.routePlanningOptimize,
      { accountId, start: point(start), stops: stops.map(point) },
      {
        timeout: 30_000,
        headers:
          typeof __DEV__ !== 'undefined' && __DEV__ && DEV_BYPASS_TOKEN
            ? { 'x-ww-dev-bypass': DEV_BYPASS_TOKEN }
            : undefined,
      }
    )
    const distanceMeters = Number(data?.distanceMeters)
    const durationSeconds = Number(data?.durationSeconds)
    if (
      !isOrder(data?.order, stops.length) ||
      !Number.isFinite(distanceMeters) ||
      !Number.isFinite(durationSeconds)
    ) {
      return { ok: false, error: 'failed' }
    }
    return { ok: true, order: data.order, distanceMeters, durationSeconds }
  } catch (error) {
    if (!isAxiosError(error)) return { ok: false, error: 'failed' }
    if (!error.response) return { ok: false, error: 'offline' }
    const code = (error.response.data as { code?: unknown } | undefined)?.code
    return {
      ok: false,
      error: SERVER_ERRORS.has(code as RoutePlanningError)
        ? (code as RoutePlanningError)
        : 'failed',
    }
  }
}
