import { retryAfterHeaders } from '../errors'
import type { ScribeErrorBody, ScribeErrorCode, UsageSnapshot } from './wire'

/**
 * Scribe AI's error envelope (protocol: Errors): Notes Import's shape, an
 * English `error` for logs, the stable `code`, `retryAfter` mirrored in
 * `Retry-After`, `usage` on `limit_reached`, and `detail` for dev-bypass
 * callers only.
 */

export const ERROR_MESSAGES: Record<ScribeErrorCode, string> = {
  bad_request: 'Malformed request',
  invalid_tools: 'Tool definitions break a protocol rule',
  step_limit: 'Too many steps in this turn',
  unauthorized: 'The access token is missing, expired, or invalid',
  limit_reached: 'Usage limit reached',
  suspended: 'This account is suspended',
  step_in_progress: 'This step is already running',
  step_retry_limit: 'This step was attempted too many times',
  too_large: 'Request too large',
  context_full: 'The conversation is too long',
  upgrade_required: 'Update required',
  rate_limited: 'Too many requests',
  active_cap: 'Too many steps running for this account',
  transcribe_limit: 'Page limit reached for today',
  server_error: 'Unexpected error',
  model_error: 'The model could not answer',
  disabled: 'Scribe AI is turned off',
  unavailable: 'Scribe AI is temporarily unavailable',
}

export interface ScribeErrorOptions {
  retryAfter?: number
  usage?: UsageSnapshot
  /** Only for dev-bypass callers. */
  detail?: string
  headers?: Record<string, string>
}

export const scribeErrorBody = (
  code: ScribeErrorCode,
  options: ScribeErrorOptions = {}
): ScribeErrorBody => {
  const body: ScribeErrorBody = { ok: false, error: ERROR_MESSAGES[code], code }
  if (options.retryAfter != null) body.retryAfter = options.retryAfter
  if (options.usage) body.usage = options.usage
  if (options.detail) body.detail = options.detail
  return body
}

export const scribeError = (
  status: number,
  code: ScribeErrorCode,
  options: ScribeErrorOptions = {}
): Response =>
  Response.json(scribeErrorBody(code, options), {
    status,
    headers: { ...retryAfterHeaders(options.retryAfter), ...options.headers },
  })

/**
 * What Sentry gets for a provider failure: the error's class name, HTTP
 * status, and the provider's error code. Never the AI SDK or provider error
 * itself, whose message, body, and request carry conversation content.
 */
export class ScribeModelError extends Error {
  readonly errorClass: string
  readonly status: number | null
  readonly providerCode: string | null

  constructor(fields: { errorClass: string; status: number | null; providerCode: string | null }) {
    super(
      `${fields.errorClass}${fields.status != null ? ` ${fields.status}` : ''}${
        fields.providerCode ? ` (${fields.providerCode})` : ''
      }`
    )
    this.name = 'ScribeModelError'
    this.errorClass = fields.errorClass
    this.status = fields.status
    this.providerCode = fields.providerCode
  }
}

const SAFE_CODE = /^[A-Za-z0-9_.:-]{1,48}$/

const safeCode = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return typeof value === 'string' && SAFE_CODE.test(value) ? value : null
}

const record = (value: unknown): Record<string, unknown> | null =>
  value != null && typeof value === 'object' ? (value as Record<string, unknown>) : null

/** Builds a `ScribeModelError` from anything thrown by a model call. */
export const toScribeModelError = (error: unknown): ScribeModelError => {
  // A RetryError wraps the last attempt's error.
  const outer = record(error)
  const inner = record(outer?.lastError) ?? outer
  const errorClass =
    (typeof inner?.name === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(inner.name)
      ? inner.name
      : null) ??
    (error instanceof Error ? error.constructor.name : 'UnknownError')
  const statusValue = inner?.statusCode ?? inner?.status
  const status =
    typeof statusValue === 'number' && Number.isInteger(statusValue) ? statusValue : null
  const data = record(inner?.data)
  const providerCode = safeCode(record(data?.error)?.code) ?? safeCode(data?.code)
  return new ScribeModelError({ errorClass, status, providerCode })
}

/** One line of detail for a dev-bypass caller: the sanitized error only. */
export const devDetail = (error: unknown): string => toScribeModelError(error).message

/**
 * The host refused the request because its text looked like a prompt
 * injection (OpenRouter's guardrail answers 403 "Request blocked: prompt
 * injection patterns detected"). Nothing was generated or charged. A Visit
 * note with "ignore previous instructions" in it is enough, and since the app
 * resends the whole conversation, every later step would be blocked too.
 */
export const isInjectionBlock = (error: unknown): boolean => {
  const outer = record(error)
  const inner = record(outer?.lastError) ?? outer
  if (!inner) return false
  const status = inner.statusCode ?? inner.status
  if (status !== 403) return false
  const text = [inner.message, inner.responseBody, record(record(inner.data)?.error)?.message]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
  return /prompt injection/i.test(text)
}
