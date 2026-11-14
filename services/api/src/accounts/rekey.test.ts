import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import {
  SigningKey,
  b64u,
  createHarness,
  randomBytes,
  randomId,
  sha256B64u,
  type Harness,
} from '../test/buddies'
import {
  bearer,
  openTestSession,
  postJson,
  requestJson,
  type TestSession,
} from '../test/accounts'
import { PasskeyClient, signedEnvelope } from '../test/passkeys'
import { fakeWrap, type SoftPasskey } from '../test/webauthn'
import type { FakeWebSocket } from '../test/durableObjects'
import type { AppEnv } from '../types'
import { accountSignedMessage, rekeyNewKeyMessage } from './contracts'
import { createAccountsRoutes } from './route'
import { resetAccountStatusCache } from './auth'
import { issueTicket } from './passkeyTokens'
import { accountsDb, setAccountStatus } from './store'
import { accessTokenKeys, verifyAccessToken } from './tokens'
import { resetSyncEntitlementCache } from './sync'
import { accountSupporterStatus } from './supporter'
import { SITEVERIFY_URL } from './turnstile'

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

vi.mock('./supporter', async (original) => ({
  ...(await original<typeof import('./supporter')>()),
  accountSupporterStatus: vi.fn(),
}))

/**
 * Changing the account key (witness-work ADR 0039,
 * `docs/account-key-change.md`): `POST /account/rekey`, retired keys on every
 * way in, `kep` on live-session routes, the key history, re-seal puts, and
 * opening a session into a known account.
 */

const START = Date.UTC(2026, 9, 30, 12)
const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const app = new Hono<AppEnv>().route('/', createAccountsRoutes()) as never

