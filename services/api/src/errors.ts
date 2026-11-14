/**
 * The error envelope every JSON route answers with:
 *
 * ```json
 * { "ok": false, "error": "<code or legacy message>", "code": "<stable code>", "retryAfter": 60 }
 * ```
 *
 * - `code` is always the stable, machine-readable code. Clients read it first.
 * - `error` is the same code on every route except attestation, Notes Import,
 *   and route planning, where shipped app builds already read `code` and
 *   `error` keeps its human-readable message.
 * - `retryAfter` (seconds) repeats the `Retry-After` header. Every 429 and 503
 *   sends both, except quotas that a wait can't free (documented per route).
 *
 * Routes may add their own fields (`reason`, `action`, `credits`, …) beside
 * these; none of them ever drops a field an older build reads.
 */
export interface ApiErrorBody {
  ok: false
  error: string
  code: string
  retryAfter?: number
}

/** Fields a route adds beside the envelope. */
export type ApiErrorExtras = Record<string, unknown>

/** Whole seconds, at least 1, so a client never spins on `Retry-After: 0`. */
export const retryAfterSeconds = (ms: number): number =>
  Math.max(1, Math.ceil(ms / 1000))

/** The `Retry-After` header for a wait, or nothing. */
export const retryAfterHeaders = (
  seconds: number | undefined
): Record<string, string> =>
  seconds == null ? {} : { 'Retry-After': String(seconds) }

export interface ApiErrorOptions {
  /** Shown in `error` instead of the code (Notes Import, route planning). */
  message?: string
  /** Seconds; sets the `Retry-After` header and `retryAfter`. */
  retryAfter?: number
  /** Extra body fields (never `ok`, `error`, `code`, or `retryAfter`). */
  extras?: ApiErrorExtras
  headers?: Record<string, string>
}

export const apiErrorBody = (
  code: string,
  options: Pick<ApiErrorOptions, 'message' | 'retryAfter' | 'extras'> = {}
): ApiErrorBody & ApiErrorExtras => {
  const body: ApiErrorBody & ApiErrorExtras = {
    ...options.extras,
    ok: false,
    error: options.message ?? code,
    code,
  }
  if (options.retryAfter != null) body.retryAfter = options.retryAfter
  return body
}

/** A JSON error response in the shared envelope. */
export const apiError = (
  status: number,
  code: string,
  options: ApiErrorOptions = {}
): Response =>
  Response.json(apiErrorBody(code, options), {
    status,
    headers: {
      ...retryAfterHeaders(options.retryAfter),
      ...options.headers,
    },
  })

/** `Date` for clients that calibrate their clock against the server. */
export const dateHeader = (now: number): Record<string, string> => ({
  Date: new Date(now).toUTCString(),
})
