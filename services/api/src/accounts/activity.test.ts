import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SigningKey,
  b64u,
  blobOfSize,
  createHarness,
  randomBytes,
  randomId,
  sha256B64u,
  type Harness,
} from '../test/buddies'
import {
  accountEnvelope,
  bearer,
  nextTestIp,
  openTestSession,
  postJson,
  requestJson,
  type TestSession,
} from '../test/accounts'
import { resetAccountStatusCache } from './auth'
import { createAccountsRoutes } from './route'
import { createAccountsAdminRoutes } from './admin'
import { ACTIVITY_LIMITS, pruneActivity } from './activity'
import { accountsDb } from './store'

/**
 * The account activity log and device list (witness-work ADR 0028): each
 * security-relevant action writes one entry for its own account, the list
 * pages newest first, and devices can be listed and signed out.
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
const MINUTE = 60_000
const app = createAccountsRoutes() as never
const adminApp = createAccountsAdminRoutes() as never
const ADMIN_TOKEN = 'activity-test-admin-token'

let h: Harness

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  h = await createHarness()
  h.env.ADMIN_API_TOKEN = ADMIN_TOKEN
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

const device = (name: string) => b64u(new TextEncoder().encode(`sealed:${name}`))
const session = (key?: SigningKey, label?: string) =>
  openTestSession(app, h.env, key, label ? { device: device(label) } : {})

type Entry = {
  id: string
  kind: string
  createdAt: number
  session?: { sessionId: string; platform?: string; device?: string }
  actor?: { sessionId: string; platform?: string; device?: string }
  slotId?: string
}

/** Every entry for the session's account, newest first. */
const activity = async (s: TestSession): Promise<Entry[]> => {
  const response = await get('/activity?limit=100', bearer(s.accessToken))
  expect(response.status).toBe(200)
  return response.body.activity
}
const kinds = async (s: TestSession) => (await activity(s)).map((e) => e.kind)