let h: Harness
let client: PasskeyClient

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  h = await createHarness()
  resetAccountStatusCache()
  resetSyncEntitlementCache()
  vi.mocked(accountSupporterStatus).mockResolvedValue({
    supporter: true,
    expiresAt: null,
    customers: 1,
  })
  h.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA'
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) !== SITEVERIFY_URL) throw new Error(`unexpected fetch ${input}`)
      return Response.json({ success: true, hostname: 'example.com', action: '', 'error-codes': [] })
    })
  )
  client = new PasskeyClient((method, path, body, headers = {}) =>
    requestJson(app, h.env, method, path, body, headers)
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const advance = (ms: number) => vi.setSystemTime(Date.now() + ms)
const send = (method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
  requestJson(app, h.env, method, path, body, headers)
const phone = (key?: SigningKey, fields?: Record<string, unknown>) =>
  openTestSession(app, h.env, key, fields)
const sql = (query: string, ...params: (string | number | null)[]) =>
  h.accountsDb!.db.prepare(query).all(...params) as Record<string, unknown>[]
const history = () => b64u(randomBytes(300))
const encoder = new TextEncoder()

/** Who's calling: a session's key and token (a phone's or a browser's). */
type Caller = Pick<TestSession, 'key' | 'accessToken' | 'accountId' | 'sessionId'> & {
  refreshToken: string
}

/** A rekey envelope from `caller.key` to `newKey`, both signatures as given. */
const rekeyBody = async (
  caller: Pick<Caller, 'key'>,
  newKey: SigningKey,
  fields: Record<string, unknown> = {},
  {
    oldSigner = caller.key,
    newSigner = newKey,
    newOp = 'new',
  }: { oldSigner?: SigningKey; newSigner?: SigningKey; newOp?: 'new' | 'old' } = {}
) => {
  const bytes = encoder.encode(
    JSON.stringify({
      accountPub: caller.key.publicKey,
      ts: Date.now(),
      nonce: randomId(),
      newAccountPub: newKey.publicKey,
      keyEpoch: 0,
      history: history(),
      ...fields,
    })
  )
  return {
    payload: b64u(bytes),
    signature: b64u(await oldSigner.sign(accountSignedMessage('account/rekey', bytes))),
    newSignature: b64u(
      await newSigner.sign(
        newOp === 'new' ? rekeyNewKeyMessage(bytes) : accountSignedMessage('account/rekey', bytes)
      )
    ),
  }
}

const rekeyWith = (caller: Pick<Caller, 'accessToken'>, body: unknown) =>
  send('POST', '/account/rekey', body, bearer(caller.accessToken))

/** Changes `caller`'s key to a fresh one; returns the caller under it. */
const rekey = async (
  caller: Caller,
  fields: Record<string, unknown> = {}
) => {
  const newKey = await SigningKey.generate()
  const account = await send('GET', '/account', undefined, bearer(caller.accessToken))
  const response = await rekeyWith(
    caller,
    await rekeyBody(caller, newKey, { keyEpoch: account.body.keyEpoch, ...fields })
  )
  return {
    response,
    newKey,
    caller: { ...caller, key: newKey, accessToken: response.body.accessToken ?? caller.accessToken },
  }
}

/** `caller` with a fresh access token, after time moved on. */
const fresh = async <C extends Caller>(caller: C): Promise<C> => {
  const refreshed = await refresh(caller)
  expect(refreshed.status).toBe(200)
  return {
    ...caller,
    accessToken: refreshed.body.accessToken,
    refreshToken: refreshed.body.refreshToken,
  }
}

const account = (caller: Pick<Caller, 'accessToken'>) =>
  send('GET', '/account', undefined, bearer(caller.accessToken))
const refresh = (caller: Pick<Caller, 'refreshToken'>) =>
  send('POST', '/sessions/refresh', { refreshToken: caller.refreshToken })
const activity = async (caller: Pick<Caller, 'accessToken'>) =>
  (await send('GET', '/activity', undefined, bearer(caller.accessToken))).body.activity as {
    kind: string
    session?: { sessionId: string }
    actor?: { sessionId: string }
  }[]

/** A phone account with one passkey (wrapped at epoch 0). */
const accountWithPasskey = async () => {
  const session = await phone()
  const wrapId = randomId()
  const registered = await client.register(session, { extra: { wrapId, wrap: fakeWrap() } })
  expect(registered.added.status).toBe(200)
  return { session, passkey: registered.passkey, wrapId }
}

/** A browser session for `key`'s account, opened with a passkey sign-in. */
const webSession = async (key: SigningKey, passkey: SoftPasskey): Promise<Caller> => {
  const { assert } = await client.signIn(passkey)
  expect(assert.status).toBe(200)
  const { reply } = await client.openWeb(key, assert.body.ticket)
  expect(reply.status).toBe(201)
  return { key, ...reply.body }
}

describe('POST /account/rekey from a phone', () => {
  it('swaps the key, raises the epoch, and answers a token with the new epoch', async () => {
    const s = await phone(undefined, { appVersion: '1.47.0' })
    const before = await account(s)
    expect(before.body).toMatchObject({ accountPub: s.key.publicKey, keyEpoch: 0 })

    const { response, newKey, caller } = await rekey(s)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      ok: true,
      keyEpoch: 1,
      accessToken: expect.any(String),
      accessExpiresAt: START + 15 * MINUTE,
    })
    const keys = (await accessTokenKeys(h.env))!
    expect(await verifyAccessToken(keys, response.body.accessToken)).toMatchObject({
      accountId: s.accountId,
      sessionId: s.sessionId,
      keyEpoch: 1,
    })

    const after = await account(caller)
    expect(after.body).toMatchObject({
      accountId: s.accountId,
      accountPub: newKey.publicKey,
      keyEpoch: 1,
    })
    expect(sql('SELECT account_id, key_epoch, retired_at FROM retired_account_keys WHERE account_pub = ?', s.key.publicKey))
      .toEqual([{ account_id: s.accountId, key_epoch: 0, retired_at: START }])
    expect(sql('SELECT key_changed_at FROM accounts WHERE id = ?', s.accountId)).toEqual([
      { key_changed_at: START },
    ])
  })

  it('keeps the caller: its refresh token refreshes with the new epoch', async () => {
    const s = await phone()
    const { caller } = await rekey(s)
    // The token from before the change is refused on live-session routes...
    const stale = await send('GET', '/sessions', undefined, bearer(s.accessToken))
    expect(stale.status).toBe(401)
    expect(stale.body).toMatchObject({ code: 'unauthorized', reason: 'key_changed' })
    expect(stale.headers.get('www-authenticate')).toContain('Bearer')
    // ...the new one works...
    expect((await send('GET', '/sessions', undefined, bearer(caller.accessToken))).status).toBe(200)
    // ...and so does a refresh, carrying the new epoch.
    const refreshed = await refresh(s)
    expect(refreshed.status).toBe(200)
    const keys = (await accessTokenKeys(h.env))!
    expect((await verifyAccessToken(keys, refreshed.body.accessToken))!.keyEpoch).toBe(1)
    expect(
      (await send('GET', '/sessions', undefined, bearer(refreshed.body.accessToken))).status
    ).toBe(200)
  })

  it('ends every other session, whose refresh then fails, and logs it', async () => {
    const s = await phone()
    const other = await phone(s.key)
    const third = await phone(s.key)
    const { caller } = await rekey(s)
    const [{ key_changed_at: changedAt }] = sql(
      'SELECT key_changed_at FROM accounts WHERE id = ?',
      s.accountId
    )
    // Later than the change: the refusal says when the key changed, not now.
    advance(60_000)

    for (const ended of [other, third]) {
      expect((await send('GET', '/sessions', undefined, bearer(ended.accessToken))).status).toBe(401)
      const refused = await refresh(ended)
      expect(refused.status).toBe(401)
      expect(refused.body).toMatchObject({
        code: 'unauthorized',
        reason: 'key_changed',
        changedAt,
      })
      expect(refused.body.changedAt).not.toBe(Date.now())
    }
    expect(
      sql('SELECT ended_reason FROM account_sessions WHERE id IN (?, ?)', other.sessionId, third.sessionId)
    ).toEqual([{ ended_reason: 'key_changed' }, { ended_reason: 'key_changed' }])
    const sessions = (await send('GET', '/sessions', undefined, bearer(caller.accessToken))).body.sessions
    expect(sessions.map((row: { sessionId: string }) => row.sessionId)).toEqual([s.sessionId])

    const log = await activity(caller)
    expect(log[0]).toMatchObject({ kind: 'account.key_changed', session: { sessionId: s.sessionId } })
    const revoked = log.filter((entry) => entry.kind === 'session.revoked')
    expect(revoked.map((entry) => entry.session!.sessionId).sort()).toEqual(
      [other.sessionId, third.sessionId].sort()
    )
    expect(revoked.every((entry) => entry.actor?.sessionId === s.sessionId)).toBe(true)
  })

  it('keeps the caller’s capabilities across the change and its refresh', async () => {
    const s = await phone(undefined, { capabilities: ['sync-everyone'] })
    const caps = () => sql('SELECT capabilities FROM account_sessions WHERE id = ?', s.sessionId)
    expect(caps()).toEqual([{ capabilities: '["sync-everyone"]' }])
    expect((await rekey(s)).response.status).toBe(200)
    expect(caps()).toEqual([{ capabilities: '["sync-everyone"]' }])
    expect((await refresh(s)).status).toBe(200)
    expect(caps()).toEqual([{ capabilities: '["sync-everyone"]' }])
  })

  it('stores the caller’s re-sealed device label', async () => {
    const s = await phone(undefined, { device: b64u(randomBytes(40)) })
    const device = b64u(randomBytes(40))
    const { caller } = await rekey(s, { device })
    const sessions = (await send('GET', '/sessions', undefined, bearer(caller.accessToken))).body.sessions
    expect(sessions[0].device).toBe(device)
    expect((await activity(caller))[0]).toMatchObject({ kind: 'account.key_changed' })
  })

  it('works for a suspended account, which stays suspended', async () => {
    const s = await phone()
    await setAccountStatus(accountsDb(h.env.ACCOUNTS_DB!), s.accountId, 'suspended', 'admin')
    const { response, caller } = await rekey(s)
    expect(response.status).toBe(200)
    expect((await account(caller)).body.status).toBe('suspended')
  })

  it('stores the key history and reads it back', async () => {
    const s = await phone()
    expect((await send('GET', '/account/key-history', undefined, bearer(s.accessToken))).body).toEqual({
      ok: true,
      keyEpoch: 0,
      history: null,
    })
    const blob = history()
    const { caller } = await rekey(s, { history: blob })
    expect((await send('GET', '/account/key-history', undefined, bearer(caller.accessToken))).body).toEqual({
      ok: true,
      keyEpoch: 1,
      history: blob,
    })
    const next = history()
    const again = await rekey(caller, { history: next })
    expect(again.response.status).toBe(200)
    expect(
      (await send('GET', '/account/key-history', undefined, bearer(again.caller.accessToken))).body
    ).toEqual({ ok: true, keyEpoch: 2, history: next })
    expect(sql('SELECT COUNT(*) AS n FROM account_key_history')[0].n).toBe(1)
  })

  it('reads the key history only with a live session', async () => {
    const s = await phone()
    const other = await phone(s.key)
    const { caller } = await rekey(s, { history: history() })
    // The change ended the other session; its token is still unexpired.
    const ended = await send('GET', '/account/key-history', undefined, bearer(other.accessToken))
    expect(ended.status).toBe(401)
    expect(ended.body.code).toBe('unauthorized')
    await send('DELETE', '/sessions/current', undefined, bearer(caller.accessToken))
    expect((await send('GET', '/account/key-history', undefined, bearer(caller.accessToken))).status).toBe(401)
  })
})

