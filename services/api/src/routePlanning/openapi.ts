import { z } from 'zod'
import { describeRoute } from 'hono-openapi'
import {
  apiErrorSchema,
  errorResponse,
  jsonBody,
  jsonResponse,
} from '../openapi/schemas'
import { ROUTE_PLANNING_LIMITS as LIMITS } from './config'
import {
  routeDirectionsRequestSchema,
  routeOptimizeBearerRequestSchema,
  routeOptimizeRequestSchema,
} from './contracts'

const errorSchema = apiErrorSchema
  .extend({
    retryAfterSeconds: z.number().int().positive().optional().meta({
      description: 'The same as `retryAfter`, kept for shipped builds.',
    }),
  })
  .meta({ id: 'RoutePlanningError' })

const error = (description: string, codes: string[]) =>
  errorResponse(description, codes, errorSchema)

export const routeOptimizeDocs = describeRoute({
  tags: ['Route planning'],
  summary: 'Order today’s stops',
  description: `The shortest driving order from \`start\` through every stop, with traffic at request time, from HERE Waypoints Sequence. The route ends at the last stop.

**Bearer** (\`Authorization: Bearer <accessToken>\`, from \`POST /accounts/v1/sessions\`): the token’s account must be a Supporter, from the RevenueCat customers it linked with \`POST /accounts/v1/revenuecat-customers\` (ADR 0029). A suspended account is refused. The body is \`{ start, stops }\`.

**Legacy** (no \`Authorization\` header; app versions before sessions): the body also carries \`accountId\`, the RevenueCat app user id, which RevenueCat must say is a Supporter. Served while the legacy switch (KV \`auth:legacy\`) is on; 426 \`upgrade_required\` once it’s off.

A failed Supporter check never reaches HERE. Limits: ${LIMITS.maxStops} stops per request; ${LIMITS.dailyLimit} optimizations per account in any rolling 24 hours and ${LIMITS.minuteLimit} per minute (every call that reaches HERE counts, \`no_route\` included); plus the per-IP limit. The kill switch (KV \`route-planning:enabled\` = \`"false"\`) answers 503 \`unavailable\`.

On a local development worker only, a \`dev\` session (bearer) or \`x-ww-dev-bypass\` (legacy) skips the Supporter check.`,
  security: [{ bearerAuth: [] }, {}],
  parameters: [
    {
      name: 'x-ww-dev-bypass',
      in: 'header',
      required: false,
      schema: { type: 'string' },
      description:
        'Legacy requests on a local development worker only: skips the Supporter check.',
    },
  ],
  requestBody: jsonBody(
    z.union([
      routeOptimizeBearerRequestSchema.meta({ title: 'Bearer' }),
      routeOptimizeRequestSchema.meta({ title: 'Legacy' }),
    ]),
    `Coordinates only (and, legacy, \`accountId\`); any other field is rejected. At most ${LIMITS.maxBodyBytes} bytes.`
  ),
  responses: {
    200: jsonResponse(
      'The visiting order.',
      z.object({
        order: z.array(z.number().int().min(0)).meta({
          description: 'Indices into the request’s `stops`, in visiting order.',
        }),
        distanceMeters: z.number().int().meta({
          description: 'Driving distance from the start through the last stop.',
        }),
        durationSeconds: z
          .number()
          .int()
          .meta({ description: 'Driving time for the same, with traffic.' }),
        remainingToday: z.number().int().meta({
          description: 'Optimizations left in the rolling 24 hours.',
        }),
      })
    ),
    400: error('Invalid JSON or request.', ['bad_request']),
    401: error(
      'Bearer: the access token is missing, expired, or invalid (`WWW-Authenticate: Bearer error="invalid_token"`; refresh once and retry).',
      ['unauthorized']
    ),
    403: error(
      'The account isn’t a Supporter (`supporter_required`), or it’s suspended (`suspended`, bearer).',
      ['supporter_required', 'suspended']
    ),
    413: error('Body too large.', ['payload_too_large']),
    422: error('No driving route connects these stops.', ['no_route']),
    426: error(
      'A legacy request after the legacy switch was turned off. Update the app; no `Retry-After`.',
      ['upgrade_required']
    ),
    429: error(
      'Per-account daily or per-minute limit, or the per-IP limit. `daily_limit` waits until the oldest optimization ages out.',
      ['daily_limit', 'rate_limited']
    ),
    500: error('Unexpected failure.', ['internal']),
    502: error('HERE was unavailable.', ['upstream_error']),
    503: error(
      'Turned off (`unavailable`), the Supporter check failed (`supporter_check_failed`: RevenueCat trouble; fails closed), or accounts are off on this worker (`disabled`, bearer).',
      ['unavailable', 'supporter_check_failed', 'disabled']
    ),
  },
})

export const routeDirectionsDocs = describeRoute({
  tags: ['Route planning'],
  summary: 'Drive a route’s legs',
  description: `The driving route through \`points\` in the order given (the start, each stop, and a finish elsewhere), from HERE Routing v8, with traffic at request time: one leg per consecutive pair, each with its distance, time, and road shape. The app draws the shapes on the map and times the day from the legs. iOS asks MapKit on the device instead; this serves Android.

**Bearer only** (\`Authorization: Bearer <accessToken>\`, from \`POST /accounts/v1/sessions\`), for any account: there is no Supporter check and no legacy form. A suspended account is refused.

Limits: ${LIMITS.maxDirectionsPoints} points per request; ${LIMITS.directionsDailyLimit} requests per account in any rolling 24 hours and ${LIMITS.directionsMinuteLimit} per minute (every call that reaches HERE counts, \`no_route\` included), kept apart from optimizations; plus the per-IP limit. The kill switch (KV \`route-planning:enabled\` = \`"false"\`) answers 503 \`unavailable\`.`,
  security: [{ bearerAuth: [] }],
  requestBody: jsonBody(
    routeDirectionsRequestSchema,
    `Coordinates only; any other field is rejected. At most ${LIMITS.maxBodyBytes} bytes.`
  ),
  responses: {
    200: jsonResponse(
      'The legs, in order.',
      z.object({
        legs: z.array(
          z.object({
            distanceMeters: z.number().int().meta({
              description: 'Driving distance for the leg.',
            }),
            durationSeconds: z.number().int().meta({
              description: 'Driving time for the leg, with traffic.',
            }),
            coordinates: z.array(z.number()).meta({
              description:
                'The road shape as flat `[lat, lng, lat, lng, …]`, 5 decimals.',
            }),
          })
        ),
        remainingToday: z.number().int().meta({
          description: 'Directions requests left in the rolling 24 hours.',
        }),
      })
    ),
    400: error('Invalid JSON or request.', ['bad_request']),
    401: error(
      'The access token is missing, expired, or invalid (`WWW-Authenticate: Bearer error="invalid_token"`; refresh once and retry).',
      ['unauthorized']
    ),
    403: error('The account is suspended.', ['suspended']),
    413: error('Body too large.', ['payload_too_large']),
    422: error('No driving route connects these points.', ['no_route']),
    429: error(
      'Per-account daily or per-minute limit, or the per-IP limit.',
      ['daily_limit', 'rate_limited']
    ),
    500: error('Unexpected failure.', ['internal']),
    502: error('HERE was unavailable.', ['upstream_error']),
    503: error(
      'Turned off (`unavailable`), or accounts are off on this worker (`disabled`).',
      ['unavailable', 'disabled']
    ),
  },
})