describe('sessions in the activity log', () => {
  it('logs the account’s creation and each sign-in, with its sealed label', async () => {
    const phone = await session(undefined, 'iPhone')
    vi.setSystemTime(START + MINUTE)
    const tablet = await session(phone.key, 'iPad')
    expect(tablet.accountId).toBe(phone.accountId)

    const entries = await activity(tablet)
    expect(entries.map((e) => e.kind)).toEqual([
      'session.opened',
      'session.opened',
      'account.created',
    ])
    expect(entries[0]).toEqual({
      id: expect.any(String),
      kind: 'session.opened',
      createdAt: START + MINUTE,
      method: 'dev',
      session: {
        sessionId: tablet.sessionId,
        platform: 'dev',
        device: device('iPad'),
      },
    })
    expect(entries[1].session?.device).toBe(device('iPhone'))
    expect(entries[2]).toEqual({
      id: expect.any(String),
      kind: 'account.created',
      createdAt: START,
    })
  })

  it('logs signing out once, keeping the label after the session is gone', async () => {
    const s = await session(undefined, 'Pixel')
    const other = await session(s.key)
    const close = () =>
      requestJson(app, h.env, 'DELETE', '/sessions/current', undefined, bearer(s.accessToken))
    expect((await close()).status).toBe(200)
    expect((await close()).status).toBe(200)

    // Gone from the sessions table (pruned a week after it ended), the entry
    // still names the device.
    h.accountsDb!.db.prepare('DELETE FROM account_sessions WHERE id = ?').run(s.sessionId)
    const [signedOut] = await activity(other)
    expect(signedOut).toMatchObject({
      kind: 'session.signed_out',
      session: { sessionId: s.sessionId, platform: 'dev', device: device('Pixel') },
    })
    expect((await kinds(other)).filter((k) => k === 'session.signed_out')).toHaveLength(1)
  })

  it('logs the sessions the cap ends, naming the new one', async () => {
    const first = await session(undefined, 'Old phone')
    for (let i = 1; i <= 9; i++) {
      vi.setSystemTime(START + i * MINUTE)
      await session(first.key)
    }
    vi.setSystemTime(START + 10 * MINUTE)
    const newest = await session(first.key, 'New phone')
    const replaced = (await activity(newest)).filter((e) => e.kind === 'session.replaced')
    expect(replaced).toHaveLength(1)
    expect(replaced[0]).toMatchObject({
      session: { sessionId: first.sessionId, device: device('Old phone') },
      actor: { sessionId: newest.sessionId, platform: 'dev', device: device('New phone') },
    })
  })

  it('flags a refresh token reused after its grace minute, and not a retry inside it', async () => {
    const s = await session(undefined, 'Phone')
    const refresh = (refreshToken: string) => post('/sessions/refresh', { refreshToken })
    const first = await refresh(s.refreshToken)
    expect(first.status).toBe(200)
    // A lost response: the same token again within the minute.
    expect((await refresh(s.refreshToken)).status).toBe(200)
    expect(await kinds(s)).not.toContain('session.refresh_reused')

    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.setSystemTime(START + 2 * MINUTE)
    expect((await refresh(s.refreshToken)).status).toBe(401)
    // The token just replaced, presented late: a lost answer, by the look of it.
    expect(info).toHaveBeenCalledWith('accounts: refresh token reused', {
      predecessor: true,
      sinceRotationSec: 120,
      platform: 'dev',
    })
    const witness = await session(s.key)
    const [, reused] = await activity(witness)
    expect(reused).toMatchObject({
      kind: 'session.refresh_reused',
      session: { sessionId: s.sessionId, device: device('Phone') },
    })
    // Once ended, more reuse adds nothing.
    expect((await refresh(s.refreshToken)).status).toBe(401)
    expect((await kinds(witness)).filter((k) => k === 'session.refresh_reused')).toHaveLength(1)
    expect(info).toHaveBeenCalledTimes(1)
  })

  it('logs an older replaced token as no predecessor, with no ids or tokens', async () => {
    const s = await session(undefined, 'Phone')
    const refresh = (refreshToken: string) => post('/sessions/refresh', { refreshToken })
    const second = (await refresh(s.refreshToken)).body.refreshToken as string
    vi.setSystemTime(START + 5 * MINUTE)
    expect((await refresh(second)).status).toBe(200)
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.setSystemTime(START + 6 * MINUTE)

    expect((await refresh(s.refreshToken)).status).toBe(401)

    expect(info).toHaveBeenCalledTimes(1)
    expect(info.mock.calls[0]).toEqual([
      'accounts: refresh token reused',
      { predecessor: false, sinceRotationSec: 60, platform: 'dev' },
    ])
    const logged = JSON.stringify(info.mock.calls)
    expect(logged).not.toContain(s.sessionId)
    expect(logged).not.toContain(s.refreshToken)
  })

  it('logs nothing for a forged refresh token, and the session lives on', async () => {
    const s = await session(undefined, 'Phone')
    for (const refreshToken of [
      `${s.sessionId}.${'A'.repeat(43)}.${'A'.repeat(43)}`,
      `${s.sessionId}.not-a-token`,
      'garbage',
    ]) {
      vi.setSystemTime(START + 5 * MINUTE)
      expect((await post('/sessions/refresh', { refreshToken })).status).toBe(401)
    }
    expect(await kinds(s)).not.toContain('session.refresh_reused')
    expect((await post('/sessions/refresh', { refreshToken: s.refreshToken })).status).toBe(200)
  })

  it('logs nothing when a session just expires', async () => {
    const s = await session()
    vi.setSystemTime(START + 91 * 24 * 60 * MINUTE)
    const later = await session(s.key)
    expect(await kinds(later)).toEqual(['session.opened', 'session.opened', 'account.created'])
  })
})

