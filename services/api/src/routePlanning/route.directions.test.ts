import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
import type { AppEnv, Environment } from '../types'
import { createHarness, type Harness } from '../test/buddies'
import { bearer, openTestSession } from '../test/accounts'
import { createNamespace } from '../test/durableObjects'
import { resetAccountStatusCache } from '../accounts/auth'
import { createAccountsRoutes } from '../accounts/route'
import { accountsDb, setAccountStatus } from '../accounts/store'
import { isSupporter } from '../revenuecat'
import { isAccountSupporter } from '../accounts/supporter'
import { RoutePlanningQuota } from './quotaDO'
import { createRoutePlanningRoutes } from './route'
import { ROUTE_PLANNING_LIMITS } from './config'

/** Directions for any account with a session; HERE Routing behind a quota. */

const T0 = Date.UTC(2026, 9, 18, 8)
const points = [
  { lat: 39.1, lng: -84.5 },
  { lat: 39.11, lng: -84.51 },
  { lat: 39.12, lng: -84.52 },
]
const section = {
  polyline: 'BFoz5xJ67i1B1B7PzIhaxL7Y',
  summary: { length: 4321.4, duration: 600.6 },
}
const hereSuccess = () =>
  Response.json({ routes: [{ sections: [section, section] }] })

let h: Harness
let accountSupporter: ReturnType<typeof vi.fn>
let here: ReturnType<typeof vi.fn>
let now: number
let routes: Hono<AppEnv>
const accountsApp = createAccountsRoutes() as never

beforeEach(async () => {
  h = await createHarness()
  resetAccountStatusCache()
  const env = h.env as Environment & Record<string, unknown>
  env.HERE_API_KEY = 'here-key'
  const quotas = createNamespace(
    (state) => new RoutePlanningQuota(state as never, env as never)
  )
  env.ROUTE_PLANNING_QUOTA =
    quotas.namespace as Environment['ROUTE_PLANNING_QUOTA']
  accountSupporter = vi.fn(async () => false)
  here = vi.fn(async () => hereSuccess())
  now = T0
  routes = new Hono<AppEnv>()
  routes.route(
    '/route-planning',
    createRoutePlanningRoutes({
      fetch: here as unknown as typeof fetch,
      checkSupporter: vi.fn() as unknown as typeof isSupporter,
      checkAccountSupporter:
        accountSupporter as unknown as typeof isAccountSupporter,
      now: () => now,
    })
  )
})

afterEach(() => vi.restoreAllMocks())

const post = async (
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
) => {
  const response = await routes.request(
    `/route-planning/${path}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    },
    h.env
  )
  return {
    status: response.status,
    headers: response.headers,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    json: (await response.json()) as any,
  }
}
const directions = (body: unknown, headers?: Record<string, string>) =>
  post('directions', body, headers)

const session = async () => {
  const opened = await openTestSession(accountsApp, h.env)
  return { ...opened, auth: bearer(opened.accessToken) }
}

describe('route directions', () => {
  it('returns a leg per pair, for an account that isn’t a Supporter', async () => {
    const { auth } = await session()
    const response = await directions({ points }, auth)
    expect(response.status).toBe(200)
    expect(response.json.legs).toHaveLength(2)
    expect(response.json.legs[0]).toEqual({
      distanceMeters: 4321,
      durationSeconds: 601,
      coordinates: [
        50.10228, 8.69821, 50.10201, 8.69567, 50.10063, 8.6915, 50.09878,
        8.68752,
      ],
    })
    expect(response.json.remainingToday).toBe(
      ROUTE_PLANNING_LIMITS.directionsDailyLimit - 1
    )
    expect(accountSupporter).not.toHaveBeenCalled()
    const url = new URL(here.mock.calls[0]![0] as string)
    expect(url.searchParams.getAll('via')).toEqual(['39.11,-84.51'])
  })

  it('needs a session: no token, a bad one, or a suspended account', async () => {
    const none = await directions({ points })
    expect(none.status).toBe(401)
    expect(none.headers.get('www-authenticate')).toContain('Bearer')
    expect((await directions({ points }, bearer('nope'))).status).toBe(401)

    const { accountId, auth } = await session()
    await setAccountStatus(
      accountsDb(h.accountsDb!),
      accountId,
      'suspended',
      'report'
    )
    const suspended = await directions({ points }, auth)
    expect(suspended.status).toBe(403)
    expect(suspended.json.code).toBe('suspended')
    expect(here).not.toHaveBeenCalled()
  })

  it('takes coordinates only, two to the limit', async () => {
    const { auth } = await session()
    const many = Array.from(
      { length: ROUTE_PLANNING_LIMITS.maxDirectionsPoints + 1 },
      () => points[0]
    )
    for (const body of [
      { points: points.slice(0, 1) },
      { points: many },
      { points, name: 'Jane' },
      { points: [{ lat: 91, lng: 0 }, points[0]] },
    ]) {
      expect((await directions(body, auth)).status).toBe(400)
    }
    expect(here).not.toHaveBeenCalled()
  })

  it('meters per minute, apart from optimizations', async () => {
    const { auth } = await session()
    for (let i = 0; i < ROUTE_PLANNING_LIMITS.directionsMinuteLimit; i++) {
      expect((await directions({ points }, auth)).status).toBe(200)
    }
    const limited = await directions({ points }, auth)
    expect(limited.status).toBe(429)
    expect(limited.json.code).toBe('rate_limited')
    expect(limited.headers.get('retry-after')).toBeTruthy()

    // Shortest Order's quota is untouched (the account isn't a Supporter here,
    // so make it one for this call).
    accountSupporter.mockResolvedValue(true)
    here.mockResolvedValueOnce(
      Response.json({
        results: [
          {
            waypoints: [
              { id: 'start', sequence: 0 },
              { id: 's0', sequence: 1 },
            ],
            distance: '1',
            time: '1',
          },
        ],
      })
    )
    const optimized = await post(
      'optimize',
      { start: points[0], stops: [points[1]] },
      auth
    )
    expect(optimized.json.remainingToday).toBe(
      ROUTE_PLANNING_LIMITS.dailyLimit - 1
    )
  })

  it('maps HERE’s answers: no route is 422, trouble is 502', async () => {
    const { auth } = await session()
    here.mockResolvedValueOnce(Response.json({ routes: [] }))
    const none = await directions({ points }, auth)
    expect(none.status).toBe(422)
    expect(none.json.code).toBe('no_route')

    here.mockResolvedValueOnce(new Response('down', { status: 503 }))
    const down = await directions({ points }, auth)
    expect(down.status).toBe(502)
    expect(down.json.code).toBe('upstream_error')
  })

  it('is 503 unavailable behind the kill switch', async () => {
    await h.kv.put('route-planning:enabled', 'false')
    const { auth } = await session()
    const response = await directions({ points }, auth)
    expect(response.status).toBe(503)
    expect(response.json.code).toBe('unavailable')
  })
})