describe('refusals', () => {
  it('refuses bad signatures by either key', async () => {
    const s = await phone()
    const newKey = await SigningKey.generate()
    const stranger = await SigningKey.generate()
    const cases = [
      await rekeyBody(s, newKey, {}, { oldSigner: stranger }),
      await rekeyBody(s, newKey, {}, { newSigner: stranger }),
      await rekeyBody(s, newKey, {}, { newSigner: s.key }),
      // The new key's signature over the old key's message doesn't count.
      await rekeyBody(s, newKey, {}, { newOp: 'old' }),
      { ...(await rekeyBody(s, newKey)), newSignature: undefined },
    ]
    for (const body of cases) {
      const response = await rekeyWith(s, body)
      expect(response.status).toBe(401)
      expect(response.body.code).toBe('bad_signature')
    }
    expect((await account(s)).body.keyEpoch).toBe(0)
  })

  it('refuses a key that isn’t the token’s account’s', async () => {
    const s = await phone()
    const other = await phone()
    const response = await rekeyWith(s, await rekeyBody(other, await SigningKey.generate()))
    expect(response.status).toBe(403)
    expect(response.body.code).toBe('forbidden')
  })

  it('refuses the same key twice, a new key in use, and a retired one', async () => {
    const s = await phone()
    expect((await rekeyWith(s, await rekeyBody(s, s.key))).body.code).toBe('bad_request')
    const other = await phone()
    const inUse = await rekeyWith(s, await rekeyBody(s, other.key))
    expect(inUse.status).toBe(409)
    expect(inUse.body.code).toBe('conflict')

    // `other` changes its key; its old key is retired and can't be taken.
    await rekey(other)
    const retired = await rekeyWith(s, await rekeyBody(s, other.key))
    expect(retired.status).toBe(409)
    expect(retired.body.code).toBe('conflict')
    expect((await account(s)).body.keyEpoch).toBe(0)
  })

  it('refuses an epoch that moved on with the account’s epoch', async () => {
    const s = await phone()
    const response = await rekeyWith(s, await rekeyBody(s, await SigningKey.generate(), { keyEpoch: 3 }))
    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({ code: 'conflict', keyEpoch: 0 })
  })

  it('never replays an envelope: the same one again is a conflict, and nothing changes', async () => {
    const s = await phone()
    const newKey = await SigningKey.generate()
    const body = await rekeyBody(s, newKey)
    const first = await rekeyWith(s, body)
    expect(first.status).toBe(200)
    const caller = { accessToken: first.body.accessToken }
    const again = await rekeyWith(caller, body)
    expect(again.status).toBe(409)
    expect(again.body).toMatchObject({ code: 'conflict', keyEpoch: 1 })
    expect(sql('SELECT COUNT(*) AS n FROM account_activity WHERE kind = ?', 'account.key_changed')[0].n).toBe(1)
  })

  it('refuses a used nonce with replay', async () => {
    const s = await phone()
    const body = await rekeyBody(s, await SigningKey.generate())
    const { envelopeNonce } = await import('./passkeyStore')
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body.payload.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))))
    const nonce = await envelopeNonce(payload)
    sql('INSERT INTO used_token_ids (id, expires_at) VALUES (?, ?)', nonce.id, nonce.expiresAt)
    const response = await rekeyWith(s, body)
    expect(response.status).toBe(409)
    expect(response.body.code).toBe('replay')
  })

  it('refuses a history or label over its cap, and a stale envelope', async () => {
    const s = await phone()
    const newKey = await SigningKey.generate()
    const big = await rekeyWith(s, await rekeyBody(s, newKey, { history: 'A'.repeat(65_537) }))
    expect(big.status).toBe(413)
    const atCap = await rekeyBody(s, newKey, { history: 'A'.repeat(65_536) })
    const label = await rekeyWith(s, await rekeyBody(s, newKey, { device: 'A'.repeat(513) }))
    expect(label.status).toBe(413)
    const stale = await rekeyWith(s, await rekeyBody(s, newKey, { ts: Date.now() - 10 * MINUTE }))
    expect(stale.body.code).toBe('stale')
    expect((await rekeyWith(s, await rekeyBody(s, newKey, { history: undefined }))).body.code).toBe(
      'bad_request'
    )
    expect((await rekeyWith(s, atCap)).status).toBe(200)
  })

  it('needs a live session', async () => {
    const s = await phone()
    await send('DELETE', '/sessions/current', undefined, bearer(s.accessToken))
    const response = await rekeyWith(s, await rekeyBody(s, await SigningKey.generate()))
    expect(response.status).toBe(401)
    expect((await send('POST', '/account/rekey', await rekeyBody(s, await SigningKey.generate()))).status).toBe(401)
  })

  it('leaves sessions that ended before the change as they ended', async () => {
    const s = await phone()
    const signedOut = await phone(s.key)
    const revoked = await phone(s.key)
    await send('DELETE', '/sessions/current', undefined, bearer(signedOut.accessToken))
    expect(
      (await send('POST', '/sessions/revoke', { sessionId: revoked.sessionId }, bearer(s.accessToken))).status
    ).toBe(200)
    const before = sql(
      'SELECT id, revoked_at, ended_reason FROM account_sessions WHERE id IN (?, ?) ORDER BY id',
      signedOut.sessionId,
      revoked.sessionId
    )
    vi.advanceTimersByTime(1_000)
    expect((await rekey(s)).response.status).toBe(200)

    // A lost device signed out first never reads as ended by the change.
    expect(
      sql(
        'SELECT id, revoked_at, ended_reason FROM account_sessions WHERE id IN (?, ?) ORDER BY id',
        signedOut.sessionId,
        revoked.sessionId
      )
    ).toEqual(before)
    for (const ended of [signedOut, revoked]) {
      const refused = await refresh(ended)
      expect(refused.status).toBe(401)
      expect(refused.body).toMatchObject({ code: 'unauthorized', reason: 'revoked' })
      expect(refused.body.changedAt).toBeUndefined()
    }
  })

  it('leaves a session that expired before the change expired', async () => {
    const s = await phone()
    const lapsed = await phone(s.key)
    sql('UPDATE account_sessions SET expires_at = ? WHERE id = ?', Date.now() - 1, lapsed.sessionId)
    expect((await rekey(s)).response.status).toBe(200)
    expect(sql('SELECT revoked_at, ended_reason FROM account_sessions WHERE id = ?', lapsed.sessionId)).toEqual([
      { revoked_at: null, ended_reason: null },
    ])
    const refused = await refresh(lapsed)
    expect(refused.status).toBe(401)
    expect(refused.body).toMatchObject({ code: 'unauthorized', reason: 'expired' })
    expect(refused.body.changedAt).toBeUndefined()
  })

  it('answers why when the caller’s session ends during the change, not a conflict', async () => {
    for (const reason of ['replaced', 'revoked'] as const) {
      const s = await phone()
      const body = await rekeyBody(s, await SigningKey.generate())
      // The session ends after the request's checks, before its batch runs.
      const d1 = h.env.ACCOUNTS_DB!
      const batch = d1.batch.bind(d1)
      const spy = vi.spyOn(d1, 'batch').mockImplementationOnce(async (statements) => {
        sql(
          'UPDATE account_sessions SET revoked_at = ?, ended_reason = ? WHERE id = ?',
          Date.now(),
          reason,
          s.sessionId
        )
        return batch(statements)
      })
      const answer = await rekeyWith(s, body)
      spy.mockRestore()
      expect(answer.status, reason).toBe(401)
      expect(answer.body).toMatchObject({ code: 'unauthorized', reason })
      expect(sql('SELECT key_epoch FROM accounts WHERE id = ?', s.accountId)).toEqual([{ key_epoch: 0 }])
    }
  })

  it('allows 3 changes a rolling day and 10 a rolling 30 days', async () => {
    let caller: Caller = await phone()
    for (let i = 0; i < 3; i++) {
      const next = await rekey(caller)
      expect(next.response.status).toBe(200)
      advance(HOUR)
      caller = await fresh(next.caller)
    }
    const fourth = await rekey(caller)
    expect(fourth.response.status).toBe(429)
    expect(fourth.response.body.code).toBe('rate_limited')
    // The first change leaves the day 21 hours later (it was 3 hours ago).
    expect(fourth.response.headers.get('retry-after')).toBe(String(21 * 60 * 60))

    for (let i = 3; i < 10; i++) {
      advance(DAY)
      caller = await fresh(caller)
      const next = await rekey(caller)
      expect(next.response.status, `change ${i + 1}`).toBe(200)
      caller = next.caller
    }
    advance(DAY)
    caller = await fresh(caller)
    const eleventh = await rekey(caller)
    expect(eleventh.response.status).toBe(429)
    // A phone session lasts 90 days; this one has 50 left.
    advance(30 * DAY)
    caller = await fresh(caller)
    expect((await rekey(caller)).response.status).toBe(200)
  })
})

