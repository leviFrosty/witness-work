import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SigningKey,
  TEST_DEV_BYPASS,
  b64u,
  createHarness,
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

/**
 * Renewing a phone's session (witness-work `docs/accounts-protocol.md`,
 * "Renewing a session"): the open's own proof (the account key's envelope and
 * a fresh attestation) plus the live session's bearer token and its id in
 * `renews`. The new session replaces the old one (`renewed`), logged as one
 * `session.renewed` naming both, so the User's own phone doesn't show up as a
 * new sign-in every 90 days.
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
const SECOND = 1_000
const MINUTE = 60 * SECOND
const DAY = 24 * 60 * MINUTE
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

const BYPASS = { 'x-ww-dev-bypass': TEST_DEV_BYPASS }
const post = (path: string, body: unknown, headers?: Record<string, string>) =>
  postJson(app, h.env, path, body, headers)
const get = (path: string, accessToken: string) =>
  requestJson(app, h.env, 'GET', path, undefined, bearer(accessToken))
const advance = (ms: number) => vi.setSystemTime(Date.now() + ms)
const label = (name: string) => b64u(new TextEncoder().encode(`sealed:${name}`))

const open = (key?: SigningKey, fields: Record<string, unknown> = {}) =>
  openTestSession(app, h.env, key, fields)

/** `POST /sessions` renewing `session`, signed by `key` (its own by default). */
const renew = async (
  session: TestSession,
  {
    key = session.key,
    renews = session.sessionId,
    accessToken = session.accessToken,
    fields = {},
    headers = BYPASS,
  }: {
    key?: SigningKey
    renews?: string
    accessToken?: string | null
    fields?: Record<string, unknown>
    headers?: Record<string, string>
  } = {}
) =>
  post('/sessions', await accountEnvelope('session/open', key, { renews, ...fields }), {
    ...headers,
    ...(accessToken === null ? {} : bearer(accessToken)),
  })

type Row = Record<string, unknown>
const sessionRows = (): Row[] =>
  h.accountsDb!.db.prepare('SELECT * FROM account_sessions').all() as Row[]
const sessionRow = (id: string) => sessionRows().find((row) => row.id === id)!
const liveIds = () =>
  sessionRows()
    .filter((row) => row.revoked_at == null && (row.expires_at as number) > Date.now())
    .map((row) => row.id)
const activityRows = (): Row[] =>
  h.accountsDb!.db
    .prepare('SELECT * FROM account_activity ORDER BY id')
    .all() as Row[]

