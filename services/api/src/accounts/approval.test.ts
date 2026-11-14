import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { SigningKey, b64u, createHarness, randomBytes, randomId, type Harness } from '../test/buddies'
import { nextTestIp, openTestSession, type TestSession } from '../test/accounts'
import { PasskeyClient, authorization } from '../test/passkeys'
import type { AppEnv } from '../types'
import { createAccountsRoutes } from './route'
import { resetAccountStatusCache } from './auth'
import { issueTicket } from './passkeyTokens'
import { haversineKm, isFar } from './approvalDO'

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

const START = Date.UTC(2026, 9, 30, 12)
const SECOND = 1_000
const MINUTE = 60 * SECOND
const app = new Hono<AppEnv>().route('/', createAccountsRoutes()) as never

const PARIS = { city: 'Paris', region: 'Île-de-France', country: 'FR', latitude: '48.85660', longitude: '2.35220' }
const VERSAILLES = { city: 'Versailles', region: 'Île-de-France', country: 'FR', latitude: '48.80140', longitude: '2.13010' }
const LYON = { city: 'Lyon', region: 'Auvergne-Rhône-Alpes', country: 'FR', latitude: '45.76400', longitude: '4.83570' }
const BRUSSELS = { city: 'Brussels', region: 'Brussels Capital', country: 'BE', latitude: '50.85030', longitude: '4.35170' }

let h: Harness
let callerIp: string | null = null

/** A request to the accounts app with the caller's IP and `request.cf`. */
const send = async (
  path: string,
  body: unknown,
  { headers = {}, cf = {} }: { headers?: Record<string, string>; cf?: Record<string, unknown> } = {}
) => {
  const request = new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': callerIp ?? nextTestIp(),
      ...headers,
    },
    body: JSON.stringify(body),
  })
  Object.defineProperty(request, 'cf', { value: cf })
  const response = await (app as Hono<AppEnv>).request(request, undefined, h.env)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: response.status, headers: response.headers, body: (await response.json()) as any }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  h = await createHarness()
  resetAccountStatusCache()
  callerIp = null
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const advance = (ms: number) => vi.setSystemTime(Date.now() + ms)
const sql = (query: string, ...params: (string | number | null)[]) =>
  h.accountsDb!.db.prepare(query).all(...params) as Record<string, unknown>[]
const sha256 = async (b64: string) =>
  b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(Buffer.from(b64, 'base64url')))))
const blob = (bytes = 48) => b64u(randomBytes(bytes))

/** The browser's side: what its QR code holds and the tokens it keeps. */
const browser = async () => {
  const channelId = randomId()
  const claimToken = randomId()
  const browserToken = randomId()
  const hello = blob()
  return {
    channelId,
    claimToken,
    browserToken,
    hello,
    open: async (cf: Record<string, unknown> = PARIS, extra: Record<string, unknown> = {}) =>
      send(
        '/approval/open',
        {
          channelId,
          verifier: await sha256(claimToken),
          browserVerifier: await sha256(browserToken),
          hello,
          ...extra,
        },
        { cf }
      ),
    status: (token = browserToken) => send('/approval/status', { channelId, browserToken: token }),
    receive: (token = browserToken) => send('/approval/receive', { channelId, browserToken: token }),
    done: (token = browserToken) => send('/approval/done', { channelId, browserToken: token }),
    cancel: (token = browserToken) => send('/approval/cancel', { channelId, browserToken: token }),
  }
}
type Browser = Awaited<ReturnType<typeof browser>>

const opened = async (cf: Record<string, unknown> = PARIS) => {
  const b = await browser()
  const reply = await b.open(cf, { hello: b.hello })
  expect(reply.status).toBe(200)
  return b
}

const bearer = (session: { accessToken: string }) => ({ headers: authorization(session.accessToken) })
const claim = (
  b: Browser,
  session: TestSession,
  { cf = VERSAILLES, phonePub = b64u(randomBytes(32)), claimToken = b.claimToken } = {}
) => send('/approval/claim', { channelId: b.channelId, claimToken, phonePub }, { ...bearer(session), cf })
const phoneStatus = (b: Browser, session: TestSession) =>
  send('/approval/status', { channelId: b.channelId }, bearer(session))