describe('two devices at once', () => {
  it('lets exactly one of two concurrent changes win', async () => {
    const a = await phone()
    const b = await phone(a.key)
    const bodies = [
      await rekeyBody(a, await SigningKey.generate()),
      await rekeyBody(b, await SigningKey.generate()),
    ]
    const [first, second] = await Promise.all([rekeyWith(a, bodies[0]), rekeyWith(b, bodies[1])])
    const statuses = [first.status, second.status].sort()
    expect(statuses[0]).toBe(200)
    expect([401, 409]).toContain(statuses[1])
    const winner = first.status === 200 ? first : second
    expect((await account({ accessToken: winner.body.accessToken })).body.keyEpoch).toBe(1)
    expect(sql('SELECT COUNT(*) AS n FROM retired_account_keys')[0].n).toBe(1)
    expect(sql('SELECT COUNT(*) AS n FROM account_activity WHERE kind = ?', 'account.key_changed')[0].n).toBe(1)
    expect(sql('SELECT COUNT(*) AS n FROM account_key_history')[0].n).toBe(1)
  })

  it('lets one of two changes from the same session win, by the epoch alone', async () => {
    const s = await phone()
    const bodies = [
      await rekeyBody(s, await SigningKey.generate()),
      await rekeyBody(s, await SigningKey.generate()),
    ]
    const [first, second] = await Promise.all([rekeyWith(s, bodies[0]), rekeyWith(s, bodies[1])])
    expect([first.status, second.status].sort()).toEqual([200, 409])
    const loser = first.status === 409 ? first : second
    expect(loser.body).toMatchObject({ code: 'conflict', keyEpoch: 1 })
    expect(sql('SELECT key_epoch FROM accounts')).toEqual([{ key_epoch: 1 }])
    expect(sql('SELECT COUNT(*) AS n FROM retired_account_keys')[0].n).toBe(1)
    expect(sql('SELECT COUNT(*) AS n FROM account_activity WHERE kind = ?', 'account.key_changed')[0].n).toBe(1)
  })

  it('answers the loser with 401 once the winner ended its session', async () => {
    const a = await phone()
    const b = await phone(a.key)
    const loserBody = await rekeyBody(b, await SigningKey.generate())
    expect((await rekey(a)).response.status).toBe(200)
    // B's session ended in A's batch.
    const late = await rekeyWith(b, loserBody)
    expect(late.status).toBe(401)
  })
})