describe('renewing a session', () => {
  it('opens a new session in place of the live one, logged as one session.renewed', async () => {
    const old = await open(undefined, {
      device: label('iPhone'),
      appVersion: '7.1.0',
      capabilities: ['sync-everyone'],
    })
    advance(85 * DAY)
    // Its access token is long gone: a refresh gets one, as the app's would.
    const refreshed = await post('/sessions/refresh', { refreshToken: old.refreshToken })
    expect(refreshed.status).toBe(200)
    const renewed = await renew(old, {
      accessToken: refreshed.body.accessToken,
      fields: { device: label('iPhone 2'), appVersion: '7.2.0' },
    })
    expect(renewed.status).toBe(201)
    expect(renewed.headers.get('location')).toBe('/accounts/v1/sessions/current')
    expect(renewed.body).toEqual({
      ok: true,
      accountId: old.accountId,
      status: 'active',
      sessionId: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
      platform: 'dev',
      accessToken: expect.any(String),
      accessExpiresAt: Date.now() + 15 * MINUTE,
      refreshToken: expect.any(String),
      // A full 90 days from the renewal.
      sessionExpiresAt: Date.now() + 90 * DAY,
    })
    const { sessionId } = renewed.body
    expect(sessionId).not.toBe(old.sessionId)

    // The old session ended as renewed; the new one keeps what it sent and
    // the rest of the old one's facts.
    expect(sessionRow(old.sessionId)).toMatchObject({
      revoked_at: Date.now(),
      ended_reason: 'renewed',
    })
    expect(sessionRow(sessionId)).toMatchObject({
      account_id: old.accountId,
      platform: 'dev',
      method: 'dev',
      device: label('iPhone 2'),
      app_version: '7.2.0',
      capabilities: JSON.stringify(['sync-everyone']),
      revoked_at: null,
    })
    expect(liveIds()).toEqual([sessionId])

    // One entry, about the new session and naming the old one; no
    // session.opened, signed_out or revoked.
    expect(activityRows().map((row) => row.kind)).toEqual([
      'account.created',
      'session.opened',
      'session.renewed',
    ])
    const list = await get('/activity', renewed.body.accessToken)
    expect(list.status).toBe(200)
    expect(list.body.activity[0]).toEqual({
      id: expect.any(String),
      kind: 'session.renewed',
      createdAt: Date.now(),
      method: 'dev',
      session: { sessionId, platform: 'dev', device: label('iPhone 2') },
      actor: { sessionId: old.sessionId, platform: 'dev', device: label('iPhone') },
    })
  })

  it('keeps the old session’s label, app version and capabilities when the renewal leaves them out', async () => {
    const old = await open(undefined, {
      device: label('Pixel'),
      appVersion: '7.1.0',
      capabilities: ['sync-everyone'],
    })
    const renewed = await renew(old)
    expect(renewed.status).toBe(201)
    expect(sessionRow(renewed.body.sessionId)).toMatchObject({
      device: label('Pixel'),
      app_version: '7.1.0',
      capabilities: JSON.stringify(['sync-everyone']),
    })
  })

  it('ends the old session’s tokens: its refresh says renewed, and live routes refuse its access token', async () => {
    const old = await open()
    expect((await renew(old)).status).toBe(201)
    const refreshed = await post('/sessions/refresh', { refreshToken: old.refreshToken })
    expect(refreshed.status).toBe(401)
    expect(refreshed.body).toMatchObject({ code: 'unauthorized', reason: 'renewed' })
    expect((await get('/sessions', old.accessToken)).status).toBe(401)
  })

  it('lists the new session as the device, not both', async () => {
    const old = await open(undefined, { device: label('iPhone') })
    const other = await open(old.key, { device: label('iPad') })
    const renewed = await renew(old)
    const list = await get('/sessions', renewed.body.accessToken)
    expect(list.body.sessions.map((s: { sessionId: string }) => s.sessionId).sort()).toEqual(
      [renewed.body.sessionId, other.sessionId].sort()
    )
  })

  it('never ends another device’s session at the 10-session cap', async () => {
    const key = await SigningKey.generate()
    const sessions: TestSession[] = []
    for (let i = 0; i < 10; i++) {
      sessions.push(await open(key))
      advance(SECOND)
    }
    // The oldest renews, then one in the middle: still 10 live, the same
    // devices, and nothing replaced.
    const first = await renew(sessions[0])
    expect(first.status).toBe(201)
    advance(SECOND)
    const middle = await renew(sessions[5])
    expect(middle.status).toBe(201)
    const expected = [
      ...sessions.filter((_, i) => i !== 0 && i !== 5).map((s) => s.sessionId),
      first.body.sessionId,
      middle.body.sessionId,
    ]
    expect(liveIds().sort()).toEqual(expected.sort())
    expect(activityRows().some((row) => row.kind === 'session.replaced')).toBe(false)
  })

  it('counts against the daily opens like an open', async () => {
    let session = await open()
    for (let i = 0; i < 19; i++) {
      const renewed = await renew(session)
      expect(renewed.status).toBe(201)
      session = { ...session, ...renewed.body }
    }
    const refused = await renew(session)
    expect(refused.status).toBe(429)
    expect(liveIds()).toEqual([session.sessionId])
  })
})

describe('refusing a renewal', () => {
  /** Nothing opened and nothing logged since `before`. */
  const unchanged = (before: { sessions: number; activity: number }) => {
    expect(sessionRows()).toHaveLength(before.sessions)
    expect(activityRows()).toHaveLength(before.activity)
  }
  const counts = () => ({
    sessions: sessionRows().length,
    activity: activityRows().length,
  })

  it('needs the session’s bearer token', async () => {
    const old = await open()
    const before = counts()
    const refused = await renew(old, { accessToken: null })
    expect(refused.status).toBe(401)
    expect(refused.body.code).toBe('unauthorized')
    expect(refused.headers.get('www-authenticate')).toContain('Bearer')
    const forged = await renew(old, { accessToken: 'not.a.token' })
    expect(forged.status).toBe(401)
    unchanged(before)
    expect(liveIds()).toEqual([old.sessionId])
  })

  it('refuses a bearer token for another session than the one it names', async () => {
    const old = await open()
    const other = await open(old.key)
    const before = counts()
    const refused = await renew(old, { accessToken: other.accessToken })
    expect(refused.status).toBe(401)
    unchanged(before)
    expect(liveIds().sort()).toEqual([old.sessionId, other.sessionId].sort())
  })

  it('refuses a session another account’s key signs for', async () => {
    const victim = await open()
    const thief = await open()
    const before = counts()
    // The victim's token and session id, with the thief's own key: the
    // thief's key can't take over the victim's session.
    const refused = await renew(victim, { key: thief.key })
    expect(refused.status).toBe(401)
    unchanged(before)
    expect(liveIds().sort()).toEqual([victim.sessionId, thief.sessionId].sort())
  })

  it('refuses a session that was signed out or revoked', async () => {
    const old = await open()
    const closed = await requestJson(
      app,
      h.env,
      'DELETE',
      '/sessions/current',
      undefined,
      bearer(old.accessToken)
    )
    expect(closed.status).toBe(200)
    const before = counts()
    // Its access token hasn't expired yet, but its session has ended.
    const refused = await renew(old)
    expect(refused.status).toBe(401)
    unchanged(before)

    const phone = await open()
    const other = await open(phone.key)
    expect(
      (await post('/sessions/revoke', { sessionId: phone.sessionId }, bearer(other.accessToken)))
        .status
    ).toBe(200)
    const afterRevoke = counts()
    expect((await renew(phone)).status).toBe(401)
    unchanged(afterRevoke)
  })

  it('refuses an expired session', async () => {
    const old = await open()
    advance(90 * DAY)
    const before = counts()
    const refused = await renew(old)
    expect(refused.status).toBe(401)
    unchanged(before)
  })

  it('renews a session once: the old token can’t renew again, nor two at once', async () => {
    const old = await open()
    const [a, b] = await Promise.all([renew(old), renew(old)])
    expect([a.status, b.status].sort()).toEqual([201, 401])
    expect((await renew(old)).status).toBe(401)
    expect(liveIds()).toHaveLength(1)
    expect(activityRows().filter((row) => row.kind === 'session.renewed')).toHaveLength(1)
  })

  it('refuses without an attestation, ending nothing', async () => {
    const old = await open()
    const before = counts()
    const refused = await renew(old, { headers: {} })
    expect(refused.status).toBe(400)
    expect(refused.body).toMatchObject({ code: 'bad_request', reason: 'invalid_request' })
    unchanged(before)
    expect(liveIds()).toEqual([old.sessionId])
  })

  it('refuses a malformed renews, or one alongside a ticket', async () => {
    const old = await open()
    expect((await renew(old, { renews: 'short' })).status).toBe(400)
    expect((await renew(old, { fields: { ticket: 'x' } })).status).toBe(400)
    expect(liveIds()).toEqual([old.sessionId])
  })
})

