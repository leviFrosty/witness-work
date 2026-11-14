import { z } from 'zod'
import { ROUTE_PLANNING_LIMITS } from './config'

const coordinate = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .strict()

export type Coordinate = z.infer<typeof coordinate>

const routeFields = {
  start: coordinate,
  stops: z.array(coordinate).min(1).max(ROUTE_PLANNING_LIMITS.maxStops),
}

/**
 * `POST /route-planning/optimize` with a bearer token (witness-work ADR
 * 0029): the token's account is the caller. Coordinates only: `strict()`
 * rejects any other field, so names, notes, or topics can never ride along.
 */
export const routeOptimizeBearerRequestSchema = z.object(routeFields).strict()

/**
 * The legacy form (no `Authorization` header), for app versions before
 * sessions, while the legacy switch is on.
 */
export const routeOptimizeRequestSchema = routeOptimizeBearerRequestSchema
  .extend({
    /** The app's account id (RevenueCat app user id), for the Supporter check. */
    accountId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  })
  .strict()

export type RouteOptimizeRequest = z.infer<typeof routeOptimizeRequestSchema>

export interface RouteOptimizeResponse {
  /** Indices into the request's `stops`, in visiting order. */
  order: number[]
  /** Driving distance from the start through the last stop, in metres. */
  distanceMeters: number
  /** Driving time for the same, in seconds, with traffic at request time. */
  durationSeconds: number
  /** Optimizations this account has left in the rolling 24 hours. */
  remainingToday: number
}

/**
 * `POST /route-planning/directions`, bearer only: the driving route through
 * `points` in the order given (start, stops, finish). Coordinates only.
 */
export const routeDirectionsRequestSchema = z
  .object({
    points: z
      .array(coordinate)
      .min(2)
      .max(ROUTE_PLANNING_LIMITS.maxDirectionsPoints),
  })
  .strict()

export interface RouteDirectionsLeg {
  /** Driving distance for the leg, in metres. */
  distanceMeters: number
  /** Driving time for the leg, in seconds, with traffic at request time. */
  durationSeconds: number
  /** The road shape: flat `[lat, lng, lat, lng, …]`, 5 decimals. */
  coordinates: number[]
}

export interface RouteDirectionsResponse {
  /** One per consecutive pair of `points`. */
  legs: RouteDirectionsLeg[]
  /** Directions this account has left in the rolling 24 hours. */
  remainingToday: number
}

export type RouteOptimizeErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'suspended'
  | 'upgrade_required'
  | 'disabled'
  | 'internal'
  | 'payload_too_large'
  | 'unavailable'
  | 'supporter_required'
  | 'supporter_check_failed'
  | 'daily_limit'
  | 'rate_limited'
  | 'no_route'
  | 'upstream_error'

/** The shared error envelope (src/errors.ts); `error` is a human message. */
export interface RouteOptimizeErrorResponse {
  ok: false
  error: string
  code: RouteOptimizeErrorCode
  /** Set on every 429 and 503; mirrors `Retry-After`. */
  retryAfter?: number
  /** The same as `retryAfter`, kept for shipped builds. */
  retryAfterSeconds?: number
}