describe('a web session', () => {
  /** A phone account with a passkey, and a browser signed in with it. */
  const browser = async () => {
    const { session, passkey, wrapId } = await accountWithPasskey()
    const web = await webSession(session.key, passkey)
    return { session, passkey, wrapId, web }
  }

  /** Moves time on, keeping `caller`'s access token fresh. */
  const age = async (caller: Caller, ms: number) => {
    advance(ms)
    const refreshed = await refresh(caller)
    expect(refreshed.status).toBe(200)
    caller.accessToken = refreshed.body.accessToken
    caller.refreshToken = refreshed.body.refreshToken
  }

  it('is refused under 24 hours old, even stepped up', async () => {
    const { web, passkey } = await browser()
    await age(web, 23 * HOUR)
    expect((await client.stepUp(web, passkey)).assert.status).toBe(200)
    const response = (await rekey(web)).response
    expect(response.status).toBe(403)
    expect(response.body.code).toBe('session_too_new')
  })

  it('needs a step-up in the last 5 minutes once old enough', async () => {
    const { web, passkey } = await browser()
    await age(web, 25 * HOUR)
    expect((await rekey(web)).response.body.code).toBe('step_up_required')
    expect((await client.stepUp(web, passkey)).assert.status).toBe(200)
    advance(6 * MINUTE)
    expect((await rekey(web)).response.body.code).toBe('step_up_required')
    expect((await client.stepUp(web, passkey)).assert.status).toBe(200)
    expect((await rekey(web)).response.status).toBe(200)
  })

  it('deletes every wrap and stores the step-up passkey’s for the new epoch', async () => {
    const { session, web, passkey, wrapId } = await browser()
    // A second passkey with its own wrap, which the change drops.
    const second = await client.register(session, { extra: { wrapId: randomId(), wrap: fakeWrap() } })
    expect(second.added.status).toBe(200)
    await age(web, 25 * HOUR)
    const { assert } = await client.stepUp(web, passkey)
    expect(assert.status).toBe(200)
    const credentialId = assert.body.credentialId
    const newWrapId = randomId()
    const wrap = fakeWrap()

    // Another credential than the step-up's is `not_found`.
    const wrong = await rekey(web, {
      passkeyWrap: { credentialId: second.response.id, wrapId: newWrapId, wrap },
    })
    expect(wrong.response.status).toBe(404)
    expect(wrong.response.body.code).toBe('not_found')

    const { response } = await rekey(web, { passkeyWrap: { credentialId, wrapId: newWrapId, wrap } })
    expect(response.status).toBe(200)
    expect(sql('SELECT credential_id, wrap_id, key_epoch, wrap FROM passkey_wraps')).toEqual([
      { credential_id: credentialId, wrap_id: newWrapId, key_epoch: 1, wrap },
    ])
    expect(sql('SELECT wrap_id FROM passkey_wraps WHERE wrap_id = ?', wrapId)).toEqual([])
    // Signing in with the passkey hands out the new wrap.
    const signIn = await client.signIn(passkey)
    expect(signIn.assert.body).toMatchObject({ keyEpoch: 1, wraps: [{ wrapId: newWrapId, wrap, keyEpoch: 1 }] })
    // Both passkeys are still the account's.
    expect(sql('SELECT COUNT(*) AS n FROM passkeys')[0].n).toBe(2)
  })

  it('stores a phone’s passkeyWrap for the passkey it stepped up with', async () => {
    const { session, passkey } = await browser()
    expect((await client.stepUp(session, passkey)).assert.status).toBe(200)
    const credentialId = sql('SELECT credential_id FROM passkeys')[0].credential_id
    const wrapId = randomId()
    const { response } = await rekey(session, {
      passkeyWrap: { credentialId, wrapId, wrap: fakeWrap() },
    })
    expect(response.status).toBe(200)
    expect(sql('SELECT wrap_id, key_epoch FROM passkey_wraps')).toEqual([{ wrap_id: wrapId, key_epoch: 1 }])
  })

  it('refuses a passkeyWrap from a session with no step-up passkey', async () => {
    const { session } = await browser()
    const credentialId = sql('SELECT credential_id FROM passkeys')[0].credential_id
    const { response } = await rekey(session, {
      passkeyWrap: { credentialId, wrapId: randomId(), wrap: fakeWrap() },
    })
    expect(response.status).toBe(404)
  })
})

