import apis from '@/constants/apis'
import { errorBodyCode } from '@/lib/http/errorBody'
import { HttpError } from '@/lib/http/request'
import { accountSessions } from '@/lib/serverAccount'
import { AccountSessionError } from '@/lib/serverAccount/session'
import type { Coordinate } from '@/types/contact'
import type { RouteDirectionsLeg } from '../../../../modules/route-directions'

/**
 * Client for ww-api `POST /route-planning/directions` (HERE Routing), as this
 * device's attested account session (ADR 0027), for Android, where there's no
 * MapKit. Any account may ask; no Supporter link is needed. Sends bare
 * coordinates only.
 */

export type RouteDirectionsResult =
  | { ok: true; legs: RouteDirectionsLeg[] }
  | {
      ok: false
      /** HERE found no road route through the points. */
      noRoute?: boolean
      /** How long to wait before asking again. */
      retryAfterMs?: number
    }

/** HERE routes twelve points in about a second. */
const DIRECTIONS_TIMEOUT_MS = 15_000
/** After a failure with no `Retry-After`. */
const RETRY_AFTER_MS = 60_000
/** A device that can't hold a session won't soon. */
const NO_SESSION_RETRY_AFTER_MS = 30 * 60_000

const point = ({ latitude, longitude }: Coordinate) => ({
  lat: latitude,
  lng: longitude,
})

const isLeg = (value: unknown): value is RouteDirectionsLeg => {
  if (!value || typeof value !== 'object') return false
  const leg = value as Record<string, unknown>
  return (
    Number.isFinite(leg.distanceMeters) &&
    Number.isFinite(leg.durationSeconds) &&
    Array.isArray(leg.coordinates) &&
    leg.coordinates.length >= 4 &&
    leg.coordinates.length % 2 === 0 &&
    leg.coordinates.every(Number.isFinite)
  )
}

export const fetchRouteDirections = async ({
  points,
  signal,
}: {
  points: Coordinate[]
  signal?: AbortSignal
}): Promise<RouteDirectionsResult> => {
  try {
    const { data } = await accountSessions.request<Record<
      string,
      unknown
    > | null>({
      url: apis.routePlanningDirections,
      method: 'POST',
      json: { points: points.map(point) },
      timeoutMs: DIRECTIONS_TIMEOUT_MS,
      signal,
    })
    const legs = data?.legs
    if (
      !Array.isArray(legs) ||
      legs.length !== points.length - 1 ||
      !legs.every(isLeg)
    ) {
      return { ok: false, retryAfterMs: RETRY_AFTER_MS }
    }
    return { ok: true, legs }
  } catch (error) {
    // An HttpError too, so first.
    if (error instanceof AccountSessionError) {
      return {
        ok: false,
        retryAfterMs:
          error.failure === 'rateLimited' && error.retryAfterMs !== null
            ? error.retryAfterMs
            : error.failure === 'attestation' || error.failure === 'upgrade'
              ? NO_SESSION_RETRY_AFTER_MS
              : RETRY_AFTER_MS,
      }
    }
    if (errorBodyCode(error) === 'no_route') return { ok: false, noRoute: true }
    return {
      ok: false,
      retryAfterMs:
        error instanceof HttpError && error.retryAfterMs !== null
          ? error.retryAfterMs
          : RETRY_AFTER_MS,
    }
  }
}
