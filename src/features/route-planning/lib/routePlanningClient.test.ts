import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  offline: false,
  links: 0,
  sessionError: null as unknown,
}))
vi.mock('@/lib/http/online', () => ({ isKnownOffline: () => mocks.offline }))
vi.mock('@/lib/perf', () => ({ perf: { count: vi.fn() } }))
vi.mock('@/lib/serverAccount/revenueCatLinkRuntime', () => ({
  linkBeforePaidCall: async () => {
    mocks.links++
  },
}))
// The session adds its bearer token; `sessionError` stands in for a session
// that couldn't be opened.
vi.mock('@/lib/serverAccount', async () => {
  const { request } = await import('@/lib/http/request')
  return {
    accountSessions: {
      request: async (options: Parameters<typeof request>[0]) => {
        if (mocks.sessionError) throw mocks.sessionError
        return request({
          ...options,
          headers: { ...options.headers, authorization: 'Bearer at-1' },
        })
      },
    },
  }
})
vi.stubGlobal('fetch', mocks.fetch)

import { optimizeRoute } from '@/features/route-planning/lib/routePlanningClient'
import { AccountSessionError } from '@/lib/serverAccount/session'

const args = {
  start: { latitude: 39.1, longitude: -84.5 },
  stops: [
    { latitude: 39.11, longitude: -84.51 },
    { latitude: 39.12, longitude: -84.52 },
  ],
}

const respond = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) => new Response(JSON.stringify(body), { status, headers })

beforeEach(() => {
  mocks.fetch.mockReset()
  mocks.offline = false
  mocks.links = 0
  mocks.sessionError = null
})

describe('optimizeRoute', () => {
  it('sends bare coordinates only, as the session, after linking RevenueCat', async () => {
    mocks.fetch.mockResolvedValue(
      respond(200, {
        order: [1, 0],
        distanceMeters: 5000,
        durationSeconds: 700,
      })
    )
    await expect(optimizeRoute(args)).resolves.toEqual({
      ok: true,
      order: [1, 0],
      distanceMeters: 5000,
      durationSeconds: 700,
    })
    const [url, init] = mocks.fetch.mock.calls[0]! as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(url).toBe(
      'https://ww-proxy.leviwilkerson.com/route-planning/optimize'
    )
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer at-1')
    expect(mocks.links).toBe(1)
    expect(body).toEqual({
      start: { lat: 39.1, lng: -84.5 },
      stops: [
        { lat: 39.11, lng: -84.51 },
        { lat: 39.12, lng: -84.52 },
      ],
    })
  })

  it('rejects an answer that does not reorder exactly the stops sent', async () => {
    mocks.fetch.mockResolvedValue(
      respond(200, { order: [0, 0], distanceMeters: 1, durationSeconds: 1 })
    )
    await expect(optimizeRoute(args)).resolves.toEqual({
      ok: false,
      error: 'failed',
    })
  })

  it('passes known server codes through and folds the rest into failed', async () => {
    for (const code of [
      'supporter_required',
      'suspended',
      'daily_limit',
      'rate_limited',
      'no_route',
      'unavailable',
    ]) {
      mocks.fetch.mockResolvedValueOnce(
        respond(400, { error: 'A message for logs', code })
      )
      await expect(optimizeRoute(args)).resolves.toEqual({
        ok: false,
        error: code,
      })
    }
    mocks.fetch.mockResolvedValueOnce(respond(400, { code: 'bad_request' }))
    await expect(optimizeRoute(args)).resolves.toEqual({
      ok: false,
      error: 'failed',
    })
  })

  it('passes the server Retry-After along with a rate limit', async () => {
    mocks.fetch.mockResolvedValueOnce(
      respond(
        429,
        { error: 'Too many', code: 'rate_limited' },
        {
          'retry-after': '42',
        }
      )
    )
    await expect(optimizeRoute(args)).resolves.toEqual({
      ok: false,
      error: 'rate_limited',
      retryAfterMs: 42_000,
    })
    expect(mocks.fetch).toHaveBeenCalledOnce()
  })

  it('reports a request with no response as offline', async () => {
    mocks.fetch.mockRejectedValueOnce(new TypeError('Network request failed'))
    await expect(optimizeRoute(args)).resolves.toEqual({
      ok: false,
      error: 'offline',
    })
  })

  it('tells a timeout apart from offline', async () => {
    vi.useFakeTimers()
    mocks.fetch.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal!.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          )
        )
    )
    const result = optimizeRoute(args)
    await vi.advanceTimersByTimeAsync(30_000)
    await expect(result).resolves.toEqual({ ok: false, error: 'timeout' })
    vi.useRealTimers()
  })

  it('reports a caller cancel as cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      optimizeRoute({ ...args, signal: controller.signal })
    ).resolves.toEqual({ ok: false, error: 'cancelled' })
  })

  it('explains a session that could not be opened', async () => {
    const cases: [AccountSessionError, unknown][] = [
      [new AccountSessionError('offline'), { ok: false, error: 'offline' }],
      [
        new AccountSessionError('attestation', { attestation: 'device' }),
        { ok: false, error: 'device_unverified' },
      ],
      [
        new AccountSessionError('attestation', { attestation: 'temporary' }),
        { ok: false, error: 'verify_later' },
      ],
      [new AccountSessionError('upgrade'), { ok: false, error: 'failed' }],
      [
        new AccountSessionError('unavailable'),
        { ok: false, error: 'unavailable' },
      ],
    ]
    for (const [error, expected] of cases) {
      mocks.sessionError = error
      await expect(optimizeRoute(args)).resolves.toEqual(expected)
    }
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})
