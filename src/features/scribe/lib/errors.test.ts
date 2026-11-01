import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

import { HttpError } from '@/lib/http/request'
import { AccountSessionError } from '@/lib/serverAccount/session'
import {
  fromStreamErrorCode,
  REPORTED_SERVER_CODES,
  ScribeClientError,
  toScribeClientError,
  toScribeError,
} from '@/features/scribe/lib/errors'
import type { UsageSnapshotWire } from '@/features/scribe/lib/wire'

const RESETS_AT = 1_793_836_800_000
const LIMITED: UsageSnapshotWire = {
  plan: 'free',
  supporterCheckFailed: false,
  windows: [{ id: 'monthly', percentUsed: 100, resetsAt: RESETS_AT }],
  limited: true,
  resetsAt: RESETS_AT,
  asOf: 1_793_831_400_000,
}

const refused = (
  status: number,
  code: string | null,
  extra: Record<string, unknown> = {},
  retryAfterMs: number | null = null
) =>
  new HttpError(
    status === 429 ? 'rateLimited' : status >= 500 ? 'server' : 'client',
    status,
    code,
    retryAfterMs,
    undefined,
    code ? { ok: false, error: code, code, ...extra } : null
  )

describe('toScribeError', () => {
  it('402 limit_reached: reset time from the usage body, no Try again', () => {
    const error = toScribeError(
      refused(402, 'limit_reached', { usage: LIMITED, retryAfter: 5_400 })
    )
    expect(error).toEqual({
      code: 'limit_reached',
      retryable: false,
      retryAfterMs: 5_400_000,
      resetsAt: RESETS_AT,
    })
    expect(
      toScribeClientError(refused(402, 'limit_reached', { usage: LIMITED }))
        .usage
    ).toEqual(LIMITED)
  })

  it('402 without a usage body still says when it is unknown', () => {
    expect(toScribeError(refused(402, 'limit_reached'))).toMatchObject({
      code: 'limit_reached',
      resetsAt: null,
    })
  })

  it('413 too_large and context_full end the attempt', () => {
    expect(toScribeError(refused(413, 'too_large'))).toEqual({
      code: 'too_large',
      retryable: false,
      retryAfterMs: null,
      resetsAt: null,
    })
    expect(toScribeError(refused(413, 'context_full'))).toMatchObject({
      code: 'context_full',
      retryable: false,
    })
  })

  it('426 is Update Required, with or without the code', () => {
    expect(toScribeError(refused(426, 'upgrade_required'))).toMatchObject({
      code: 'update_required',
      retryable: false,
    })
    expect(toScribeError(refused(426, null))).toMatchObject({
      code: 'update_required',
    })
  })

  it('503 disabled hides; unavailable offers Try again after retryAfter', () => {
    expect(toScribeError(refused(503, 'disabled'))).toMatchObject({
      code: 'disabled',
      retryable: false,
    })
    expect(
      toScribeError(refused(503, 'unavailable', { retryAfter: 60 }))
    ).toEqual({
      code: 'unavailable',
      retryable: true,
      retryAfterMs: 60_000,
      resetsAt: null,
    })
  })

  it('prefers the Retry-After header over the body', () => {
    expect(
      toScribeError(refused(429, 'rate_limited', { retryAfter: 60 }, 7_000))
    ).toMatchObject({
      code: 'rate_limited',
      retryable: true,
      retryAfterMs: 7_000,
    })
  })

  it('reads an unknown code by its status', () => {
    expect(toScribeError(refused(418, 'teapot')).code).toBe('unknown')
    expect(toScribeError(refused(429, 'new_limit')).code).toBe('rate_limited')
    expect(toScribeError(refused(500, null)).code).toBe('unavailable')
  })

  it('offers Try again for bad_request, not for invalid_tools or step_retry_limit', () => {
    expect(toScribeError(refused(400, 'bad_request'))).toMatchObject({
      code: 'unknown',
      retryable: true,
    })
    expect(toScribeError(refused(400, 'invalid_tools'))).toMatchObject({
      code: 'unknown',
      retryable: false,
    })
    expect(toScribeError(refused(409, 'step_retry_limit'))).toMatchObject({
      code: 'unknown',
      retryable: false,
    })
    expect([...REPORTED_SERVER_CODES].sort()).toEqual([
      'bad_request',
      'invalid_tools',
      'step_retry_limit',
    ])
  })

  it('step_limit is the couldn’t-finish notice, not an error to retry', () => {
    expect(toScribeError(refused(400, 'step_limit'))).toMatchObject({
      code: 'couldnt_finish',
      retryable: false,
    })
  })

  it('a cancelled call shows as unknown and isn’t retried', () => {
    expect(toScribeError(new ScribeClientError('cancelled'))).toMatchObject({
      code: 'unknown',
      retryable: false,
    })
  })
})