describe('retired keys', () => {
  it('refuses opening a session with the old key, attested', async () => {
    const s = await phone()
    await rekey(s)
    const response = await send(
      'POST',
      '/sessions',
      await signedEnvelope('session/open', s.key),
      { 'x-ww-dev-bypass': 'test-dev-bypass-token' }
    )
    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ code: 'key_retired', changedAt: START })
    expect(sql('SELECT COUNT(*) AS n FROM accounts')[0].n).toBe(1)
  })

  it('refuses opening a web session with the old key with any ticket', async () => {
    const { session, passkey } = await accountWithPasskey()
    const oldKey = session.key
    await rekey(session)
    const { assert } = await client.signIn(passkey)
    expect(assert.status).toBe(200)
    const tickets = [
      assert.body.ticket,
      (await issueTicket(h.env, { kind: 'recovery', accountId: session.accountId })).ticket,
      (
        await issueTicket(h.env, {
          kind: 'approval',
          accountId: session.accountId,
          actorSessionId: session.sessionId,
        })
      ).ticket,
    ]
    for (const ticket of tickets) {
      const { reply } = await client.openWeb(oldKey, ticket)
      expect(reply.status).toBe(403)
      expect(reply.body).toMatchObject({ code: 'key_retired', changedAt: START })
    }
  })

  it('refuses legacy account/register, web sign-up, and web recovery with the old key', async () => {
    const s = await phone()
    await rekey(s)
    await h.kv.put('auth:legacy', 'on')
    const register = await send('POST', '/account/register', await signedEnvelope('account/register', s.key))
    expect(register.status).toBe(403)
    expect(register.body).toMatchObject({ code: 'key_retired', changedAt: START })

    const { signup } = await client.signUp(s.key)
    expect(signup.status).toBe(403)
    expect(signup.body).toMatchObject({ code: 'key_retired', changedAt: START })

    const recovery = await client.recovery(s.key)
    expect(recovery.status).toBe(403)
    expect(recovery.body.code).toBe('key_retired')
    expect(sql('SELECT COUNT(*) AS n FROM accounts')[0].n).toBe(1)
  })

  it('stays unknown_account on other self-signed ops', async () => {
    const s = await phone()
    const { caller } = await rekey(s)
    const response = await send(
      'POST',
      '/passkeys/wrap',
      await signedEnvelope('passkey/wrap', s.key, {
        credentialId: b64u(randomBytes(16)),
        wrapId: randomId(),
        keyEpoch: 1,
        wrap: fakeWrap(),
      }),
      bearer(caller.accessToken)
    )
    expect(response.body.code).toBe('unknown_account')
  })
})

