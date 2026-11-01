import { HttpError } from '@/lib/http/request'
import { AccountSessionError } from '@/lib/serverAccount/session'
import type { ScribeError, ScribeErrorCode } from '@/features/scribe/types'
import type { UsageSnapshotWire } from '@/features/scribe/lib/wire'
import { parseUsageSnapshot } from '@/features/scribe/lib/usageSnapshot'

export class ScribeClientError extends Error {
  readonly code: ScribeErrorCode | 'cancelled'

  readonly serverCode: string | null
  readonly status: number | null
  readonly retryAfterMs: number | null

  readonly usage: UsageSnapshotWire | null

  constructor(
    code: ScribeErrorCode | 'cancelled',
    details: {
      serverCode?: string | null
      status?: number | null
      retryAfterMs?: number | null
      usage?: UsageSnapshotWire | null
    } = {}
  ) {
    super(
      `scribe: ${code}${details.serverCode ? ` (${details.serverCode})` : ''}`
    )
    this.name = 'ScribeClientError'
    this.code = code
    this.serverCode = details.serverCode ?? null
    this.status = details.status ?? null
    this.retryAfterMs = details.retryAfterMs ?? null
    this.usage = details.usage ?? null
  }
}

const SERVER_CODES: Record<string, ScribeErrorCode> = {
  bad_request: 'unknown',
  invalid_tools: 'unknown',
  step_limit: 'couldnt_finish',
  unauthorized: 'attestation_unavailable',
  limit_reached: 'limit_reached',
  suspended: 'suspended',
  step_in_progress: 'unavailable',
  step_retry_limit: 'unknown',
  too_large: 'too_large',
  context_full: 'context_full',
  upgrade_required: 'update_required',
  rate_limited: 'rate_limited',
  active_cap: 'rate_limited',
  transcribe_limit: 'rate_limited',
  server_error: 'unavailable',
  model_error: 'model_error',
  model_timeout: 'timeout',
  disabled: 'disabled',
  unavailable: 'unavailable',
}

const FINAL_CODES = new Set<ScribeErrorCode | 'cancelled'>([
  'cancelled',
  'limit_reached',
  'context_full',
  'too_large',
  'too_much',
  'couldnt_finish',
  'suspended',
  'device_ineligible',
  'update_required',
  'disabled',
])

export const REPORTED_SERVER_CODES = new Set([
  'bad_request',
  'invalid_tools',
  'step_retry_limit',
])

const NO_RETRY_SERVER_CODES = new Set(['invalid_tools', 'step_retry_limit'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function fromHttpError(error: HttpError): ScribeClientError {
  if (error.kind === 'cancelled') return new ScribeClientError('cancelled')
  if (error.status === null)
    return new ScribeClientError(
      error.kind === 'timeout' ? 'timeout' : 'network'
    )
  const body = isRecord(error.body) ? error.body : null
  const serverCode =
    typeof body?.code === 'string' ? body.code : error.serverCode
  const bodyRetryAfter =
    typeof body?.retryAfter === 'number' ? body.retryAfter * 1000 : null
  const mapped: ScribeErrorCode =
    (serverCode ? SERVER_CODES[serverCode] : undefined) ??
    (error.status === 426
      ? 'update_required'
      : error.status === 429
        ? 'rate_limited'
        : error.status >= 500
          ? 'unavailable'
          : 'unknown')
  return new ScribeClientError(mapped, {
    serverCode,
    status: error.status,
    retryAfterMs: error.retryAfterMs ?? bodyRetryAfter,
    usage: parseUsageSnapshot(body?.usage),
  })
}

function fromSessionError(error: AccountSessionError): ScribeClientError {
  const details = {
    status: error.status,
    serverCode: error.serverCode,
    retryAfterMs: error.retryAfterMs,
  }
  switch (error.failure) {
    case 'cancelled':
      return new ScribeClientError('cancelled')
    case 'offline':
      return new ScribeClientError('network', details)
    case 'upgrade':
      return new ScribeClientError('update_required', details)
    case 'attestation':
      return new ScribeClientError(
        error.attestation === 'device'
          ? 'device_ineligible'
          : 'attestation_unavailable',
        details
      )
    case 'rateLimited':
      return new ScribeClientError('rate_limited', details)
    case 'unavailable':
    case 'server':
      return new ScribeClientError('unavailable', details)
  }
}

export function toScribeClientError(error: unknown): ScribeClientError {
  if (error instanceof ScribeClientError) return error

  if (error instanceof AccountSessionError) return fromSessionError(error)
  if (error instanceof HttpError) return fromHttpError(error)
  if (error instanceof Error && error.name === 'AbortError')
    return new ScribeClientError('cancelled')
  return new ScribeClientError('unknown')
}

export function fromStreamErrorCode(
  code: string,
  meter: UsageSnapshotWire | null
): ScribeClientError {
  return new ScribeClientError(SERVER_CODES[code] ?? 'unknown', {
    serverCode: code,
    usage: meter,
  })
}

export function toScribeError(error: unknown): ScribeError {
  const failure = toScribeClientError(error)
  const code: ScribeErrorCode =
    failure.code === 'cancelled' ? 'unknown' : failure.code
  return {
    code,
    retryable:
      !FINAL_CODES.has(failure.code) &&
      !(failure.serverCode && NO_RETRY_SERVER_CODES.has(failure.serverCode)),
    retryAfterMs: failure.retryAfterMs,
    resetsAt:
      code === 'limit_reached' ? (failure.usage?.resetsAt ?? null) : null,
  }
}
