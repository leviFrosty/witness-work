import apis from '@/constants/apis'
import { devBypassHeaders } from '@/lib/http/devBypass'
import { errorBodyCode } from '@/lib/http/errorBody'
import { classifyNetworkError } from '@/lib/http/networkError'
import { HttpError, request } from '@/lib/http/request'
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
  | 'timeout'
  | 'cancelled'
  | 'failed'

export type OptimizeRouteResult =
  | ({ ok: true } & RouteOptimization)
  | {
      ok: false
      error: RoutePlanningError
      /** From the server's Retry-After, when it sent one. */
      retryAfterMs?: number
    }

const SERVER_ERRORS = new Set<RoutePlanningError>([
  'supporter_required',
  'supporter_check_failed',
  'daily_limit',
  'rate_limited',
  'no_route',
  'unavailable',
])

/** The server solves up to ten stops in a few seconds. */
const OPTIMIZE_TIMEOUT_MS = 30_000

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
  signal,
}: {
  accountId: string
  start: Coordinate
  stops: Coordinate[]
  signal?: AbortSignal
}): Promise<OptimizeRouteResult> => {
  try {
    // Not retried: each call counts toward the daily route limit.
    const { data } = await request<Record<string, unknown> | null>({
      url: apis.routePlanningOptimize,
      method: 'POST',
      json: { accountId, start: point(start), stops: stops.map(point) },
      headers: devBypassHeaders(),
      timeoutMs: OPTIMIZE_TIMEOUT_MS,
      signal,
    })
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
    // `code` is the stable code; `error` is a message older builds show.
    const code = errorBodyCode(error)
    if (SERVER_ERRORS.has(code as RoutePlanningError)) {
      return {
        ok: false,
        error: code as RoutePlanningError,
        ...(error instanceof HttpError && error.retryAfterMs !== null
          ? { retryAfterMs: error.retryAfterMs }
          : {}),
      }
    }
    switch (classifyNetworkError(error)) {
      case 'offline':
        return { ok: false, error: 'offline' }
      case 'timeout':
        return { ok: false, error: 'timeout' }
      case 'cancelled':
        return { ok: false, error: 'cancelled' }
      default:
        return { ok: false, error: 'failed' }
    }
  }
}
