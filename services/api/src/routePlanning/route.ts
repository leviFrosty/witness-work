import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AppContext, AppEnv, Environment } from '../types'
import { HTTP_STATUS } from '../config'
import { Sentry } from '../sentry'
import { retryAfterHeaders } from '../errors'
import {
  countsWebSandboxSubscriptions,
  isSupporter,
  RevenueCatError,
} from '../revenuecat'
import { authenticateAccount, hasAuthorization } from '../accounts/auth'
import { isLegacyAuthEnabled } from '../accounts/legacySwitch'
import { BEARER_CHALLENGE } from '../buddies/errorResponse'
import { isAccountSupporter } from '../accounts/supporter'
import {
  ROUTE_PLANNING_LIMITS as LIMITS,
  isRouteDevBypass,
  isRoutePlanningEnabled,
} from './config'
import {
  type Coordinate,
  routeDirectionsRequestSchema,
  type RouteDirectionsResponse,
  routeOptimizeBearerRequestSchema,
  routeOptimizeRequestSchema,
  type RouteOptimizeErrorCode,
  type RouteOptimizeErrorResponse,
  type RouteOptimizeResponse,
} from './contracts'
import { fetchWaypointsSequence } from './here'
import { fetchRoute } from './hereRouting'
import { routeDirectionsDocs, routeOptimizeDocs } from './openapi'

/**
 * `POST /route-planning/optimize` — Supporter-only shortest driving order for
 * today's stops. Fails closed: a non-Supporter, an unknown account, or a failed
 * RevenueCat check never reaches HERE.
 *
 * A bearer request (witness-work ADR 0029) is the token's account: Supporter
 * status is the account's (`isAccountSupporter`), limits are the account's,
 * and a suspended account is refused. Without an `Authorization` header it's
 * the legacy form, whose body names the RevenueCat app user id, served while
 * the legacy switch is on and 426 `upgrade_required` once it's off.
 *
 * Privacy: the body holds bare coordinates (and, legacy, an app user id).
 * Nothing here logs or reports them, the token, or the account id; HERE
 * receives only the coordinates.
 */

/**
 * `POST /route-planning/directions` — the driving route through the points in
 * the order given, so the app can draw roads and time each leg. Bearer only,
 * for every account (not only Supporters): the per-account directions quota
 * bounds spend. iOS asks MapKit on the device instead; this serves Android.
 */

/**
 * Captured at module evaluation, before Sentry's fetch integration wraps
 * `globalThis.fetch`, so the account id in RevenueCat's URL and the HERE key
 * stay out of trace spans.
 */
const uninstrumentedFetch: typeof fetch = globalThis.fetch.bind(globalThis)

export interface RoutePlanningDependencies {
  fetch: typeof fetch
  checkSupporter: typeof isSupporter
  checkAccountSupporter: typeof isAccountSupporter
  now: () => number
}

const defaultDependencies: RoutePlanningDependencies = {
  fetch: uninstrumentedFetch,
  checkSupporter: isSupporter,
  checkAccountSupporter: isAccountSupporter,
  now: () => Date.now(),
}

/** The kill switch is read through a 60-second edge cache. */
const UNAVAILABLE_RETRY_AFTER_SECONDS = 60
/** RevenueCat trouble is usually brief. */
const SUPPORTER_CHECK_RETRY_AFTER_SECONDS = 30

const fail = (
  ctx: AppContext,
  status: ContentfulStatusCode,
  code: RouteOptimizeErrorCode,
  error: string,
  retryAfterSeconds?: number
) => {
  const body: RouteOptimizeErrorResponse = { ok: false, error, code }
  if (retryAfterSeconds != null) {
    body.retryAfter = retryAfterSeconds
    body.retryAfterSeconds = retryAfterSeconds
  }
  return ctx.json(body, status, retryAfterHeaders(retryAfterSeconds))
}

/**
 * One quota object per caller: `account:<accountId>` for a bearer request
 * (so no app user id can share it), the app user id for a legacy one.
 */
const quota = (env: Environment, name: string) =>
  env.ROUTE_PLANNING_QUOTA.get(env.ROUTE_PLANNING_QUOTA.idFromName(name))

