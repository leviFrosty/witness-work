import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { createHarness, type Harness } from '../test/buddies'
import { bearer, openTestSession, postJson } from '../test/accounts'
import { makeMemoryKv } from '../test/memoryKv'
import {
  accountOf,
  bearerOrLegacy,
  bearerToken,
  requireAccount,
  resetAccountStatusCache,
} from './auth'
import { isLegacyAuthEnabled } from './legacySwitch'
import { accountsDb, setAccountStatus } from './store'
import { createAccountsRoutes } from './route'

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

const START = Date.UTC(2026, 9, 15, 12)
const accounts = createAccountsRoutes() as never

/** A route group the way a later feature would gate itself. */
const probe = new Hono<AppEnv>()
probe.post('/bearer', requireAccount(), (c) => c.json(accountOf(c)))
probe.post('/active', requireAccount({ requireActive: true }), (c) =>
  c.json(accountOf(c))
)
probe.post('/either', async (c) =>
  bearerOrLegacy(c, {
    bearer: async (account) => c.json({ via: 'bearer', ...account }),
    legacy: async () => c.json({ via: 'legacy' }),
  })
)

let h: Harness

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  h = await createHarness()
  resetAccountStatusCache()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const call = (path: string, headers: Record<string, string> = {}) =>
  postJson(probe as never, h.env, path, {}, headers)

describe('requireAccount', () => {
  it('hands the route the token’s account and session', async () => {
    const session = await openTestSession(accounts, h.env)
    const response = await call('/bearer', bearer(session.accessToken))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      accountId: session.accountId,
      sessionId: session.sessionId,
      platform: 'dev',
      keyEpoch: 0,
      // The session sent none; the token says so (`cap`).
      capabilities: [],
    })
  })

  it('refuses a missing, malformed, or expired token with 401', async () => {
    const session = await openTestSession(accounts, h.env)
    for (const headers of [
      {},
      { authorization: '' },
      { authorization: session.accessToken },
      { authorization: `Basic ${session.accessToken}` },
      { authorization: `Bearer ${session.accessToken}x` },
      { authorization: 'Bearer' },
    ]) {
      const response = await call('/bearer', headers)
      expect(response.status, JSON.stringify(headers)).toBe(401)
      expect(response.body).toEqual({
        ok: false,
        error: 'unauthorized',
        code: 'unauthorized',
      })
      expect(response.headers.get('www-authenticate')).toBe(
        'Bearer error="invalid_token"'
      )
    }
    vi.setSystemTime(START + 15 * 60_000)
    expect((await call('/bearer', bearer(session.accessToken))).status).toBe(401)
  })

  it('refuses a suspended account only when the route asks', async () => {
    const session = await openTestSession(accounts, h.env)
    expect((await call('/active', bearer(session.accessToken))).status).toBe(200)
    await setAccountStatus(
      accountsDb(h.env.ACCOUNTS_DB!),
      session.accountId,
      'suspended',
      'report'
    )
    // Cached for 30 seconds per isolate.
    expect((await call('/active', bearer(session.accessToken))).status).toBe(200)
    vi.setSystemTime(START + 30_000)
    const refused = await call('/active', bearer(session.accessToken))
    expect(refused.status).toBe(403)
    expect(refused.body.code).toBe('suspended')
    // A suspended account still gets through routes that don't ask.
    expect((await call('/bearer', bearer(session.accessToken))).status).toBe(200)
  })

  it('reads the token from the header only', () => {
    expect(bearerToken('Bearer a.b.c')).toBe('a.b.c')
    expect(bearerToken('bearer  a.b.c ')).toBe('a.b.c')
    expect(bearerToken('Bearer a b')).toBeNull()
    expect(bearerToken(undefined)).toBeNull()
  })
})

describe('bearerOrLegacy', () => {
  it('takes a request with Authorization as bearer, never as legacy', async () => {
    const session = await openTestSession(accounts, h.env)
    const ok = await call('/either', bearer(session.accessToken))
    expect(ok.body).toMatchObject({ via: 'bearer', accountId: session.accountId })
    const bad = await call('/either', bearer('not-a-token'))
    expect(bad.status).toBe(401)
    const empty = await call('/either', { authorization: '' })
    expect(empty.status).toBe(401)
  })

  it('serves a legacy request while the switch is on, and 426 once it’s off', async () => {
    expect((await call('/either')).body).toEqual({ via: 'legacy' })
    await h.kv.put('auth:legacy', 'off')
    const refused = await call('/either')
    expect(refused.status).toBe(426)
    expect(refused.body).toEqual({
      ok: false,
      error: 'upgrade_required',
      code: 'upgrade_required',
    })
    expect(refused.headers.get('retry-after')).toBeNull()
    // Bearer requests don't care.
    const session = await openTestSession(accounts, h.env)
    expect((await call('/either', bearer(session.accessToken))).status).toBe(200)
  })
})

describe('the legacy switch', () => {
  const read = async (kv: string | null, AUTH_LEGACY?: string) => {
    const store = makeMemoryKv()
    if (kv != null) await store.put('auth:legacy', kv)
    return isLegacyAuthEnabled({ NOTES_KV: store, AUTH_LEGACY })
  }

  it('is on unless KV or the var says off', async () => {
    expect(await read(null)).toBe(true)
    expect(await read('off')).toBe(false)
    expect(await read(' OFF ')).toBe(false)
    expect(await read('false')).toBe(false)
    expect(await read('on', 'off')).toBe(true)
    expect(await read(null, 'off')).toBe(false)
    expect(await read('garbage', 'off')).toBe(false)
    expect(await read('garbage')).toBe(true)
    expect(await read(null, 'on')).toBe(true)
  })

  it('counts a failed KV read as off, whatever the var says (ADR 0038 §11)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const failing = {
      get: async () => {
        throw new Error('kv down')
      },
    }
    expect(await isLegacyAuthEnabled({ NOTES_KV: failing, AUTH_LEGACY: 'off' })).toBe(false)
    expect(await isLegacyAuthEnabled({ NOTES_KV: failing, AUTH_LEGACY: 'on' })).toBe(false)
    expect(await isLegacyAuthEnabled({ NOTES_KV: failing })).toBe(false)
  })
})