describe('after a renewal', () => {
  const refresh = (refreshToken: string) =>
    post('/sessions/refresh', { refreshToken })
  const revoke = (sessionId: string, by: TestSession) =>
    post('/sessions/revoke', { sessionId }, bearer(by.accessToken))
  const kinds = () => activityRows().map((row) => row.kind)

  it('ends a successor nobody refreshed when the old session’s token comes back', async () => {
    // The device lost the renewal's answer (or never saved it) and still holds
    // the old session: the successor would otherwise sit there for 90 days.
    const old = await open(undefined, { device: label('iPhone') })
    const renewed = await renew(old)
    const ghost = renewed.body.sessionId as string
    const refused = await refresh(old.refreshToken)
    expect(refused.status).toBe(401)
    expect(refused.body.reason).toBe('renewed')
    expect(sessionRow(ghost)).toMatchObject({
      revoked_at: Date.now(),
      ended_reason: 'signed_out',
    })
    expect(liveIds()).toEqual([])
    expect(activityRows().at(-1)).toMatchObject({
      kind: 'session.signed_out',
      session_id: ghost,
      session_device: label('iPhone'),
    })
    // Once is enough: the same token again changes nothing more.
    const before = activityRows().length
    expect((await refresh(old.refreshToken)).status).toBe(401)
    expect(activityRows()).toHaveLength(before)
  })

  it('leaves a successor its device has refreshed', async () => {
    const old = await open()
    const renewed = await renew(old)
    expect((await refresh(renewed.body.refreshToken)).status).toBe(200)
    const refused = await refresh(old.refreshToken)
    expect(refused.status).toBe(401)
    expect(refused.body.reason).toBe('renewed')
    expect(liveIds()).toEqual([renewed.body.sessionId])
    expect(kinds().at(-1)).toBe('session.renewed')
  })

  it('signs out the live successor when another device signs out the old id', async () => {
    const phone = await open(undefined, { device: label('iPhone') })
    const other = await open(phone.key)
    // Renewed twice: the old id leads to the newest session.
    const first = await renew(phone)
    const second = await renew({ ...phone, ...first.body })
    const newest = second.body.sessionId as string

    const revoked = await revoke(phone.sessionId, other)
    expect(revoked.status).toBe(200)
    expect(sessionRow(newest)).toMatchObject({ ended_reason: 'revoked' })
    expect(liveIds()).toEqual([other.sessionId])
    expect(activityRows().at(-1)).toMatchObject({
      kind: 'session.revoked',
      session_id: newest,
      actor_session_id: other.sessionId,
    })
    const refused = await refresh(second.body.refreshToken)
    expect(refused.body.reason).toBe('revoked')
  })

  it('signs the caller out when the old id it signs out was its own', async () => {
    const phone = await open()
    const renewed = await renew(phone)
    const self = { ...phone, ...renewed.body }
    expect((await revoke(phone.sessionId, self)).status).toBe(200)
    expect(sessionRow(self.sessionId)).toMatchObject({ ended_reason: 'signed_out' })
    expect(liveIds()).toEqual([])
  })

  it('still answers 404 for another account’s renewed session', async () => {
    const victim = await open()
    await renew(victim)
    const stranger = await open()
    expect((await revoke(victim.sessionId, stranger)).status).toBe(404)
    expect(liveIds()).toHaveLength(2)
  })
})