const AUTH_REFUSALS = {
  unauthorized: [HTTP_STATUS.UNAUTHORIZED, 'Sign in again'],
  suspended: [HTTP_STATUS.FORBIDDEN, 'This account is suspended'],
  disabled: [HTTP_STATUS.SERVICE_UNAVAILABLE, 'Accounts are unavailable'],
  internal: [HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Something went wrong'],
} as const

/** The JSON body within the size limit, or the refusal to send. */
const readJson = async (
  ctx: AppContext
): Promise<{ ok: true; json: unknown } | { ok: false; response: Response }> => {
  const tooLarge = () => ({
    ok: false as const,
    response: fail(
      ctx,
      HTTP_STATUS.PAYLOAD_TOO_LARGE,
      'payload_too_large',
      'Request too large'
    ),
  })
  const declaredLength = Number(ctx.req.header('content-length') ?? 0)
  if (declaredLength > LIMITS.maxBodyBytes) return tooLarge()
  const text = await ctx.req.text()
  if (text.length > LIMITS.maxBodyBytes) return tooLarge()
  try {
    return { ok: true, json: JSON.parse(text) }
  } catch {
    return {
      ok: false,
      response: fail(ctx, HTTP_STATUS.BAD_REQUEST, 'bad_request', 'Invalid JSON'),
    }
  }
}

/** Who's asking: the session's account, or a legacy request's app user id. */
type Caller =
  | { kind: 'bearer'; accountId: string; devSession: boolean }
  | { kind: 'legacy' }

export const createRoutePlanningRoutes = (
  overrides: Partial<RoutePlanningDependencies> = {}
) => {
  const deps = { ...defaultDependencies, ...overrides }
  const routes = new Hono<AppEnv>()

  routes.post('/optimize', routeOptimizeDocs, async (ctx) => {
    if (!(await isRoutePlanningEnabled(ctx.env))) {
      return fail(
        ctx,
        HTTP_STATUS.SERVICE_UNAVAILABLE,
        'unavailable',
        'Route planning is unavailable',
        UNAVAILABLE_RETRY_AFTER_SECONDS
      )
    }

    let caller: Caller
    if (hasAuthorization(ctx)) {
      const auth = await authenticateAccount(ctx, { requireActive: true })
      if (!auth.ok) {
        const [status, message] = AUTH_REFUSALS[auth.error]
        const response = fail(
          ctx,
          status,
          auth.error,
          message,
          auth.error === 'disabled'
            ? UNAVAILABLE_RETRY_AFTER_SECONDS
            : undefined
        )
        if (auth.error === 'unauthorized')
          response.headers.set('WWW-Authenticate', BEARER_CHALLENGE)
        return response
      }
      caller = {
        kind: 'bearer',
        accountId: auth.account.accountId,
        // A `dev` session (local development worker, bypass token set) skips
        // the Supporter check, as the legacy bypass header does; Beta and
        // production have none.
        devSession:
          auth.account.platform === 'dev' &&
          ctx.env.APP_ATTEST_ENVIRONMENT === 'development' &&
          !!ctx.env.NOTES_IMPORT_DEV_BYPASS_TOKEN?.trim(),
      }
    } else {
      if (!(await isLegacyAuthEnabled(ctx.env))) {
        return fail(
          ctx,
          426 as ContentfulStatusCode,
          'upgrade_required',
          'Update WitnessWork to plan routes'
        )
      }
      caller = { kind: 'legacy' }
    }

    const body = await readJson(ctx)
    if (!body.ok) return body.response
    const { json } = body
    let request: { start: Coordinate; stops: Coordinate[]; quotaName: string }
    if (caller.kind === 'bearer') {
      const parsed = routeOptimizeBearerRequestSchema.safeParse(json)
      if (!parsed.success) {
        return fail(
          ctx,
          HTTP_STATUS.BAD_REQUEST,
          'bad_request',
          'Invalid request'
        )
      }
      request = { ...parsed.data, quotaName: `account:${caller.accountId}` }
    } else {
      const parsed = routeOptimizeRequestSchema.safeParse(json)
      if (!parsed.success) {
        return fail(
          ctx,
          HTTP_STATUS.BAD_REQUEST,
          'bad_request',
          'Invalid request'
        )
      }
      const { accountId, ...route } = parsed.data
      request = { ...route, quotaName: accountId }
    }
    const { start, stops, quotaName } = request

    const bypass =
      caller.kind === 'bearer'
        ? caller.devSession
        : isRouteDevBypass(ctx.env, ctx.req.header('x-ww-dev-bypass'))
    if (!bypass) {
      let supporter: boolean
      try {
        supporter =
          caller.kind === 'bearer'
            ? await deps.checkAccountSupporter(ctx.env, caller.accountId, {
                fetch: deps.fetch,
                now: deps.now,
              })
            : await deps.checkSupporter({
                apiKey: ctx.env.REVENUECAT_API_KEY,
                appUserId: quotaName,
                fetchImpl: deps.fetch,
                countWebSandbox: countsWebSandboxSubscriptions(ctx.env),
              })
      } catch (error) {
        if (!(error instanceof RevenueCatError)) Sentry.captureException(error)
        return fail(
          ctx,
          HTTP_STATUS.SERVICE_UNAVAILABLE,
          'supporter_check_failed',
          'Could not confirm Supporter status',
          SUPPORTER_CHECK_RETRY_AFTER_SECONDS
        )
      }
      if (!supporter) {
        return fail(
          ctx,
          HTTP_STATUS.FORBIDDEN,
          'supporter_required',
          'Route planning is a Supporter feature'
        )
      }
    }

    const decision = await quota(ctx.env, quotaName).consume({
      nowMs: deps.now(),
      dailyLimit: LIMITS.dailyLimit,
      minuteLimit: LIMITS.minuteLimit,
    })
    if (!decision.allowed) {
      return fail(
        ctx,
        HTTP_STATUS.TOO_MANY_REQUESTS,
        decision.reason === 'daily' ? 'daily_limit' : 'rate_limited',
        decision.reason === 'daily'
          ? 'Daily route limit reached'
          : 'Too many route requests',
        decision.retryAfterSeconds
      )
    }

    const result = await fetchWaypointsSequence(
      { start, stops },
      ctx.env.HERE_API_KEY,
      deps.fetch,
      LIMITS.hereTimeoutMs
    )
    if (result.kind === 'no_route') {
      return fail(
        ctx,
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        'no_route',
        'No driving route connects these stops'
      )
    }
    if (result.kind === 'upstream_error') {
      Sentry.captureMessage('HERE Waypoints Sequence request failed', {
        level: 'warning',
        fingerprint: ['here-waypoints-sequence-failed'],
        tags: { 'here_api.status': result.status ?? 'network' },
      })
      return fail(
        ctx,
        HTTP_STATUS.BAD_GATEWAY,
        'upstream_error',
        'Routing service unavailable'
      )
    }

    const response: RouteOptimizeResponse = {
      order: result.order,
      distanceMeters: Math.round(result.distanceMeters),
      durationSeconds: Math.round(result.durationSeconds),
      remainingToday: decision.remainingToday,
    }
    return ctx.json(response)
  })

  routes.post('/directions', routeDirectionsDocs, async (ctx) => {
    if (!(await isRoutePlanningEnabled(ctx.env))) {
      return fail(
        ctx,
        HTTP_STATUS.SERVICE_UNAVAILABLE,
        'unavailable',
        'Route planning is unavailable',
        UNAVAILABLE_RETRY_AFTER_SECONDS
      )
    }

    // No legacy form: no app version before sessions asks for directions.
    const auth = hasAuthorization(ctx)
      ? await authenticateAccount(ctx, { requireActive: true })
      : ({ ok: false, error: 'unauthorized' } as const)
    if (!auth.ok) {
      const [status, message] = AUTH_REFUSALS[auth.error]
      const response = fail(
        ctx,
        status,
        auth.error,
        message,
        auth.error === 'disabled' ? UNAVAILABLE_RETRY_AFTER_SECONDS : undefined
      )
      if (auth.error === 'unauthorized')
        response.headers.set('WWW-Authenticate', BEARER_CHALLENGE)
      return response
    }

    const body = await readJson(ctx)
    if (!body.ok) return body.response
    const parsed = routeDirectionsRequestSchema.safeParse(body.json)
    if (!parsed.success) {
      return fail(ctx, HTTP_STATUS.BAD_REQUEST, 'bad_request', 'Invalid request')
    }

    // Its own quota object, so drawing routes never spends Shortest Order's.
    const decision = await quota(
      ctx.env,
      `directions:account:${auth.account.accountId}`
    ).consume({
      nowMs: deps.now(),
      dailyLimit: LIMITS.directionsDailyLimit,
      minuteLimit: LIMITS.directionsMinuteLimit,
    })
    if (!decision.allowed) {
      return fail(
        ctx,
        HTTP_STATUS.TOO_MANY_REQUESTS,
        decision.reason === 'daily' ? 'daily_limit' : 'rate_limited',
        decision.reason === 'daily'
          ? 'Daily directions limit reached'
          : 'Too many directions requests',
        decision.retryAfterSeconds
      )
    }

    const result = await fetchRoute(
      parsed.data.points,
      ctx.env.HERE_API_KEY,
      deps.fetch,
      LIMITS.hereTimeoutMs
    )
    if (result.kind === 'no_route') {
      return fail(
        ctx,
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        'no_route',
        'No driving route connects these points'
      )
    }
    if (result.kind === 'upstream_error') {
      Sentry.captureMessage('HERE Routing request failed', {
        level: 'warning',
        fingerprint: ['here-routing-failed'],
        tags: { 'here_api.status': result.status ?? 'network' },
      })
      return fail(
        ctx,
        HTTP_STATUS.BAD_GATEWAY,
        'upstream_error',
        'Routing service unavailable'
      )
    }

    const response: RouteDirectionsResponse = {
      legs: result.legs,
      remainingToday: decision.remainingToday,
    }
    return ctx.json(response)
  })

  return routes
}