describe('GET /sessions and POST /sessions/revoke', () => {
  it('lists live sessions newest first and marks the caller’s', async () => {
    const phone = await session(undefined, 'Phone')
    vi.setSystemTime(START + MINUTE)
    const tablet = await session(phone.key, 'Tablet')
    vi.setSystemTime(START + 3 * MINUTE)
    await post('/sessions/refresh', { refreshToken: phone.refreshToken })

    const listed = await get('/sessions', bearer(phone.accessToken))
    expect(listed.status).toBe(200)
    expect(listed.body).toEqual({
      ok: true,
      sessions: [
        {
          sessionId: tablet.sessionId,
          platform: 'dev',
          method: 'dev',
          device: device('Tablet'),
          current: false,
          createdAt: START + MINUTE,
          lastActiveAt: START + MINUTE,
          expiresAt: START + MINUTE + 90 * 24 * 60 * MINUTE,
        },
        {
          sessionId: phone.sessionId,
          platform: 'dev',
          method: 'dev',
          device: device('Phone'),
          current: true,
          createdAt: START,
          lastActiveAt: START + 3 * MINUTE,
          expiresAt: START + 90 * 24 * 60 * MINUTE,
        },
      ],
      now: START + 3 * MINUTE,
      stepUpUntil: null,
    })
  })

  it('signs another device out and logs who did it', async () => {
    const phone = await session(undefined, 'Phone')
    const lost = await session(phone.key, 'Lost phone')
    const revoke = (sessionId: string, s = phone) =>
      post('/sessions/revoke', { sessionId }, bearer(s.accessToken))

    expect(await revoke(lost.sessionId)).toMatchObject({ status: 200, body: { ok: true } })
    expect((await post('/sessions/refresh', { refreshToken: lost.refreshToken })).status).toBe(401)
    const listed = await get('/sessions', bearer(phone.accessToken))
    expect(listed.body.sessions.map((x: { sessionId: string }) => x.sessionId)).toEqual([
      phone.sessionId,
    ])

    const [revoked] = await activity(phone)
    expect(revoked).toMatchObject({
      kind: 'session.revoked',
      session: { sessionId: lost.sessionId, device: device('Lost phone') },
      actor: { sessionId: phone.sessionId, device: device('Phone') },
    })
    // Idempotent, and logged once.
    expect((await revoke(lost.sessionId)).status).toBe(200)
    expect((await kinds(phone)).filter((k) => k === 'session.revoked')).toHaveLength(1)
  })

  it('treats revoking the caller’s own session as signing out', async () => {
    const phone = await session()
    const other = await session(phone.key)
    expect(
      (await post('/sessions/revoke', { sessionId: phone.sessionId }, bearer(phone.accessToken)))
        .status
    ).toBe(200)
    expect((await activity(other))[0]).toMatchObject({
      kind: 'session.signed_out',
      session: { sessionId: phone.sessionId },
    })
  })

  it('is 404 for another account’s session or none, and 400 for a bad body', async () => {
    const mine = await session()
    const theirs = await session()
    for (const sessionId of [theirs.sessionId, randomId()]) {
      const refused = await post('/sessions/revoke', { sessionId }, bearer(mine.accessToken))
      expect(refused).toMatchObject({ status: 404, body: { code: 'not_found' } })
    }
    expect((await post('/sessions/refresh', { refreshToken: theirs.refreshToken })).status).toBe(200)
    for (const body of [{}, { sessionId: 'short' }, { sessionId: 7 }]) {
      const refused = await post('/sessions/revoke', body, bearer(mine.accessToken))
      expect(refused.status, JSON.stringify(body)).toBe(400)
    }
  })

  it('needs a bearer token', async () => {
    expect((await get('/sessions')).status).toBe(401)
    expect((await post('/sessions/revoke', { sessionId: randomId() })).status).toBe(401)
    expect((await get('/activity')).status).toBe(401)
  })
})

