import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  b64u,
  createHarness,
  randomBytes,
  randomId,
  sha256B64u,
  type Harness,
} from '../test/buddies'
import {
  accountEnvelope,
  bearer,
  openTestSession,
  postJson,
  requestJson,
  type TestSession,
} from '../test/accounts'
import { resetAccountStatusCache } from './auth'
import { createAccountsRoutes } from './route'
import { ACCOUNT_LIMITS } from './contracts'
import { isSessionLive, revokeSession } from './sessionStore'
import { accountsDb } from './store'

/**
 * A session that has ended keeps a valid access token for up to 15 minutes
 * (ADR 0027), but the security surfaces (`requireLiveSession`) refuse it at
 * once with the 401 an expired token gets: the device list, revoking, the
 * activity log, the account, moving the account (handoff), and deleting
 * backups. Two devices can't sign each other out.
 */

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
const app = createAccountsRoutes() as never

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

const post = (path: string, body: unknown, headers?: Record<string, string>) =>
  postJson(app, h.env, path, body, headers)
const get = (path: string, headers?: Record<string, string>) =>
  requestJson(app, h.env, 'GET', path, undefined, headers)
const session = (key?: TestSession['key']) => openTestSession(app, h.env, key)

const expectInvalidToken = (
  response: Awaited<ReturnType<typeof get>>,
  label: string
) => {
  expect(response.status, label).toBe(401)
  expect(response.body, label).toEqual({
    ok: false,
    error: 'unauthorized',
    code: 'unauthorized',
  })
  expect(response.headers.get('www-authenticate'), label).toBe(
    'Bearer error="invalid_token"'
  )
}

/** Every route that refuses an ended session, called as `s`. */
const securitySurfaces = (s: TestSession, other: TestSession) => ({
  'GET /sessions': () => get('/sessions', bearer(s.accessToken)),
  'POST /sessions/revoke': () =>
    post('/sessions/revoke', { sessionId: other.sessionId }, bearer(s.accessToken)),
  'GET /activity': () => get('/activity', bearer(s.accessToken)),
  'GET /account': () => get('/account', bearer(s.accessToken)),
  'POST /account/info': () => post('/account/info', undefined, bearer(s.accessToken)),
  'POST /handoff/open': async () => {
    const token = randomBytes(32)
    return post(
      '/handoff/open',
      { channelId: randomId(), verifier: await sha256B64u(token) },
      bearer(s.accessToken)
    )
  },
  'POST /handoff/send': () =>
    post(
      '/handoff/send',
      { channelId: randomId(), key: b64u(randomBytes(80)) },
      bearer(s.accessToken)
    ),
  'POST /backup/delete': async () =>
    post(
      '/backup/delete',
      await accountEnvelope('backup/delete', s.key, {}),
      bearer(s.accessToken)
    ),
})