const sendKey = (b: Browser, session: TestSession, key: string) =>
  send('/approval/send', { channelId: b.channelId, key }, bearer(session))
const phoneCancel = (b: Browser, session: TestSession) =>
  send('/approval/cancel', { channelId: b.channelId }, bearer(session))
const phone = () => openTestSession(app, h.env)

/** A web session for an account, through a recovery ticket. */
const webSession = async (key: SigningKey, accountId: string) => {
  const { ticket } = await issueTicket(h.env, { kind: 'recovery', accountId })
  const client = new PasskeyClient((method, path, body, headers) => send(path, body, { headers }))
  const { reply } = await client.openWeb(key, ticket)
  expect(reply.status).toBe(201)
  return { key, ...reply.body } as TestSession
}

describe('approving a browser from a phone', () => {
  it('relays the hello and the key, and the ticket opens the browser’s web session', async () => {
    const b = await opened(PARIS)
    expect((await b.status()).body).toEqual({ ok: true, status: 'open', expiresAt: START + 75 * SECOND })

    const p = await phone()
    advance(10 * SECOND)
    const phonePub = b64u(randomBytes(32))
    const claimed = await claim(b, p, { phonePub })
    expect(claimed.status).toBe(200)
    expect(claimed.body).toEqual({
      ok: true,
      expiresAt: Date.now() + 5 * MINUTE,
      hello: b.hello,
      location: { city: 'Paris', region: 'Île-de-France', country: 'FR' },
      far: false,
    })
    expect((await b.status()).body).toEqual({
      ok: true,
      status: 'claimed',
      expiresAt: Date.now() + 5 * MINUTE,
      phonePub,
    })
    expect((await phoneStatus(b, p)).body).toMatchObject({ status: 'claimed', phonePub })
    expect((await b.receive()).body).toEqual({ ok: true, status: 'claimed' })

    const key = blob(120)
    expect(await sendKey(b, p, key)).toMatchObject({ status: 200, body: { ok: true } })
    const received = await b.receive()
    expect(received.body).toMatchObject({ ok: true, status: 'sent', key })
    expect(received.body.ticketExpiresAt).toBe(Date.now() + 2 * MINUTE)
    expect(received.body.ticket.length).toBeLessThanOrEqual(512)
    advance(3 * SECOND)
    expect((await b.receive()).body.ticket).toBe(received.body.ticket)

    // The browser now holds the account key and opens its session.
    const client = new PasskeyClient((method, path, body, headers) => send(path, body, { headers }))
    const { reply } = await client.openWeb(p.key, received.body.ticket, { appVersion: '1.46.0' })
    expect(reply).toMatchObject({ status: 201, body: { accountId: p.accountId, platform: 'web' } })
    const listed = await (app as Hono<AppEnv>).request(
      '/activity',
      { headers: authorization(p.accessToken) },
      h.env
    )
    const { activity } = (await listed.json()) as { activity: Record<string, unknown>[] }
    expect(activity.slice(0, 2)).toMatchObject([
      { kind: 'session.opened', method: 'approval', session: { platform: 'web' }, actor: { sessionId: p.sessionId } },
      { kind: 'device.approved', session: { sessionId: p.sessionId } },
    ])

    expect(await b.done()).toMatchObject({ status: 200, body: { ok: true } })
    expect(await b.done()).toMatchObject({ status: 200 })
    expect((await b.receive()).body).toEqual({ ok: true, status: 'done' })
    expect(
      h.approvals.storage(b.channelId).query(
        'SELECT hello, location, phone_pub, key, ticket FROM channel'
      )
    ).toEqual([{ hello: null, location: null, phone_pub: null, key: null, ticket: null }])

    // The alarm deletes the rest.
    advance(5 * MINUTE)
    await h.approvals.fireAlarm(b.channelId)
    expect(h.approvals.storage(b.channelId).tables()).toEqual([])
    expect(await b.status()).toMatchObject({ status: 404, body: { error: 'not_found' } })
  })

  it('says where the browser is and whether the phone is far from it', async () => {
    const cases: [Record<string, unknown>, Record<string, unknown>, boolean][] = [
      [PARIS, VERSAILLES, false],
      [PARIS, LYON, true],
      [PARIS, BRUSSELS, true],
      [PARIS, {}, false],
      [{ country: 'FR' }, { country: 'BE' }, true],
      [{ country: 'FR' }, { country: 'FR' }, false],
    ]
    for (const [at, from, far] of cases) {
      const b = await opened(at)
      const claimed = await claim(b, await phone(), { cf: from })
      expect(claimed.body.far, `${JSON.stringify(at)} → ${JSON.stringify(from)}`).toBe(far)
    }
    const nowhere = await opened({})
    const claimed = await claim(nowhere, await phone())
    expect(claimed.body).not.toHaveProperty('location')
    expect(claimed.body.far).toBe(false)
    // Never the IP.
    const stored = h.approvals.storage(nowhere.channelId).query('SELECT * FROM channel')[0]
    expect(JSON.stringify(stored)).not.toMatch(/198\.19\./)
    expect(Math.round(haversineKm({ latitude: 48.8566, longitude: 2.3522 }, { latitude: 45.764, longitude: 4.8357 }))).toBe(391)
    expect(isFar({ latitude: 0, longitude: 0 }, { latitude: 1.7, longitude: 0 })).toBe(false)
    expect(isFar({ latitude: 0, longitude: 0 }, { latitude: 1.9, longitude: 0 })).toBe(true)
  })

  it('lives 75 seconds unclaimed and 5 minutes from the claim', async () => {
    const unclaimed = await opened()
    advance(75 * SECOND)
    expect(await unclaimed.status()).toMatchObject({ status: 404, body: { error: 'not_found' } })
    await h.approvals.fireAlarm(unclaimed.channelId)
    expect(h.approvals.storage(unclaimed.channelId).tables()).toEqual([])

    const b = await opened()
    advance(74 * SECOND)
    expect((await claim(b, await phone())).status).toBe(200)
    expect(h.approvals.storage(b.channelId).alarm()).toBe(Date.now() + 5 * MINUTE)
    advance(5 * MINUTE - SECOND)
    expect((await b.status()).body.status).toBe('claimed')
    advance(SECOND)
    expect((await b.status()).status).toBe(404)
  })

  it('refuses to open a live channel again, and opens it after it expired', async () => {
    const b = await opened()
    expect(await b.open(PARIS, { hello: b.hello })).toMatchObject({ status: 409, body: { error: 'conflict' } })
    advance(75 * SECOND)
    expect((await b.open(PARIS, { hello: b.hello })).status).toBe(200)
  })

  it('lets the first claim win and its repeat through', async () => {
    const b = await opened()
    const p = await phone()
    const phonePub = b64u(randomBytes(32))
    const first = await claim(b, p, { phonePub })
    expect(first.status).toBe(200)
    expect(await claim(b, p, { phonePub })).toMatchObject({ status: 200, body: first.body })
    expect(await claim(b, p)).toMatchObject({ status: 409, body: { error: 'conflict' } })
    expect(await claim(b, await phone(), { phonePub })).toMatchObject({ status: 409 })
  })

  it('takes claims from phones only', async () => {
    const b = await opened()
    const p = await phone()
    const web = await webSession(p.key, p.accountId)
    expect(await claim(b, web)).toMatchObject({ status: 403, body: { error: 'forbidden' } })
    expect(await send('/approval/claim', { channelId: b.channelId, claimToken: b.claimToken, phonePub: blob(32) })).toMatchObject({
      status: 401,
      body: { error: 'unauthorized' },
    })
    // Neither counted as a wrong token.
    for (let i = 0; i < 4; i++) await claim(b, p, { claimToken: randomId() })
    expect((await claim(b, p)).status).toBe(200)
  })

  it('lets a suspended account approve', async () => {
    const b = await opened()
    const p = await phone()
    sql("UPDATE accounts SET status = 'suspended' WHERE id = ?", p.accountId)
    resetAccountStatusCache()
    expect((await claim(b, p)).status).toBe(200)
    expect((await sendKey(b, p, blob())).status).toBe(200)
  })

  it('lets only the claiming session read, send, and cancel as the phone', async () => {
    const b = await opened()
    const p = await phone()
    const other = await phone()
    expect(await sendKey(b, p, blob())).toMatchObject({ status: 409, body: { error: 'conflict' } })
    expect(await phoneStatus(b, p)).toMatchObject({ status: 403, body: { error: 'forbidden' } })
    await claim(b, p)
    expect(await phoneStatus(b, other)).toMatchObject({ status: 403, body: { error: 'forbidden' } })
    expect(await sendKey(b, other, blob())).toMatchObject({ status: 403, body: { error: 'forbidden' } })
    expect(await phoneCancel(b, other)).toMatchObject({ status: 403, body: { error: 'forbidden' } })
    // The same account's web session is no phone either.
    const web = await webSession(p.key, p.accountId)
    expect(await sendKey(b, web, blob())).toMatchObject({ status: 403, body: { error: 'forbidden' } })
  })

  it('sends once: the same key again is ok, another is conflict, and it’s logged once', async () => {
    const b = await opened()
    const p = await phone()
    await claim(b, p)
    const key = blob()
    expect((await sendKey(b, p, key)).status).toBe(200)
    expect((await sendKey(b, p, key)).status).toBe(200)
    expect(await sendKey(b, p, blob())).toMatchObject({ status: 409, body: { error: 'conflict' } })
    expect(sql("SELECT COUNT(*) AS n FROM account_activity WHERE kind = 'device.approved'")[0].n).toBe(1)
  })

  it('mints a new ticket once the first expired, and each works once', async () => {
    const b = await opened()
    const p = await phone()
    await claim(b, p)
    await sendKey(b, p, blob())
    const first = (await b.receive()).body
    advance(2 * MINUTE)
    const second = (await b.receive()).body
    expect(second.ticket).not.toBe(first.ticket)
    expect(second.ticketExpiresAt).toBe(Date.now() + 2 * MINUTE)

    const client = new PasskeyClient((method, path, body, headers) => send(path, body, { headers }))
    expect((await client.openWeb(p.key, first.ticket)).reply).toMatchObject({
      status: 403,
      body: { error: 'ticket_invalid' },
    })
    expect((await client.openWeb(p.key, second.ticket)).reply.status).toBe(201)
    expect((await client.openWeb(p.key, second.ticket)).reply).toMatchObject({
      status: 403,
      body: { error: 'ticket_invalid' },
    })
    // The ticket is for the phone's account: another key can't use it.
    const b2 = await opened()
    await claim(b2, p)
    await sendKey(b2, p, blob())
    const third = (await b2.receive()).body
    expect((await client.openWeb(await SigningKey.generate(), third.ticket)).reply).toMatchObject({
      status: 403,
      body: { error: 'ticket_invalid' },
    })
  })

  it('burns the channel at the fifth wrong token, claim and browser tokens together', async () => {
    const b = await opened()
    const p = await phone()
    for (let i = 0; i < 2; i++)
      expect(await claim(b, p, { claimToken: randomId() })).toMatchObject({
        status: 401,
        body: { error: 'bad_signature' },
      })
    expect(await b.status(randomId())).toMatchObject({ status: 401, body: { error: 'bad_signature' } })
    expect(await b.receive(randomId())).toMatchObject({ status: 401 })
    // Four wrong: still open.
    expect((await b.status()).body.status).toBe('open')
    expect(await b.done(randomId())).toMatchObject({ status: 401 })
    expect((await b.status()).body.status).toBe('cancelled')
    expect(await claim(b, p)).toMatchObject({ status: 409, body: { error: 'conflict' } })
    expect(h.approvals.storage(b.channelId).query('SELECT hello, location FROM channel')).toEqual([
      { hello: null, location: null },
    ])
  })

  it('stops counting wrong tokens once done, and keeps it done', async () => {
    const b = await opened()
    const p = await phone()
    await claim(b, p)
    await sendKey(b, p, blob())
    await b.receive()
    expect((await b.done()).status).toBe(200)
    for (let i = 0; i < 6; i++) expect((await b.status(randomId())).status).toBe(401)
    expect((await b.status()).body.status).toBe('done')
    expect(h.approvals.storage(b.channelId).query('SELECT bad_tokens FROM channel')).toEqual([{ bad_tokens: 0 }])
  })

  it('keeps only the status and the verifiers once finished, and the phone still reads it', async () => {
    for (const finish of ['done', 'cancelled'] as const) {
      const b = await opened()
      const p = await phone()
      await claim(b, p)
      await sendKey(b, p, blob())
      await b.receive()
      expect((finish === 'done' ? await b.done() : await phoneCancel(b, p)).status).toBe(200)
      expect(
        h.approvals.storage(b.channelId).query(
          'SELECT status, account_id, session_id, phone_pub, claim_hash, hello, location, key, key_hash, ticket FROM channel'
        )
      ).toEqual([
        { status: finish, account_id: null, session_id: null, phone_pub: null, claim_hash: null, hello: null, location: null, key: null, key_hash: null, ticket: null },
      ])
      // The claiming phone still reads its status (and nobody else does).
      expect((await phoneStatus(b, p)).body).toMatchObject({ ok: true, status: finish })
      expect((await phoneStatus(b, await phone())).body).toMatchObject({ error: 'forbidden' })
    }
  })

  it('finishes only after the key was sent, and either side cancels', async () => {
    const b = await opened()
    const p = await phone()
    expect(await b.done()).toMatchObject({ status: 409, body: { error: 'conflict' } })
    await claim(b, p)
    expect(await b.done()).toMatchObject({ status: 409 })
    expect(await b.cancel()).toMatchObject({ status: 200, body: { ok: true } })
    expect((await b.status()).body.status).toBe('cancelled')
    expect(await sendKey(b, p, blob())).toMatchObject({ status: 409, body: { error: 'conflict' } })
    expect((await b.cancel()).status).toBe(200)

    const b2 = await opened()
    await claim(b2, p)
    expect((await phoneCancel(b2, p)).status).toBe(200)
    expect((await b2.status()).body.status).toBe('cancelled')

    // Once done, cancel changes nothing.
    const b3 = await opened()
    await claim(b3, p)
    await sendKey(b3, p, blob())
    await b3.receive()
    await b3.done()
    expect((await b3.cancel()).status).toBe(200)
    expect((await b3.status()).body.status).toBe('done')
  })

  it('refuses oversized blobs and malformed bodies', async () => {
    const b = await browser()
    expect(await b.open(PARIS, { hello: 'A'.repeat(1_025) })).toMatchObject({
      status: 413,
      body: { error: 'too_large' },
    })
    expect(await b.open(PARIS, { hello: 'A'.repeat(1_024), verifier: 'short' })).toMatchObject({
      status: 400,
      body: { error: 'bad_request' },
    })
    const ok = await opened()
    const p = await phone()
    await claim(ok, p)
    expect(await sendKey(ok, p, 'A'.repeat(1_025))).toMatchObject({ status: 413 })
    expect(await send('/approval/receive', { channelId: ok.channelId })).toMatchObject({ status: 400 })
    expect(await send('/approval/status', { channelId: 'nope', browserToken: ok.browserToken })).toMatchObject({
      status: 400,
    })
  })

  it('allows 60 opens per caller IP an hour', async () => {
    callerIp = '203.0.113.9'
    for (let i = 0; i < 60; i++) {
      const b = await browser()
      expect((await b.open(PARIS, { hello: b.hello })).status, `open ${i}`).toBe(200)
    }
    const over = await browser()
    const refused = await over.open(PARIS, { hello: over.hello })
    expect(refused).toMatchObject({ status: 429, body: { error: 'rate_limited' } })
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0)
    callerIp = '203.0.113.10'
    expect((await over.open(PARIS, { hello: over.hello })).status).toBe(200)
    callerIp = '203.0.113.9'
    advance(61 * MINUTE)
    const later = await browser()
    expect((await later.open(PARIS, { hello: later.hello })).status).toBe(200)
  })

  it('is disabled without the ticket secret', async () => {
    delete (h.env as { ACCOUNT_TICKET_SECRET?: string }).ACCOUNT_TICKET_SECRET
    const b = await browser()
    expect(await b.open(PARIS, { hello: b.hello })).toMatchObject({ status: 503, body: { error: 'disabled' } })
  })
})
