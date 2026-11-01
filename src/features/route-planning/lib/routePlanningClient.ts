import apis from '@/constants/apis'
import { errorBodyCode } from '@/lib/http/errorBody'
import { classifyNetworkError } from '@/lib/http/networkError'
import { HttpError } from '@/lib/http/request'
import { accountSessions } from '@/lib/serverAccount'
import {
  linkBeforePaidCall,
  relinkAfterSupporterRefusal,
} from '@/lib/serverAccount/revenueCatLinkRuntime'
import { AccountSessionError } from '@/lib/serverAccount/session'
import type { Coordinate } from '@/types/contact'

export type RouteOptimization = {
  order: number[]
  distanceMeters: number
  durationSeconds: number
}

export type RoutePlanningError =
  | 'supporter_required'
  | 'supporter_check_failed'
  | 'suspended'
  | 'device_unverified'
  | 'verify_later'
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

      retryAfterMs?: number
    }

const SERVER_ERRORS = new Set<RoutePlanningError>([
  'supporter_required',
  'supporter_check_failed',
  'suspended',
  'daily_limit',
  'rate_limited',
  'no_route',
  'unavailable',
])

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

const sessionFailure = (
  error: AccountSessionError
): OptimizeRouteResult & { ok: false } => {
  switch (error.failure) {
    case 'offline':
      return { ok: false, error: 'offline' }
    case 'cancelled':
      return { ok: false, error: 'cancelled' }
    case 'unavailable':
      return { ok: false, error: 'unavailable' }
    case 'rateLimited':
      return {
        ok: false,
        error: 'rate_limited',
        ...(error.retryAfterMs !== null && {
          retryAfterMs: error.retryAfterMs,
        }),
      }
    case 'attestation':
      return error.attestation === 'device'
        ? { ok: false, error: 'device_unverified' }
        : error.attestation === 'temporary'
          ? { ok: false, error: 'verify_later' }
          : { ok: false, error: 'failed' }

    default:
      return { ok: false, error: 'failed' }
  }
}

export const optimizeRoute = async ({
  start,
  stops,
  signal,
}: {
  start: Coordinate
  stops: Coordinate[]
  signal?: AbortSignal
}): Promise<OptimizeRouteResult> => {
  try {
    await linkBeforePaidCall()
    if (signal?.aborted) return { ok: false, error: 'cancelled' }
    const send = () =>
      accountSessions.request<Record<string, unknown> | null>({
        url: apis.routePlanningOptimize,
        method: 'POST',
        json: { start: point(start), stops: stops.map(point) },
        timeoutMs: OPTIMIZE_TIMEOUT_MS,
        signal,
      })

    const { data } = await send().catch(async (error: unknown) => {
      if (
        errorBodyCode(error) !== 'supporter_required' ||
        !(await relinkAfterSupporterRefusal()) ||
        signal?.aborted
      )
        throw error
      return send()
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
    if (error instanceof AccountSessionError) return sessionFailure(error)

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