describe('session failures', () => {
  it.each([
    [new AccountSessionError('offline'), 'network'],
    [new AccountSessionError('upgrade', { status: 426 }), 'update_required'],
    [
      new AccountSessionError('attestation', { attestation: 'device' }),
      'device_ineligible',
    ],
    [
      new AccountSessionError('attestation', { attestation: 'temporary' }),
      'attestation_unavailable',
    ],
    [
      new AccountSessionError('attestation', { attestation: 'failed' }),
      'attestation_unavailable',
    ],
    [
      new AccountSessionError('rateLimited', {
        status: 429,
        retryAfterMs: 9_000,
      }),
      'rate_limited',
    ],
    [new AccountSessionError('unavailable', { status: 503 }), 'unavailable'],
    [new AccountSessionError('server', { status: 500 }), 'unavailable'],
    [new AccountSessionError('cancelled'), 'cancelled'],
  ] as const)('%s → %s', (error, code) => {
    expect(toScribeClientError(error).code).toBe(code)
  })

  it('keeps a session’s wait', () => {
    expect(
      toScribeError(
        new AccountSessionError('rateLimited', {
          status: 429,
          retryAfterMs: 9_000,
        })
      )
    ).toMatchObject({
      code: 'rate_limited',
      retryable: true,
      retryAfterMs: 9_000,
    })
  })

  it('a device that can never attest isn’t retried; a temporary failure is', () => {
    expect(
      toScribeError(
        new AccountSessionError('attestation', { attestation: 'device' })
      ).retryable
    ).toBe(false)
    expect(
      toScribeError(
        new AccountSessionError('attestation', { attestation: 'temporary' })
      ).retryable
    ).toBe(true)
  })
})

describe('other failures', () => {
  it('maps transport failures without a status', () => {
    expect(toScribeClientError(new HttpError('offline')).code).toBe('network')
    expect(toScribeClientError(new HttpError('timeout')).code).toBe('timeout')
    expect(toScribeClientError(new HttpError('cancelled')).code).toBe(
      'cancelled'
    )
  })

  it('an AbortError is cancelled; anything else unknown', () => {
    expect(
      toScribeClientError(Object.assign(new Error('x'), { name: 'AbortError' }))
        .code
    ).toBe('cancelled')
    expect(toScribeClientError(new Error('boom')).code).toBe('unknown')
    expect(toScribeClientError('nope').code).toBe('unknown')
  })

  it('passes a client error through untouched', () => {
    const error = new ScribeClientError('too_large', { status: 413 })
    expect(toScribeClientError(error)).toBe(error)
  })
})

describe('fromStreamErrorCode', () => {
  it('maps the stream’s codes and keeps the meter', () => {
    expect(fromStreamErrorCode('model_error', LIMITED)).toMatchObject({
      code: 'model_error',
      serverCode: 'model_error',
      usage: LIMITED,
    })
    expect(fromStreamErrorCode('model_timeout', null).code).toBe('timeout')
    expect(fromStreamErrorCode('server_error', null).code).toBe('unavailable')
    expect(fromStreamErrorCode('limit_reached', LIMITED).code).toBe(
      'limit_reached'
    )
    expect(fromStreamErrorCode('something_new', null).code).toBe('unknown')
  })

  it('model errors offer Try again', () => {
    expect(
      toScribeError(fromStreamErrorCode('model_error', null)).retryable
    ).toBe(true)
    expect(
      toScribeError(fromStreamErrorCode('model_timeout', null)).retryable
    ).toBe(true)
  })
})