describe('GET /activity', () => {
  it('pages newest first by cursor', async () => {
    const s = await session()
    for (let i = 1; i <= 4; i++) {
      vi.setSystemTime(START + i * MINUTE)
      await session(s.key)
    }
    const all = await activity(s)
    expect(all).toHaveLength(6)

    const first = await get('/activity?limit=4', bearer(s.accessToken))
    expect(first.body.activity).toEqual(all.slice(0, 4))
    expect(first.body.nextCursor).toBe(all[3].id)
    const second = await get(
      `/activity?limit=4&before=${first.body.nextCursor}`,
      bearer(s.accessToken)
    )
    expect(second.body).toEqual({ ok: true, activity: all.slice(4), nextCursor: null })
  })

  it('shows only the token’s own account', async () => {
    const mine = await session(undefined, 'Mine')
    const theirs = await session(undefined, 'Theirs')
    const entries = await activity(mine)
    expect(entries.every((e) => e.session == null || e.session.sessionId === mine.sessionId)).toBe(true)
    expect(JSON.stringify(entries)).not.toContain(theirs.sessionId)
    // Another account's cursor is refused, never another account's rows.
    const [theirNewest] = await activity(theirs)
    const crossed = await get(`/activity?before=${theirNewest.id}`, bearer(mine.accessToken))
    expect(crossed).toMatchObject({ status: 400, body: { code: 'bad_request' } })
  })

  it('hands out ids that are opaque, stable, and say nothing about other accounts', async () => {
    const mine = await session()
    const before = await activity(mine)
    // Other Users act in between; nothing in my ids may reveal it.
    for (let i = 0; i < 5; i++) await session()
    await session(mine.key)
    const after = await activity(mine)
    expect(after.slice(1)).toEqual(before)
    for (const entry of after) {
      expect(entry.id).toMatch(/^[A-Za-z0-9_-]{48}$/)
      expect(entry.id).not.toMatch(/^[0-9]+$/)
    }
    // The row ids behind them aren't consecutive, but the ids can't show it.
    const rows = await h.env.ACCOUNTS_DB!.prepare(
      'SELECT id FROM account_activity WHERE account_id = ? ORDER BY id DESC'
    )
      .bind(mine.accountId)
      .all<{ id: number }>()
    for (const { id: rowId } of rows.results)
      expect(JSON.stringify(after)).not.toContain(`"${rowId}"`)
  })

  it('refuses a forged cursor and a bare row id', async () => {
    const s = await session()
    await session(s.key)
    const [newest] = await activity(s)
    const forged = newest.id.slice(0, 30) + (newest.id[30] === 'A' ? 'B' : 'A') + newest.id.slice(31)
    for (const before of [forged, '2', '9007199254740991']) {
      const refused = await get(`/activity?before=${before}`, bearer(s.accessToken))
      expect(refused, before).toMatchObject({ status: 400, body: { code: 'bad_request' } })
    }
  })

  it('pages on with a cursor from before a token secret rotation', async () => {
    const s = await session()
    for (let i = 0; i < 3; i++) await session(s.key)
    const all = await activity(s)
    const first = await get('/activity?limit=2', bearer(s.accessToken))
    h.env.ACCOUNT_TOKEN_SECRET_PREVIOUS = h.env.ACCOUNT_TOKEN_SECRET
    h.env.ACCOUNT_TOKEN_SECRET = 'rotated-account-token-secret-0123456789'
    const second = await get(`/activity?limit=2&before=${first.body.nextCursor}`, bearer(s.accessToken))
    expect(second.status).toBe(200)
    expect(second.body.activity.map((e: Entry) => e.kind)).toEqual(
      all.slice(2, 4).map((e) => e.kind)
    )
    // New ids are sealed under the new secret; the old cursor dies with it.
    expect(second.body.activity[0].id).not.toBe(all[2].id)
    delete h.env.ACCOUNT_TOKEN_SECRET_PREVIOUS
    const fresh = await session(s.key)
    const gone = await get(`/activity?before=${first.body.nextCursor}`, bearer(fresh.accessToken))
    expect(gone.status).toBe(400)
  })

  it('refuses a malformed limit or cursor', async () => {
    const s = await session()
    for (const query of ['limit=0', 'limit=101', 'limit=abc', 'limit=1.5', 'before=0', 'before=x', 'before=-1']) {
      const refused = await get(`/activity?${query}`, bearer(s.accessToken))
      expect(refused.status, query).toBe(400)
      expect(refused.body.code).toBe('bad_request')
    }
  })

  it('works for a suspended account', async () => {
    const s = await session()
    await suspend(s.accountId, 'suspended')
    expect((await get('/activity', bearer(s.accessToken))).status).toBe(200)
    expect((await get('/sessions', bearer(s.accessToken))).status).toBe(200)
  })
})