describe('POST /sessions with accountId', () => {
  it('opens into the named account only when the key is its current key', async () => {
    const s = await phone()
    const into = await send(
      'POST',
      '/sessions',
      await signedEnvelope('session/open', s.key, { accountId: s.accountId }),
      { 'x-ww-dev-bypass': 'test-dev-bypass-token' }
    )
    expect(into.status).toBe(201)
    expect(into.body.accountId).toBe(s.accountId)

    const other = await phone()
    const wrong = await send(
      'POST',
      '/sessions',
      await signedEnvelope('session/open', s.key, { accountId: other.accountId }),
      { 'x-ww-dev-bypass': 'test-dev-bypass-token' }
    )
    expect(wrong.status).toBe(404)
    expect(wrong.body.code).toBe('unknown_account')
  })

  it('keeps the capabilities it opens with', async () => {
    const s = await phone()
    const into = await send(
      'POST',
      '/sessions',
      await signedEnvelope('session/open', s.key, {
        accountId: s.accountId,
        capabilities: ['sync-everyone'],
      }),
      { 'x-ww-dev-bypass': 'test-dev-bypass-token' }
    )
    expect(into.status).toBe(201)
    expect(sql('SELECT capabilities FROM account_sessions WHERE id = ?', into.body.sessionId)).toEqual([
      { capabilities: '["sync-everyone"]' },
    ])
  })

  it('never creates an account', async () => {
    const before = Number(sql('SELECT COUNT(*) AS n FROM accounts')[0].n)
    const response = await send(
      'POST',
      '/sessions',
      await signedEnvelope('session/open', await SigningKey.generate(), { accountId: randomId() }),
      { 'x-ww-dev-bypass': 'test-dev-bypass-token' }
    )
    expect(response.status).toBe(404)
    expect(response.body.code).toBe('unknown_account')
    expect(Number(sql('SELECT COUNT(*) AS n FROM accounts')[0].n)).toBe(before)
  })

  it('tells a device resolving a change which key won', async () => {
    const s = await phone()
    const { newKey } = await rekey(s)
    // The new key opens into the account: the change committed.
    const committed = await send(
      'POST',
      '/sessions',
      await signedEnvelope('session/open', newKey, { accountId: s.accountId }),
      { 'x-ww-dev-bypass': 'test-dev-bypass-token' }
    )
    expect(committed.status).toBe(201)
    // An uncommitted K2 is unknown_account; the old key is key_retired.
    const pending = await send(
      'POST',
      '/sessions',
      await signedEnvelope('session/open', await SigningKey.generate(), { accountId: s.accountId }),
      { 'x-ww-dev-bypass': 'test-dev-bypass-token' }
    )
    expect(pending.body.code).toBe('unknown_account')
    const old = await send(
      'POST',
      '/sessions',
      await signedEnvelope('session/open', s.key, { accountId: s.accountId }),
      { 'x-ww-dev-bypass': 'test-dev-bypass-token' }
    )
    expect(old.body.code).toBe('key_retired')
  })

  it('refuses a malformed accountId', async () => {
    const response = await send(
      'POST',
      '/sessions',
      await signedEnvelope('session/open', await SigningKey.generate(), { accountId: 'nope' }),
      { 'x-ww-dev-bypass': 'test-dev-bypass-token' }
    )
    expect(response.status).toBe(400)
  })
})

