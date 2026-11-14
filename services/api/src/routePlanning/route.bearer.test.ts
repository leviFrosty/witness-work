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
import { bearer, openTestSession, type TestSession } from '../test/accounts'
import { createNamespace } from '../test/durableObjects'
import { resetAccountStatusCache } from '../accounts/auth'
import { createAccountsRoutes } from '../accounts/route'
import { accountsDb, setAccountStatus } from '../accounts/store'
import { accessTokenKeys, signAccessToken } from '../accounts/tokens'
import { RevenueCatError, isSupporter } from '../revenuecat'
import { isAccountSupporter } from '../accounts/supporter'
import { RoutePlanningQuota } from './quotaDO'
import { createRoutePlanningRoutes } from './route'

/**
 * Route planning on the account's Supporter status (witness-work ADR 0029):
 * a bearer request is the token's account, and the legacy form keeps asking
 * RevenueCat about the id it sends while the legacy switch is on.
 */

const T0 = Date.UTC(2026, 9, 18, 8)
const route = {
  start: { lat: 39.1, lng: -84.5 },
  stops: [
    { lat: 39.11, lng: -84.51 },
    { lat: 39.12, lng: -84.52 },
  ],
}
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

let h: Harness
let accountSupporter: ReturnType<typeof vi.fn>
let legacySupporter: ReturnType<typeof vi.fn>
let here: ReturnType<typeof vi.fn>
let routes: Hono<AppEnv>
const accountsApp = createAccountsRoutes() as never

beforeEach(async () => {
  h = await createHarness()
  resetAccountStatusCache()
  const env = h.env as Environment & Record<string, unknown>
  env.HERE_API_KEY = 'here-key'
  env.REVENUECAT_API_KEY = 'rc-key'
  const quotas = createNamespace(
    (state) => new RoutePlanningQuota(state as never, env as never)
  )
  env.ROUTE_PLANNING_QUOTA =
    quotas.namespace as Environment['ROUTE_PLANNING_QUOTA']
  accountSupporter = vi.fn(async () => true)
  legacySupporter = vi.fn(async () => true)
  here = vi.fn(async () => hereSuccess())
  routes = new Hono<AppEnv>()
  routes.route(
    '/route-planning',
    createRoutePlanningRoutes({
      fetch: here as unknown as typeof fetch,
      checkSupporter: legacySupporter as unknown as typeof isSupporter,
      checkAccountSupporter:
        accountSupporter as unknown as typeof isAccountSupporter,
      now: () => T0,
    })
  )
})

afterEach(() => vi.restoreAllMocks())

const optimize = async (
  body: unknown,
  headers: Record<string, string> = {}
) => {
  const response = await routes.request(
    '/route-planning/optimize',
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

/** A token for the session's account as an iOS session would carry. */
const iosToken = async (session: TestSession) =>
  (
    await signAccessToken((await accessTokenKeys(h.env))!, {
      accountId: session.accountId,
      sessionId: session.sessionId,
      platform: 'ios',
    })
  ).accessToken

describe('bearer route planning', () => {
  it('asks about the token’s account, never a RevenueCat id', async () => {
    const session = await openTestSession(accountsApp, h.env)
    const response = await optimize(route, bearer(await iosToken(session)))
    expect(response.status).toBe(200)
    expect(response.json.order).toEqual([1, 0])
    expect(accountSupporter).toHaveBeenCalledWith(
      h.env,
      session.accountId,
      expect.anything()
    )
    expect(legacySupporter).not.toHaveBeenCalled()
  })

  it('refuses an account that isn’t a Supporter before HERE', async () => {
    accountSupporter.mockResolvedValue(false)
    const session = await openTestSession(accountsApp, h.env)
    const response = await optimize(route, bearer(await iosToken(session)))
    expect(response.status).toBe(403)
    expect(response.json.code).toBe('supporter_required')
    expect(here).not.toHaveBeenCalled()
  })

  it('fails closed when RevenueCat can’t be read', async () => {
    accountSupporter.mockRejectedValue(new RevenueCatError('RevenueCat 503'))
    const session = await openTestSession(accountsApp, h.env)
    const response = await optimize(route, bearer(await iosToken(session)))
    expect(response.status).toBe(503)
    expect(response.json.code).toBe('supporter_check_failed')
    expect(response.headers.get('retry-after')).toBe('30')
    expect(here).not.toHaveBeenCalled()
  })

  it('rejects the legacy accountId field on a bearer request', async () => {
    const session = await openTestSession(accountsApp, h.env)
    const response = await optimize(
      { ...route, accountId: 'A1B2C3D4-0000-4000-8000-000000000001' },
      bearer(await iosToken(session))
    )
    expect(response.status).toBe(400)
  })

  it('refuses a bad token with 401 and a suspended account with 403', async () => {
    const bad = await optimize(route, bearer('not-a-token'))
    expect(bad.status).toBe(401)
    expect(bad.json.code).toBe('unauthorized')
    expect(bad.headers.get('www-authenticate')).toContain('Bearer')

    const session = await openTestSession(accountsApp, h.env)
    await setAccountStatus(
      accountsDb(h.accountsDb!),
      session.accountId,
      'suspended',
      'report'
    )
    const suspended = await optimize(route, bearer(await iosToken(session)))
    expect(suspended.status).toBe(403)
    expect(suspended.json.code).toBe('suspended')
    expect(accountSupporter).not.toHaveBeenCalled()
  })

  it('meters per account, apart from any legacy id', async () => {
    const session = await openTestSession(accountsApp, h.env)
    const token = await iosToken(session)
    expect((await optimize(route, bearer(token))).json.remainingToday).toBe(9)
    expect((await optimize(route, bearer(token))).json.remainingToday).toBe(8)
    const legacy = await optimize({ ...route, accountId: session.accountId })
    expect(legacy.json.remainingToday).toBe(9)
  })

  it('lets a dev session skip the Supporter check on a development worker', async () => {
    accountSupporter.mockResolvedValue(false)
    const session = await openTestSession(accountsApp, h.env)
    const response = await optimize(route, bearer(session.accessToken))
    expect(response.status).toBe(200)
    expect(accountSupporter).not.toHaveBeenCalled()
  })
})

describe('legacy route planning', () => {
  const legacyBody = {
    ...route,
    accountId: 'A1B2C3D4-0000-4000-8000-000000000001',
  }

  it('asks RevenueCat about the id it sends while the legacy switch is on', async () => {
    const response = await optimize(legacyBody)
    expect(response.status).toBe(200)
    expect(legacySupporter).toHaveBeenCalledWith(
      expect.objectContaining({ appUserId: legacyBody.accountId })
    )
    expect(accountSupporter).not.toHaveBeenCalled()
  })

  it('is 426 upgrade_required once the switch is off', async () => {
    await h.kv.put('auth:legacy', 'off')
    const response = await optimize(legacyBody)
    expect(response.status).toBe(426)
    expect(response.json.code).toBe('upgrade_required')
    expect(response.headers.get('retry-after')).toBeNull()
    expect(legacySupporter).not.toHaveBeenCalled()
  })
})