// --- Backup and handoff ------------------------------------------------------

const putSlot = async (s: TestSession, slotId: string) => {
  const bytes = randomBytes(1_024)
  const response = await (app as { request: typeof fetch }).request(
    '/backup/put',
    {
      method: 'POST',
      headers: {
        ...bearer(s.accessToken),
        'content-type': 'application/octet-stream',
        'cf-connecting-ip': nextTestIp(),
        'x-ww-slot-id': slotId,
        'x-ww-sha256': await sha256B64u(bytes),
        'content-length': String(bytes.byteLength),
      },
      body: bytes,
      duplex: 'half',
    } as RequestInit,
    h.env as never
  )
  expect(response.status).toBe(200)
}

const download = async (s: TestSession, slotId: string) => {
  const response = await (app as { request: typeof fetch }).request(
    '/backup/get',
    {
      method: 'POST',
      headers: { ...bearer(s.accessToken), 'content-type': 'application/json' },
      body: JSON.stringify({ slotId }),
    },
    h.env as never
  )
  await response.arrayBuffer()
  return response.status
}

const deleteBackup = async (s: TestSession, fields: Record<string, unknown>) =>
  post(
    '/backup/delete',
    await accountEnvelope('backup/delete', s.key, fields),
    bearer(s.accessToken)
  )

describe('backup in the activity log', () => {
  it('logs deleting a slot that exists, and every slot, but not a missing one', async () => {
    const s = await session(undefined, 'Phone')
    const [a, b, c] = [randomId(), randomId(), randomId()]
    for (const slotId of [a, b, c]) await putSlot(s, slotId)

    expect((await deleteBackup(s, { slotId: a })).status).toBe(200)
    expect((await deleteBackup(s, { slotId: a })).status).toBe(200)
    expect((await deleteBackup(s, { slotId: randomId() })).status).toBe(200)
    expect((await deleteBackup(s, {})).status).toBe(200)
    expect((await deleteBackup(s, {})).status).toBe(200)
    expect(h.backups.objects.size).toBe(0)

    const deleted = (await activity(s)).filter((e) => e.kind === 'backup.deleted')
    expect(deleted).toEqual([
      {
        id: expect.any(String),
        kind: 'backup.deleted',
        createdAt: START,
        session: { sessionId: s.sessionId, platform: 'dev', device: device('Phone') },
      },
      {
        id: expect.any(String),
        kind: 'backup.deleted',
        createdAt: START,
        session: { sessionId: s.sessionId, platform: 'dev', device: device('Phone') },
        slotId: a,
      },
    ])
  })

  it('logs a download once per slot, session, and day', async () => {
    const s = await session()
    const other = await session(s.key)
    const slotId = randomId()
    await putSlot(s, slotId)
    expect(await download(s, slotId)).toBe(200)
    expect(await download(s, slotId)).toBe(200)
    expect(await download(other, slotId)).toBe(200)
    expect(await download(s, randomId())).toBe(404)
    vi.setSystemTime(START + ACTIVITY_LIMITS.downloadDedupeMs + 1)
    // Same session, a fresh access token.
    const refreshed = await post('/sessions/refresh', { refreshToken: s.refreshToken })
    expect(await download({ ...s, accessToken: refreshed.body.accessToken }, slotId)).toBe(200)

    const downloads = (await activity({ ...s, accessToken: refreshed.body.accessToken })).filter(
      (e) => e.kind === 'backup.downloaded'
    )
    expect(downloads.map((e) => [e.session?.sessionId, e.slotId])).toEqual([
      [s.sessionId, slotId],
      [other.sessionId, slotId],
      [s.sessionId, slotId],
    ])
  })

  it('logs a legacy delete without a session', async () => {
    const s = await session()
    const slotId = randomId()
    await putSlot(s, slotId)
    const legacy = await post('/backup/delete', await accountEnvelope('backup/delete', s.key, { slotId }))
    expect(legacy.status).toBe(200)
    const [deleted] = await activity(s)
    expect(deleted).toEqual({
      id: expect.any(String),
      kind: 'backup.deleted',
      createdAt: START,
      slotId,
    })
  })
})

