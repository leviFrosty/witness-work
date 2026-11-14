import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: DurableObjectState
    env: unknown
    constructor(ctx: DurableObjectState, env: unknown) {
      this.ctx = ctx
      this.env = env
    }
  },
}))

import { Hono } from 'hono'
import type { Environment } from '../types'
import { makeMemoryKv, type MemoryKv } from '../test/memoryKv'
import { createNamespace } from '../test/durableObjects'
import { RevenueCatError, isSupporter } from '../revenuecat'
import { RoutePlanningQuota } from './quotaDO'
import { createRoutePlanningRoutes } from './route'
import worker from '../index'

const ACCOUNT = 'acct-1234567890'
const T0 = Date.UTC(2026, 9, 5, 8)

const body = (overrides: Record<string, unknown> = {}) => ({
  accountId: ACCOUNT,
  start: { lat: 39.1, lng: -84.5 },
  stops: [
    { lat: 39.11, lng: -84.51 },
    { lat: 39.12, lng: -84.52 },
  ],
  ...overrides,
})

const hereSuccess = () =>
  Response.json({
    results: [
      {
        waypoints: [
          { id: 'start', sequence: 0 },
          { id: 's1', sequence: 1 },
          { id: 's0', sequence: 2 },
        ],
        distance: '4321.4',
        time: '600.6',
      },
    ],
    errors: [],
  })

interface Setup {
  kv: MemoryKv
  env: Environment
  supporter: ReturnType<typeof vi.fn>
  here: ReturnType<typeof vi.fn>
  now: { value: number }
  post(
    payload: unknown,
    headers?: Record<string, string>
  ): Promise<{ status: number; headers: Headers; json: any }> // eslint-disable-line @typescript-eslint/no-explicit-any
}

const setup = (envOverrides: Partial<Environment> = {}): Setup => {
  const kv = makeMemoryKv()
  const env = {
    NOTES_KV: kv,
    HERE_API_KEY: 'here-key',
    REVENUECAT_API_KEY: 'rc-key',
    APP_ATTEST_ENVIRONMENT: 'production',
    ...envOverrides,
  } as unknown as Environment
  const quotas = createNamespace(
    (state) => new RoutePlanningQuota(state as never, env as never)
  )
  env.ROUTE_PLANNING_QUOTA =
    quotas.namespace as Environment['ROUTE_PLANNING_QUOTA']

  const supporter = vi.fn(async () => true)
  const here = vi.fn(async () => hereSuccess())
  const now = { value: T0 }
  const app = new Hono<{ Bindings: Environment }>()
  app.route(
    '/route-planning',
    createRoutePlanningRoutes({
      fetch: here as unknown as typeof fetch,
      checkSupporter: supporter as unknown as typeof isSupporter,
      now: () => now.value,
    })
  )

  return {
    kv,
    env,
    supporter,
    here,
    now,
    post: async (payload, headers = {}) => {
      const response = await app.request(
        '/route-planning/optimize',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: typeof payload === 'string' ? payload : JSON.stringify(payload),
        },
        env
      )
      return {
        status: response.status,
        headers: response.headers,
        json: await response.json(),
      }
    },
  }
}

let s: Setup
beforeEach(() => {
  s = setup()
})

