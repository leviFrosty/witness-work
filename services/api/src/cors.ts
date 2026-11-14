import type { MiddlewareHandler } from 'hono'
import type { AppEnv, Environment } from './types'

/**
 * CORS for the web app (witness-work ADR 0038 §10). Browsers call the API
 * cross-origin with `Authorization: Bearer`; native apps send no `Origin` and
 * see no change.
 *
 * - Origins: an exact allow-list, `WEB_APP_ORIGINS` (comma-separated, per
 *   environment). No wildcards, suffixes, or case folding: `Origin` must
 *   equal an entry byte for byte.
 * - Every answer to an allowed origin carries `Access-Control-Allow-Origin`
 *   (that origin), `Vary: Origin`, and `Access-Control-Expose-Headers`,
 *   errors included. Never `Access-Control-Allow-Credentials`: there are no
 *   cookies.
 * - Preflights are answered here, first, before any rate limiter, auth, KV
 *   read, or Durable Object, so they never count against a limit: 204 for an
 *   allowed origin, method, and headers, else 403 without CORS headers.
 * - 101 WebSocket answers are left alone (sockets check `Origin` themselves;
 *   src/liveSubprotocol.ts).
 */

/** Methods the API serves. */
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] as const

/** Request headers a browser may send, beyond the `x-ww-*` and `x-buddies-*` families. */
const ALLOWED_HEADERS: ReadonlySet<string> = new Set([
  'authorization',
  'content-type',
  'if-match',
  'if-none-match',
  // Sentry's browser SDK traces fetches.
  'sentry-trace',
  'baggage',
])
const ALLOWED_HEADER_PREFIXES = ['x-ww-', 'x-buddies-'] as const

/**
 * Never from a browser: the admin token is for maintainers' tools only, and
 * the dev bypass only where the worker accepts it (a local development
 * worker, which sets `NOTES_IMPORT_DEV_BYPASS_TOKEN`).
 */
const ADMIN_HEADER = 'x-ww-admin-token'
const DEV_BYPASS_HEADER = 'x-ww-dev-bypass'

/**
 * Response headers the app reads: `ETag` (sync, backup), `Retry-After`
 * (every 429 and 503), `Date` (clock calibration), `WWW-Authenticate` (the
 * 401 challenge), and `x-ww-updated-at` (`sync/get`).
 */
export const CORS_EXPOSED_HEADERS =
  'ETag, Retry-After, Date, WWW-Authenticate, x-ww-updated-at'

/** Seconds a browser may cache a preflight: Chromium's cap. */
const PREFLIGHT_MAX_AGE_SECONDS = 7_200

let parsedFrom: string | undefined
let parsed: ReadonlySet<string> = new Set()

/** `WEB_APP_ORIGINS` as a set; empty when unset. */
const webAppOrigins = (env: Pick<Environment, 'WEB_APP_ORIGINS'>) => {
  const raw = env.WEB_APP_ORIGINS ?? ''
  if (raw !== parsedFrom) {
    parsedFrom = raw
    parsed = new Set(
      raw
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    )
  }
  return parsed
}

/** The request's `Origin` when it's one of the web app's, else null. */
export const allowedWebOrigin = (
  env: Pick<Environment, 'WEB_APP_ORIGINS'>,
  origin: string | null | undefined
): string | null =>
  origin != null && webAppOrigins(env).has(origin) ? origin : null

/** An RFC 9110 field name. */
const FIELD_NAME = /^[!#$%&'*+.^_`|~0-9a-z-]+$/

const isAllowedHeader = (name: string, devBypass: boolean): boolean => {
  if (!FIELD_NAME.test(name)) return false
  if (name === ADMIN_HEADER) return false
  if (name === DEV_BYPASS_HEADER) return devBypass
  return (
    ALLOWED_HEADERS.has(name) ||
    ALLOWED_HEADER_PREFIXES.some((prefix) => name.startsWith(prefix))
  )
}

/**
 * `Access-Control-Request-Headers` lowercased, or null when any of them is
 * outside the allow-list.
 */
const requestedHeaders = (
  header: string | undefined,
  devBypass: boolean
): string[] | null => {
  const names = (header ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
  return names.every((name) => isAllowedHeader(name, devBypass)) ? names : null
}

const appendVary = (headers: Headers, value: string): void => {
  const current = headers.get('vary')
  if (!current) headers.set('vary', value)
  else if (!current.split(',').some((part) => part.trim().toLowerCase() === value.toLowerCase()))
    headers.set('vary', `${current}, ${value}`)
}

const setCorsHeaders = (headers: Headers, origin: string): void => {
  headers.set('access-control-allow-origin', origin)
  headers.set('access-control-expose-headers', CORS_EXPOSED_HEADERS)
  appendVary(headers, 'Origin')
}

/**
 * `response` with the CORS headers for `origin`. A response whose headers are
 * immutable (one a `fetch` or Durable Object returned) is copied first; a
 * 101 upgrade is returned untouched.
 */
export const withCors = (response: Response, origin: string): Response => {
  if (response.status === 101) return response
  try {
    setCorsHeaders(response.headers, origin)
    return response
  } catch {
    const copy = new Response(response.body, response)
    setCorsHeaders(copy.headers, origin)
    return copy
  }
}

const preflight = (
  origin: string | null,
  method: string,
  headers: string | undefined,
  devBypass: boolean
): Response => {
  const names = requestedHeaders(headers, devBypass)
  if (
    !origin ||
    !names ||
    !(ALLOWED_METHODS as readonly string[]).includes(method)
  )
    return new Response(null, { status: 403 })
  const response = new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': ALLOWED_METHODS.join(', '),
      'access-control-max-age': String(PREFLIGHT_MAX_AGE_SECONDS),
      ...(names.length
        ? { 'access-control-allow-headers': names.join(', ') }
        : {}),
    },
  })
  appendVary(response.headers, 'Origin')
  return response
}

/** The CORS middleware; register it before every other one. */
export const cors = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  const origin = allowedWebOrigin(c.env, c.req.header('origin'))
  const method = c.req.header('access-control-request-method')
  if (c.req.method === 'OPTIONS' && method != null)
    return preflight(
      origin,
      method,
      c.req.header('access-control-request-headers'),
      Boolean(c.env.NOTES_IMPORT_DEV_BYPASS_TOKEN)
    )
  await next()
  if (!origin) return
  const response = withCors(c.res, origin)
  if (response !== c.res) {
    // Hono's setter copies the old response's headers onto the new one;
    // clear it first so the copy stands alone.
    c.res = undefined
    c.res = response
  }
}