describe('Cloud Sync', () => {
  const request = (path: string, init: RequestInit) =>
    (app as { request: typeof fetch }).request(path, { duplex: 'half', ...init } as RequestInit, h.env as never)
  const put = async (
    caller: Pick<Caller, 'accessToken'>,
    slotId: string,
    headers: Record<string, string> = {},
    bytes: Uint8Array = randomBytes(500)
  ) => {
    const response = await request('/sync/put', {
      method: 'POST',
      headers: {
        ...bearer(caller.accessToken),
        'content-type': 'application/octet-stream',
        'content-length': String(bytes.byteLength),
        'x-ww-slot-id': slotId,
        'x-ww-sha256': await sha256B64u(bytes),
        ...headers,
      },
      body: bytes,
    })
    return { status: response.status, body: (await response.json()) as Record<string, unknown> }
  }
  const list = async (caller: Pick<Caller, 'accessToken'>) =>
    (await postJson(app, h.env, '/sync/list', {}, bearer(caller.accessToken))).body as {
      slots: { slotId: string; updatedAt: number; platform: string; live: boolean; etag: string }[]
    }
  const live = async (caller: Pick<Caller, 'accessToken'>, slotId: string) => {
    const response = (await request('/sync/live', {
      method: 'GET',
      headers: { ...bearer(caller.accessToken), upgrade: 'websocket', 'x-ww-slot-id': slotId },
    })) as Response & { webSocket?: FakeWebSocket | null }
    expect(response.status).toBe(101)
    return response.webSocket!
  }
  const slot = () => randomId().slice(0, 16)

  it('closes every socket of the account with 4005 key_changed', async () => {
    const s = await phone()
    const other = await phone(s.key)
    const stranger = await phone()
    const sockets = [await live(s, slot()), await live(other, slot())]
    const strangers = await live(stranger, slot())
    expect((await rekey(s)).response.status).toBe(200)
    for (const socket of sockets) expect(socket.closedBy).toEqual({ code: 4005, reason: 'key_changed' })
    expect(strangers.closedBy).toBeNull()
  })

  it('refuses a stale token’s write but lets it read', async () => {
    const s = await phone()
    const mine = slot()
    expect((await put(s, mine)).status).toBe(200)
    advance(5 * SECOND)
    const { caller } = await rekey(s)
    const write = await put(s, mine)
    expect(write.status).toBe(401)
    expect(write.body).toMatchObject({ code: 'unauthorized', reason: 'key_changed' })
    expect((await list(s)).slots).toHaveLength(1)
    expect((await put(caller, mine)).status).toBe(200)
  })

  it('refuses a signed-out device’s write at once', async () => {
    const s = await phone()
    const other = await phone(s.key)
    const theirs = slot()
    expect((await put(other, theirs)).status).toBe(200)
    advance(5 * SECOND)
    await rekey(s)
    expect((await put(other, theirs)).status).toBe(401)
    const del = await postJson(app, h.env, '/sync/delete', { slotId: theirs }, bearer(other.accessToken))
    expect(del.status).toBe(401)
  })

  it('re-seals another device’s slot, keeping its writer and time', async () => {
    const s = await phone()
    const other = await phone(s.key)
    const theirs = slot()
    expect((await put(other, theirs)).status).toBe(200)
    const before = (await list(s)).slots[0]
    advance(HOUR)
    const { caller } = await rekey(await fresh(s))
    const resealed = await put(caller, theirs, { 'x-ww-reseal': '1', 'if-match': `"${before.etag}"` })
    expect(resealed.status).toBe(200)
    expect(resealed.body.updatedAt).toBe(before.updatedAt)
    const after = (await list(caller)).slots[0]
    expect(after).toMatchObject({ slotId: theirs, updatedAt: before.updatedAt, platform: 'dev', live: false })
    expect(after.etag).not.toBe(before.etag)
    const object = await h.env.ACCOUNT_SYNC!.get(`v1/${s.accountId}/${theirs}`)
    expect(object!.customMetadata!.updatedAt).toBe(String(before.updatedAt))
  })

  it('needs a quoted ETag, so a re-seal never replaces newer bytes', async () => {
    const s = await phone()
    const other = await phone(s.key)
    const theirs = slot()
    expect((await put(other, theirs)).status).toBe(200)
    const read = `"${(await list(s)).slots[0].etag}"`
    advance(5 * SECOND)
    const { caller, newKey } = await rekey(s)
    // A weak ETag doesn't promise the same bytes: the comparison is strong.
    for (const headers of [{}, { 'if-match': '*' }, { 'if-match': 'nope' }, { 'if-match': `W/${read}` }]) {
      const refused = await put(caller, theirs, { 'x-ww-reseal': '1', ...headers })
      expect(refused.status).toBe(400)
      expect(refused.body.code).toBe('bad_request')
    }
    // The slot's device signs back in with the new key and writes newer
    // bytes before the re-seal reaches its slot.
    const rejoined = await phone(newKey)
    expect((await put(rejoined, theirs)).status).toBe(200)
    advance(3 * SECOND)
    const stale = await put(caller, theirs, { 'x-ww-reseal': '1', 'if-match': read })
    expect(stale.status).toBe(412)
    expect(stale.body.code).toBe('precondition_failed')
  })

  it('refuses a re-seal without a recent key change, of no slot, or with a bad header', async () => {
    const s = await phone()
    const mine = slot()
    expect((await put(s, mine)).status).toBe(200)
    advance(5 * SECOND)
    const etag = `"${(await list(s)).slots[0].etag}"`
    const never = await put(s, mine, { 'x-ww-reseal': '1', 'if-match': etag })
    expect(never.status).toBe(403)
    expect(never.body.code).toBe('forbidden')

    const { caller } = await rekey(s)
    expect((await put(caller, slot(), { 'x-ww-reseal': '1', 'if-match': etag })).status).toBe(412)
    expect((await put(caller, mine, { 'x-ww-reseal': 'yes', 'if-match': etag })).status).toBe(400)
    advance(7 * DAY + SECOND)
    const fresh = await refresh(s)
    const late = await put({ accessToken: fresh.body.accessToken }, mine, {
      'x-ww-reseal': '1',
      'if-match': etag,
    })
    expect(late.status).toBe(403)
  })

  it('re-seals another device’s record change, and refuses a token from before the change', async () => {
    await h.kv.put('sync:changes', 'true')
    const s = await phone()
    const other = await phone(s.key)
    const theirs = slot()
    expect((await put(other, theirs)).status).toBe(200)
    const changeId = b64u(randomBytes(16))
    const change = await send(
      'POST',
      '/sync/changes/put',
      { slotId: theirs, changeId, blob: b64u(randomBytes(512)) },
      bearer(other.accessToken)
    )
    expect(change.status).toBe(200)
    const { sequence } = change.body
    const reseal = (caller: Pick<Caller, 'accessToken'>, fields: Record<string, unknown>) =>
      send('POST', '/sync/changes/reseal', fields, bearer(caller.accessToken))

    const resealed = b64u(randomBytes(512))
    // No key change yet.
    const never = await reseal(s, { sequence, changeId, blob: resealed })
    expect([never.status, never.body.code]).toEqual([403, 'forbidden'])

    const { caller } = await rekey(await fresh(s))
    // The rekey told the sync index: a token from before it adds nothing.
    const stale = await send(
      'POST',
      '/sync/changes/put',
      { slotId: theirs, changeId: b64u(randomBytes(16)), blob: b64u(randomBytes(512)) },
      bearer(other.accessToken)
    )
    expect(stale.status).toBe(401)
    expect(stale.body.reason).toBe('key_changed')
    // And neither does one whose session it ended, with a re-seal.
    expect((await reseal(other, { sequence, changeId, blob: resealed })).status).toBe(401)

    const done = await reseal(caller, { sequence, changeId, blob: resealed })
    expect(done.status).toBe(200)
    expect(done.body).toEqual({ ok: true, sequence })
    const read = await send(
      'POST',
      '/sync/changes/list',
      { slotId: slot(), afterSequence: 0 },
      bearer(caller.accessToken)
    )
    expect(read.body.changes).toEqual([
      { sequence, slotId: theirs, changeId, keyEpoch: 1, createdAt: START, blob: resealed },
    ])
    // The same sequence: nobody's cursor moves.
    expect(read.body.sequence).toBe(sequence)

    const gone = await reseal(caller, { sequence: sequence + 9, changeId, blob: resealed })
    expect([gone.status, gone.body.code]).toEqual([404, 'not_found'])
    const bad = await reseal(caller, { sequence, changeId, blob: b64u(randomBytes(100)) })
    expect(bad.status).toBe(400)
  })
})
