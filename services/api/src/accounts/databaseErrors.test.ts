import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '../types'
import {
  SigningKey,
  b64u,
  createHarness,
  envelope,
  randomId,
  type Harness,
} from '../test/buddies'
import { bearer, openTestSession, postJson } from '../test/accounts'
import { failQueries } from '../test/memoryD1'
import { recordSentryEvents, type SentryRecorder } from '../test/sentry'
import { inboxLinkMessage } from './contracts'
import { accountOf, requireAccount, resetAccountStatusCache } from './auth'
import { createAccountsRoutes } from './route'
import { app } from '../app'

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

/**
 * Database errors reach Sentry as the operation that failed, never as
 * Drizzle's message, which quotes the query's parameters (account ids,
 * session ids, refresh token hashes, inbox ids).
 */

const START = Date.UTC(2026, 9, 16, 12)
const accounts = createAccountsRoutes() as never
const active = new Hono<AppEnv>().post(
  '/active',
  requireAccount({ requireActive: true }),
  (c) => c.json(accountOf(c))
) as never

let h: Harness
let recorder: SentryRecorder

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  h = await createHarness()
  resetAccountStatusCache()
  recorder = recordSentryEvents()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  recorder.stop()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** The one event reported, as Sentry would get it, and its JSON. */
const reported = async () => {
  const events = await recorder.events()
  expect(events).toHaveLength(1)
  return { event: events[0], json: JSON.stringify(events[0]) }
}

const expectOperationOnly = async (operation: string, secrets: string[]) => {
  const { event, json } = await reported()
  expect(event.exception?.values).toEqual([
    expect.objectContaining({
      type: 'DatabaseError',
      value: `database query failed: ${operation}`,
    }),
  ])
  expect(json).not.toContain('Failed query')
  for (const secret of secrets) expect(json).not.toContain(secret)
}

const sessionRow = () =>
  h.accountsDb!.db.prepare('SELECT * FROM account_sessions').get() as Record<
    string,
    string
  >

/** A bearer `inbox/register` linking a new inbox to the session's account. */
const registerInbox = async (
  session: Awaited<ReturnType<typeof openTestSession>>,
  headers: Record<string, string> = bearer(session.accessToken)
) => {
  const key = await SigningKey.generate()
  const inboxId = randomId()
  const signature = await session.key.sign(
    inboxLinkMessage(session.accountId, inboxId, key.publicKey)
  )
  const response = await h.post(
    '/inbox/register',
    await envelope(
      'inbox/register',
      {
        inboxId,
        ownerPub: key.publicKey,
        account: { accountId: session.accountId, signature: b64u(signature) },
        ts: Date.now(),
        nonce: randomId(),
      },
      key
    ),
    headers
  )
  return { inboxId, response }
}

describe('database errors in Sentry', () => {
  it('session/refresh reports the op, not the token hash or ids', async () => {
    const session = await openTestSession(accounts, h.env)
    const row = sessionRow()
    failQueries(h.accountsDb!, /from "account_sessions"/)
    const response = await postJson(accounts, h.env, '/sessions/refresh', {
      refreshToken: session.refreshToken,
    })
    expect(response).toMatchObject({
      status: 500,
      body: { ok: false, error: 'internal', code: 'internal' },
    })
    await expectOperationOnly('session/refresh', [
      row.refresh_hash,
      row.id,
      row.account_id,
      session.refreshToken,
    ])
  })

  it('a bearer inbox/register reports the op, not the inbox or account', async () => {
    const session = await openTestSession(accounts, h.env)
    failQueries(h.accountsDb!, /^insert into "account_inboxes"/)
    const { inboxId, response } = await registerInbox(session)
    expect(response.status).toBe(500)
    await expectOperationOnly('inbox/register', [inboxId, session.accountId])
  })

  it('a legacy inbox/register that registers unlinked still reports the op only', async () => {
    const session = await openTestSession(accounts, h.env)
    failQueries(h.accountsDb!, /from "account_inboxes"/)
    const { inboxId, response } = await registerInbox(session, {})
    expect(response).toEqual({ status: 200, body: { ok: true } })
    await expectOperationOnly('inbox/register', [inboxId, session.accountId])
  })

  it('a route without its own guard reports the route, not the query', async () => {
    const session = await openTestSession(accounts, h.env)
    Object.assign(h.env, {
      ADMIN_API_TOKEN: 'admin-secret-for-tests',
      RATE_LIMITER: { limit: async () => ({ success: true }) },
    })
    failQueries(h.accountsDb!, /from "accounts"/)
    const response = await app.request(
      '/admin/accounts/status',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cf-connecting-ip': '203.0.113.7',
          'x-ww-admin-token': 'admin-secret-for-tests',
        },
        body: JSON.stringify({
          accountId: session.accountId,
          status: 'suspended',
          reason: 'report',
        }),
      },
      h.env
    )
    expect(response.status).toBe(500)
    await expectOperationOnly('POST /admin/accounts/status', [session.accountId])
    // The log line is the same redacted error.
    const logged = JSON.stringify(
      vi.mocked(console.error).mock.calls.map((args) => String(args[1]))
    )
    expect(logged).toContain('database query failed')
    expect(logged).not.toContain(session.accountId)
  })

  it('the account status read (requireActive) reports a label, not the account', async () => {
    const session = await openTestSession(accounts, h.env)
    failQueries(h.accountsDb!, /from "accounts"/)
    const response = await postJson(
      active,
      h.env,
      '/active',
      {},
      bearer(session.accessToken)
    )
    expect(response.status).toBe(500)
    await expectOperationOnly('account status', [session.accountId])
  })
})