describe('a session another device signed out', () => {
  it('can’t sign that device out in return (the verifier’s repro)', async () => {
    const a1 = await session()
    const a3 = await session(a1.key)
    const revoked = await post(
      '/sessions/revoke',
      { sessionId: a3.sessionId },
      bearer(a1.accessToken)
    )
    expect(revoked).toMatchObject({ status: 200, body: { ok: true } })

    // a3's access token hasn't expired, but its session has ended.
    const back = await post(
      '/sessions/revoke',
      { sessionId: a1.sessionId },
      bearer(a3.accessToken)
    )
    expectInvalidToken(back, 'revoke back')
    // a1 is still signed in.
    expect(
      (await post('/sessions/refresh', { refreshToken: a1.refreshToken })).status
    ).toBe(200)
    const listed = await get('/sessions', bearer(a1.accessToken))
    expect(listed.body.sessions.map((x: { sessionId: string }) => x.sessionId)).toEqual(
      [a1.sessionId]
    )
  })

  it('is refused on every security surface, and nothing changes', async () => {
    const a1 = await session()
    const a3 = await session(a1.key)
    await post('/sessions/revoke', { sessionId: a3.sessionId }, bearer(a1.accessToken))
    const before = await get('/activity?limit=100', bearer(a1.accessToken))

    for (const [label, call] of Object.entries(securitySurfaces(a3, a1)))
      expectInvalidToken(await call(), label)

    const after = await get('/activity?limit=100', bearer(a1.accessToken))
    expect(after.body).toEqual(before.body)
    expect(await isSessionLive(accountsDb(h.env.ACCOUNTS_DB!), a1.accountId, a1.sessionId)).toBe(true)
  })

  it('is refused the same after signing itself out, or being replaced', async () => {
    const signedOut = await session()
    const other = await session(signedOut.key)
    const closed = await requestJson(
      app,
      h.env,
      'DELETE',
      '/sessions/current',
      undefined,
      bearer(signedOut.accessToken)
    )
    expect(closed.status).toBe(200)
    for (const [label, call] of Object.entries(securitySurfaces(signedOut, other)))
      expectInvalidToken(await call(), `signed out: ${label}`)
    // Closing again stays idempotent: a device can always sign itself out.
    expect(
      (
        await requestJson(app, h.env, 'DELETE', '/sessions/current', undefined, bearer(signedOut.accessToken))
      ).status
    ).toBe(200)

    // The 10-session cap ends the oldest.
    const oldest = await session()
    for (let i = 0; i < ACCOUNT_LIMITS.sessionsPerAccount; i++) {
      vi.setSystemTime(START + (i + 1) * 1_000)
      await session(oldest.key)
    }
    expectInvalidToken(await get('/sessions', bearer(oldest.accessToken)), 'replaced')
  })

  it('is refused once its session row is gone', async () => {
    const s = await session()
    await h.env.ACCOUNTS_DB!.prepare('DELETE FROM account_sessions WHERE id = ?')
      .bind(s.sessionId)
      .run()
    expectInvalidToken(await get('/activity', bearer(s.accessToken)), 'deleted')
  })

  it('still works elsewhere for the rest of its token (ADR 0027)', async () => {
    const a1 = await session()
    const a3 = await session(a1.key)
    await post('/sessions/revoke', { sessionId: a3.sessionId }, bearer(a1.accessToken))
    expect((await post('/backup/list', {}, bearer(a3.accessToken))).status).toBe(200)
    expect((await get('/supporter', bearer(a3.accessToken))).status).toBe(200)
  })

  it('opens a new session and is served again', async () => {
    const a1 = await session()
    const a3 = await session(a1.key)
    await post('/sessions/revoke', { sessionId: a3.sessionId }, bearer(a1.accessToken))
    expect(
      (await post('/sessions/refresh', { refreshToken: a3.refreshToken })).status
    ).toBe(401)
    const reopened = await session(a1.key)
    expect((await get('/sessions', bearer(reopened.accessToken))).status).toBe(200)
  })
})

describe('two devices revoking each other at once', () => {
  it('lets only the first win, even past the route’s check', async () => {
    const a1 = await session()
    const a3 = await session(a1.key)
    const db = accountsDb(h.env.ACCOUNTS_DB!)
    const revoke = (session: TestSession, by: TestSession) =>
      revokeSession(db, {
        accountId: a1.accountId,
        sessionId: session.sessionId,
        bySessionId: by.sessionId,
      })
    // Both passed `requireLiveSession` a moment ago; a1's revoke lands first.
    expect(await revoke(a3, a1)).toBe('revoked')
    expect(await revoke(a1, a3)).toBe('caller_ended')
    expect(await isSessionLive(db, a1.accountId, a1.sessionId)).toBe(true)
    expect(await isSessionLive(db, a1.accountId, a3.sessionId)).toBe(false)
    const kinds = await h.env.ACCOUNTS_DB!.prepare(
      "SELECT session_id FROM account_activity WHERE kind = 'session.revoked'"
    ).all<{ session_id: string }>()
    expect(kinds.results).toEqual([{ session_id: a3.sessionId }])
    // Repeating the winning revoke stays idempotent.
    expect(await revoke(a3, a1)).toBe('revoked')
  })
})
