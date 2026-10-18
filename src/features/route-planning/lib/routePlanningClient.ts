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

/**
 * Client for ww-api `POST /route-planning/optimize`, as this device's attested
 * account session (ADR 0027): the server checks the account's Supporter status
 * (ADR 0029), so this links the RevenueCat customer first when this launch
 * hasn't. Sends bare coordinates only — never names, addresses, notes, or
 * topics.
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
  /** The account is suspended. */
  | 'suspended'
  /** This device can never be verified, so it has no account session. */
  | 'device_unverified'
  /** Verifying this device has to wait (Apple or Google unreachable). */
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
      /** From the server's Retry-After, when it sent one. */
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

/** Why the session couldn't be used, in the screen's terms. */
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
    // `upgrade` already showed Update Required.
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
    // Not retried otherwise: each call counts toward the daily route limit. A
    // `supporter_required` refusal never counts, and can mean the server lost
    // this device's RevenueCat link: link again, and retry once if that made
    // the account a Supporter.
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
    // An HttpError too, so first.
    if (error instanceof AccountSessionError) return sessionFailure(error)
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