describe('POST /route-planning/optimize', () => {
  it('returns the shortest order for a Supporter', async () => {
    const response = await s.post(body())
    expect(response.status).toBe(200)
    expect(response.json).toEqual({
      order: [1, 0],
      distanceMeters: 4321,
      durationSeconds: 601,
      remainingToday: 9,
    })
    expect(s.supporter).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'rc-key',
        appUserId: ACCOUNT,
        countWebSandbox: false,
      })
    )
    const [, init] = s.here.mock.calls[0] as [string, RequestInit]
    const sent = new URLSearchParams(String(init.body))
    expect([...sent.keys()]).toEqual(['start', 'destination0', 'destination1'])
    expect(String(init.body)).not.toContain(ACCOUNT)
  })

  it('refuses non-Supporters without calling HERE', async () => {
    s.supporter.mockResolvedValueOnce(false)
    const response = await s.post(body())
    expect(response.status).toBe(403)
    expect(response.json.code).toBe('supporter_required')
    expect(s.here).not.toHaveBeenCalled()
  })

  it('fails closed when RevenueCat cannot answer', async () => {
    s.supporter.mockRejectedValueOnce(new RevenueCatError('RevenueCat 500'))
    const response = await s.post(body())
    expect(response.status).toBe(503)
    expect(response.json.code).toBe('supporter_check_failed')
    expect(response.json.retryAfter).toBe(30)
    expect(response.headers.get('Retry-After')).toBe('30')
    expect(s.here).not.toHaveBeenCalled()
  })

  it('rejects anything beyond an account id and coordinates', async () => {
    const withName = body({
      stops: [{ lat: 39.11, lng: -84.51, name: 'Jane Doe' }],
    })
    const extraField = { ...body(), notes: 'Bring the brochure' }
    for (const payload of [withName, extraField]) {
      const response = await s.post(payload)
      expect(response.status).toBe(400)
      expect(response.json.code).toBe('bad_request')
    }
    expect(s.supporter).not.toHaveBeenCalled()
  })

  it('validates stop count, coordinates, account id, and JSON', async () => {
    const tooMany = Array.from({ length: 11 }, () => ({ lat: 1, lng: 1 }))
    const cases: unknown[] = [
      body({ stops: [] }),
      body({ stops: tooMany }),
      body({ start: { lat: 91, lng: 0 } }),
      body({ accountId: 'short' }),
      '{not json',
    ]
    for (const payload of cases) {
      expect((await s.post(payload)).status).toBe(400)
    }
    expect(s.here).not.toHaveBeenCalled()
  })

  it('rejects oversized bodies', async () => {
    const response = await s.post(body({ padding: 'x'.repeat(5000) }))
    expect(response.status).toBe(413)
    expect(response.json.code).toBe('payload_too_large')
  })

  it('honors the KV kill switch', async () => {
    await s.kv.put('route-planning:enabled', 'false')
    const response = await s.post(body())
    expect(response.status).toBe(503)
    expect(response.json).toEqual({
      ok: false,
      error: 'Route planning is unavailable',
      code: 'unavailable',
      retryAfter: 60,
      retryAfterSeconds: 60,
    })
    expect(response.headers.get('Retry-After')).toBe('60')
    expect(s.supporter).not.toHaveBeenCalled()

    await s.kv.put('route-planning:enabled', 'true')
    expect((await s.post(body())).status).toBe(200)
  })

  it('limits each account to three a minute and ten a day', async () => {
    for (let i = 0; i < 3; i++) expect((await s.post(body())).status).toBe(200)
    const burst = await s.post(body())
    expect(burst.status).toBe(429)
    expect(burst.json).toEqual({
      ok: false,
      error: 'Too many route requests',
      code: 'rate_limited',
      retryAfter: 60,
      retryAfterSeconds: 60,
    })
    expect(burst.headers.get('Retry-After')).toBe('60')

    for (let i = 0; i < 7; i++) {
      s.now.value += 60_000
      expect((await s.post(body())).status).toBe(200)
    }
    s.now.value += 60_000
    const daily = await s.post(body())
    expect(daily.status).toBe(429)
    expect(daily.json.code).toBe('daily_limit')
    expect(s.here).toHaveBeenCalledTimes(10)

    // Another account has its own allowance.
    expect(
      (await s.post(body({ accountId: 'acct-other-0001' }))).status
    ).toBe(200)
  })

  it('charges an optimization even when HERE finds no route', async () => {
    s.here.mockResolvedValueOnce(Response.json({ results: [], errors: [] }))
    const response = await s.post(body())
    expect(response.status).toBe(422)
    expect(response.json.code).toBe('no_route')
    expect((await s.post(body())).json.remainingToday).toBe(8)
  })

  it('reports HERE outages as upstream errors', async () => {
    s.here.mockResolvedValueOnce(new Response('error code: 522', { status: 522 }))
    const response = await s.post(body())
    expect(response.status).toBe(502)
    expect(response.json.code).toBe('upstream_error')
  })

  it('accepts the dev bypass only on the development worker', async () => {
    const dev = setup({
      APP_ATTEST_ENVIRONMENT: 'development',
      NOTES_IMPORT_DEV_BYPASS_TOKEN: 'dev-token',
    })
    dev.supporter.mockResolvedValue(false)
    expect(
      (await dev.post(body(), { 'x-ww-dev-bypass': 'dev-token' })).status
    ).toBe(200)
    expect(dev.supporter).not.toHaveBeenCalled()
    expect(
      (await dev.post(body(), { 'x-ww-dev-bypass': 'wrong' })).status
    ).toBe(403)

    const prod = setup({ NOTES_IMPORT_DEV_BYPASS_TOKEN: 'dev-token' })
    prod.supporter.mockResolvedValue(false)
    expect(
      (await prod.post(body(), { 'x-ww-dev-bypass': 'dev-token' })).status
    ).toBe(403)
  })
})

describe('worker wiring', () => {
  it('mounts the route behind the per-IP rate limiter', async () => {
    const limit = vi.fn(async () => ({ success: true }))
    const env = {
      NOTES_KV: makeMemoryKv(),
      RATE_LIMITER: { limit },
    } as unknown as Environment
    const context = { waitUntil: () => {}, passThroughOnException: () => {} }
    const response = await worker.fetch!(
      new Request('https://ww-proxy.leviwilkerson.com/route-planning/optimize', {
        method: 'POST',
        body: '{}',
      }) as never,
      env,
      context as never
    )
    expect(response.status).toBe(400)
    expect(limit).toHaveBeenCalledOnce()
  })
})