describe('handoff in the activity log', () => {
  it('logs the old phone sending the key, once', async () => {
    const s = await session(undefined, 'Old phone')
    const token = randomBytes(16)
    const channelId = randomId()
    const auth = bearer(s.accessToken)
    await post('/handoff/open', { channelId, verifier: await sha256B64u(token) }, auth)
    expect(
      (
        await post('/handoff/claim', {
          channelId,
          claimToken: b64u(token),
          claimPub: (await SigningKey.generate()).publicKey,
          hello: blobOfSize(200),
        })
      ).status
    ).toBe(200)
    expect(await kinds(s)).not.toContain('handoff.sent')
    expect((await post('/handoff/send', { channelId, key: blobOfSize(80) }, auth)).status).toBe(200)
    expect((await post('/handoff/send', { channelId, key: blobOfSize(80) }, auth)).status).toBe(409)

    const sent = (await activity(s)).filter((e) => e.kind === 'handoff.sent')
    expect(sent).toEqual([
      {
        id: expect.any(String),
        kind: 'handoff.sent',
        createdAt: START,
        session: { sessionId: s.sessionId, platform: 'dev', device: device('Old phone') },
      },
    ])
  })
})

// --- Status, legacy registration, retention ----------------------------------

const suspend = (accountId: string, status: 'suspended' | 'active') =>
  postJson(
    adminApp,
    h.env,
    '/status',
    { accountId, status, reason: 'report' },
    { 'x-ww-admin-token': ADMIN_TOKEN }
  )

describe('status changes in the activity log', () => {
  it('logs suspension and reinstatement once each, without the reason', async () => {
    const s = await session()
    expect((await suspend(s.accountId, 'suspended')).status).toBe(200)
    expect((await suspend(s.accountId, 'suspended')).status).toBe(200)
    expect((await suspend(s.accountId, 'active')).status).toBe(200)
    const entries = await activity(s)
    expect(entries.slice(0, 2)).toEqual([
      { id: expect.any(String), kind: 'account.reinstated', createdAt: START },
      { id: expect.any(String), kind: 'account.suspended', createdAt: START },
    ])
    expect(JSON.stringify(entries)).not.toContain('report')
  })
})

describe('legacy registration', () => {
  it('logs account.created once, without a session', async () => {
    const key = await SigningKey.generate()
    for (let i = 0; i < 2; i++)
      expect(
        (await post('/account/register', await accountEnvelope('account/register', key))).status
      ).toBe(200)
    const s = await session(key)
    expect(await kinds(s)).toEqual(['session.opened', 'account.created'])
  })
})

describe('retention', () => {
  it('prunes entries older than 400 days', async () => {
    const s = await session()
    vi.setSystemTime(START + ACTIVITY_LIMITS.retentionMs - MINUTE)
    const later = await session(s.key)
    const db = accountsDb(h.accountsDb as unknown as D1Database)
    expect(await pruneActivity(db, START + ACTIVITY_LIMITS.retentionMs + 1)).toBe(2)
    expect(await kinds(later)).toEqual(['session.opened'])
  })
})
