import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { createHarness, type Harness } from '../test/buddies'
import {
  bearer,
  openTestSession,
  postJson,
  requestJson,
  type TestSession,
} from '../test/accounts'
import type { AppEnv, Environment } from '../types'
import { resetAccountStatusCache } from './auth'
import { createAccountsRoutes } from './route'
import { accountsDb } from './store'
import {
  SUPPORTER_LINK_LIMITS,
  defaultSupporterDependencies,
  isAccountSupporter,
  pruneSupporterRecords,
} from './supporter'
import {
  createRevenueCatWebhookHandler,
  parseWebhookEvent,
} from './revenueCatWebhook'

/**
 * Supporter status on the server account (witness-work ADR 0029): the app
 * links its RevenueCat customer, the server stores only what RevenueCat says,
 * the webhook keeps it current, and `isAccountSupporter` answers from it.
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

const T0 = Date.UTC(2026, 9, 18, 12)
const DAY = 24 * 60 * 60_000
const RC_A = 'A1B2C3D4-0000-4000-8000-00000000000a'
const RC_B = 'A1B2C3D4-0000-4000-8000-00000000000b'
const WEBHOOK_SECRET = 'webhook-secret-for-tests-0123456789'

const iso = (ms: number) => new Date(ms).toISOString()

/** RevenueCat subscriber bodies by ADR 0014's rule. */
const monthly = (expiresMs: number) => ({
  subscriber: {
    entitlements: {
      'Monthly Donator': {
        expires_date: iso(expiresMs),
        product_identifier: 'monthly',
      },
    },
    subscriptions: { monthly: { expires_date: iso(expiresMs) } },
  },
})
const lifetime = {
  subscriber: {
    entitlements: { 'Lifetime Supporter': { expires_date: null } },
  },
}
const free = { subscriber: { entitlements: {}, subscriptions: {} } }

let h: Harness
let now: number
/** What RevenueCat answers for each app user id; absent is 404. */
let customers: Map<string, unknown | number>
let revenueCat: ReturnType<typeof vi.fn>
const app = createAccountsRoutes() as never

const webhookApp = () => {
  const routes = new Hono<AppEnv>()
  routes.post('/webhook', createRevenueCatWebhookHandler())
  return routes as never
}

beforeEach(async () => {
  now = T0
  h = await createHarness()
  resetAccountStatusCache()
  const env = h.env as Environment & Record<string, unknown>
  env.REVENUECAT_API_KEY = 'sk_test'
  env.REVENUECAT_WEBHOOK_AUTHORIZATION = WEBHOOK_SECRET
  customers = new Map()
  revenueCat = vi.fn(async (input: RequestInfo | URL) => {
    const id = decodeURIComponent(String(input).split('/').pop()!)
    const answer = customers.get(id)
    if (answer === undefined) return new Response(null, { status: 404 })
    if (typeof answer === 'number')
      return new Response(null, { status: answer })
    return Response.json(answer)
  })
  vi.spyOn(defaultSupporterDependencies, 'fetch').mockImplementation(
    (...args) => revenueCat(...args)
  )
  vi.spyOn(defaultSupporterDependencies, 'now').mockImplementation(() => now)
})

afterEach(() => {
  vi.restoreAllMocks()
})

const askedAbout = () =>
  revenueCat.mock.calls.map(([url]) =>
    decodeURIComponent(String(url).split('/').pop()!)
  )

const link = (session: TestSession, appUserId: unknown) =>
  postJson(
    app,
    h.env,
    '/revenuecat-customers',
    { appUserId },
    bearer(session.accessToken)
  )

const status = (session: TestSession) =>
  requestJson(
    app,
    h.env,
    'GET',
    '/supporter',
    undefined,
    bearer(session.accessToken)
  )

const webhook = (
  event: Record<string, unknown>,
  authorization = `Bearer ${WEBHOOK_SECRET}`
) =>
  postJson(
    webhookApp(),
    h.env,
    '/webhook',
    { api_version: '1.0', event },
    { authorization }
  )

describe('linking a RevenueCat customer', () => {
  it('stores what RevenueCat says and answers the account’s status', async () => {
    customers.set(RC_A, monthly(T0 + 10 * DAY))
    const session = await openTestSession(app, h.env)
    const response = await link(session, RC_A)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      ok: true,
      supporter: true,
      expiresAt: T0 + 10 * DAY,
    })
    expect(askedAbout()).toEqual([RC_A])
    expect(await isAccountSupporter(h.env, session.accountId)).toBe(true)
    // Answered from the record: no second read.
    expect(askedAbout()).toEqual([RC_A])
  })

  it('never counts a Tip, and a lifetime grant has no end', async () => {
    customers.set(RC_A, {
      subscriber: {
        entitlements: {
          'One Time Donator': { expires_date: null, product_identifier: 'tip' },
        },
        non_subscriptions: { tip: [{}] },
      },
    })
    customers.set(RC_B, lifetime)
    const session = await openTestSession(app, h.env)
    expect((await link(session, RC_A)).body).toEqual({
      ok: true,
      supporter: false,
      expiresAt: null,
    })
    expect((await link(session, RC_B)).body).toEqual({
      ok: true,
      supporter: true,
      expiresAt: null,
    })
  })

  it('doesn’t link a customer RevenueCat has never seen', async () => {
    const session = await openTestSession(app, h.env)
    expect((await link(session, RC_A)).body).toEqual({
      ok: true,
      supporter: false,
      expiresAt: null,
    })
    expect((await status(session)).body.customers).toBe(0)
  })

  it('refuses a malformed or anonymous id before asking RevenueCat', async () => {
    const session = await openTestSession(app, h.env)
    for (const appUserId of [
      undefined,
      42,
      'short',
      '$RCAnonymousID:0123456789abcdef',
      'a'.repeat(65),
    ]) {
      const response = await link(session, appUserId)
      expect(response.status, String(appUserId)).toBe(400)
      expect(response.body.code).toBe('bad_request')
    }
    expect(revenueCat).not.toHaveBeenCalled()
  })

  it('needs a bearer token', async () => {
    const response = await postJson(app, h.env, '/revenuecat-customers', {
      appUserId: RC_A,
    })
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('Bearer')
    expect(revenueCat).not.toHaveBeenCalled()
  })

  it('counts each account’s links, which each read RevenueCat, against the register tier', async () => {
    customers.set(RC_A, free)
    const session = await openTestSession(app, h.env)
    const other = await openTestSession(app, h.env)
    // The register tier's limiter, at 2 a minute: the real one's 60 would
    // take 60 links to reach.
    const keys: string[] = []
    const used = new Map<string, number>()
    ;(h.env as Environment).BUDDIES_REGISTER_LIMITER = {
      limit: async ({ key }: { key: string }) => {
        keys.push(key)
        const count = (used.get(key) ?? 0) + 1
        used.set(key, count)
        return { success: count <= 2 }
      },
    } as unknown as Environment['BUDDIES_REGISTER_LIMITER']
    for (let i = 0; i < 2; i++)
      expect((await link(session, RC_A)).status).toBe(200)
    const refused = await link(session, RC_A)
    expect(refused.status).toBe(429)
    expect(refused.body.code).toBe('rate_limited')
    expect(refused.headers.get('retry-after')).toBe('60')
    expect(revenueCat).toHaveBeenCalledTimes(2)
    // Keyed on a hash of the account, never the id or the IP: another
    // account (same IP) has its own budget.
    expect((await link(other, RC_A)).status).toBe(200)
    expect(new Set(keys).size).toBe(2)
    for (const key of keys) {
      expect(key).toMatch(/^account:/)
      expect(key).not.toContain(session.accountId)
    }
  })

  it('answers 503 unavailable with Retry-After when RevenueCat is down, changing nothing', async () => {
    customers.set(RC_A, 503)
    const session = await openTestSession(app, h.env)
    const response = await link(session, RC_A)
    expect(response.status).toBe(503)
    expect(response.body.code).toBe('unavailable')
    expect(response.headers.get('retry-after')).toBe('30')
    expect((await status(session)).body.customers).toBe(0)
  })

  it('is a Supporter when any linked customer is, until the latest end', async () => {
    customers.set(RC_A, monthly(T0 + 3 * DAY))
    customers.set(RC_B, monthly(T0 + 20 * DAY))
    const session = await openTestSession(app, h.env)
    await link(session, RC_A)
    expect((await link(session, RC_B)).body.expiresAt).toBe(T0 + 20 * DAY)
    expect((await status(session)).body).toEqual({
      ok: true,
      supporter: true,
      expiresAt: T0 + 20 * DAY,
      customers: 2,
    })
  })

  it('links one customer to several accounts', async () => {
    customers.set(RC_A, lifetime)
    const phone = await openTestSession(app, h.env)
    const tablet = await openTestSession(app, h.env)
    await link(phone, RC_A)
    await link(tablet, RC_A)
    expect(await isAccountSupporter(h.env, phone.accountId)).toBe(true)
    expect(await isAccountSupporter(h.env, tablet.accountId)).toBe(true)
  })

  it('keeps at most 5 links a side, replacing the least recently linked', async () => {
    const session = await openTestSession(app, h.env)
    const ids = Array.from(
      { length: SUPPORTER_LINK_LIMITS.customersPerAccount + 1 },
      (_, i) => `customer-${i}-0000000000`
    )
    customers.set(ids[0]!, lifetime)
    for (const id of ids.slice(1)) customers.set(id, free)
    for (const id of ids) {
      now += 1_000
      await link(session, id)
    }
    // The lifetime customer was linked first, so the sixth replaced it.
    expect((await status(session)).body).toMatchObject({
      supporter: false,
      customers: SUPPORTER_LINK_LIMITS.customersPerAccount,
    })

    // Repeating a link keeps it: relink the second, then add a seventh.
    now += 1_000
    await link(session, ids[1]!)
    customers.set('customer-7-0000000000', free)
    now += 1_000
    await link(session, 'customer-7-0000000000')
    const rows = await h
      .accountsDb!.prepare(
        'SELECT app_user_id FROM account_revenuecat_customers WHERE account_id = ?'
      )
      .bind(session.accountId)
      .all()
    const linked = (rows.results as { app_user_id: string }[]).map(
      (row) => row.app_user_id
    )
    expect(linked).toContain(ids[1])
    expect(linked).not.toContain(ids[2])
  })

  it('caps the accounts one customer is linked to', async () => {
    customers.set(RC_A, lifetime)
    const sessions: TestSession[] = []
    for (let i = 0; i <= SUPPORTER_LINK_LIMITS.accountsPerCustomer; i++) {
      now += 1_000
      const session = await openTestSession(app, h.env)
      sessions.push(session)
      await link(session, RC_A)
    }
    expect(await isAccountSupporter(h.env, sessions[0]!.accountId)).toBe(false)
    expect(await isAccountSupporter(h.env, sessions.at(-1)!.accountId)).toBe(
      true
    )
  })
})

describe('answering Supporter status', () => {
  it('has no Supporter without a link, asking no one', async () => {
    const session = await openTestSession(app, h.env)
    expect(await isAccountSupporter(h.env, session.accountId)).toBe(false)
    expect(revenueCat).not.toHaveBeenCalled()
  })

  it('ends at the stored expiry with no webhook, after one read', async () => {
    customers.set(RC_A, monthly(T0 + 2 * 60 * 60_000))
    const session = await openTestSession(app, h.env)
    await link(session, RC_A)
    now = T0 + 3 * 60 * 60_000
    expect(await isAccountSupporter(h.env, session.accountId)).toBe(false)
    // The end passed since the read: asked once whether it renewed.
    expect(askedAbout()).toEqual([RC_A, RC_A])
    // That read was after the end, so it stands until it's a day old.
    now += 60 * 60_000
    expect(await isAccountSupporter(h.env, session.accountId)).toBe(false)
    expect(askedAbout()).toEqual([RC_A, RC_A])
  })

  it('keeps a Supporter whose subscription renewed at its end, with no webhook', async () => {
    customers.set(RC_A, monthly(T0 + 2 * 60 * 60_000))
    const session = await openTestSession(app, h.env)
    await link(session, RC_A)
    customers.set(RC_A, monthly(T0 + 31 * DAY))
    now = T0 + 2 * 60 * 60_000 + 1
    expect(await isAccountSupporter(h.env, session.accountId)).toBe(true)
    now += 60 * 60_000
    expect(await isAccountSupporter(h.env, session.accountId)).toBe(true)
    expect(askedAbout()).toEqual([RC_A, RC_A])
  })

  it('is a Supporter when one stale read finds one, though another fails', async () => {
    customers.set(RC_A, free)
    customers.set(RC_B, free)
    const session = await openTestSession(app, h.env)
    await link(session, RC_A)
    await link(session, RC_B)
    customers.set(RC_A, 500)
    customers.set(RC_B, lifetime)
    now = T0 + 2 * DAY
    expect(await isAccountSupporter(h.env, session.accountId)).toBe(true)
    customers.set(RC_B, free)
    now = T0 + 4 * DAY
    await expect(
      isAccountSupporter(h.env, session.accountId)
    ).rejects.toMatchObject({ name: 'RevenueCatError' })
  })

  it('reads a record over a day old from RevenueCat again', async () => {
    customers.set(RC_A, lifetime)
    const session = await openTestSession(app, h.env)
    await link(session, RC_A)
    customers.set(RC_A, free)
    now = T0 + DAY - 1
    expect(await isAccountSupporter(h.env, session.accountId)).toBe(true)
    now = T0 + DAY + 1
    expect(await isAccountSupporter(h.env, session.accountId)).toBe(false)
    expect(askedAbout()).toEqual([RC_A, RC_A])
  })

  it('fails closed when a stale record can’t be read again', async () => {
    customers.set(RC_A, lifetime)
    const session = await openTestSession(app, h.env)
    await link(session, RC_A)
    customers.set(RC_A, 500)
    now = T0 + 2 * DAY
    await expect(
      isAccountSupporter(h.env, session.accountId)
    ).rejects.toMatchObject({ name: 'RevenueCatError' })
    const response = await status(session)
    expect(response.status).toBe(503)
    expect(response.body.code).toBe('unavailable')
  })

  it('has no Supporter without the accounts database', async () => {
    expect(
      await isAccountSupporter(
        { REVENUECAT_API_KEY: 'k', ACCOUNTS_DB: undefined },
        'any-account-id-000000'
      )
    ).toBe(false)
  })
})

describe('the webhook', () => {
  it('refuses a missing or wrong Authorization header in constant time', async () => {
    for (const authorization of [
      '',
      'Bearer wrong',
      WEBHOOK_SECRET,
      `Bearer ${WEBHOOK_SECRET}x`,
    ]) {
      const response = await webhook({ id: 'e1' }, authorization)
      expect(response.status, authorization).toBe(401)
    }
    expect(revenueCat).not.toHaveBeenCalled()
  })

  it('is disabled without its secret', async () => {
    delete (h.env as Partial<Environment>).REVENUECAT_WEBHOOK_AUTHORIZATION
    const response = await webhook({ id: 'e1' })
    expect(response.status).toBe(503)
    expect(response.body.code).toBe('disabled')
  })

  it('reads every linked customer an event names again, from RevenueCat', async () => {
    customers.set(RC_A, lifetime)
    const session = await openTestSession(app, h.env)
    await link(session, RC_A)
    revenueCat.mockClear()

    // The body says nothing useful about status; RevenueCat is the authority.
    customers.set(RC_A, free)
    now += 60_000
    const response = await webhook({
      id: 'evt-1',
      type: 'EXPIRATION',
      app_user_id: RC_A,
      original_app_user_id: '$RCAnonymousID:abc',
      aliases: [RC_A, 'unlinked-customer-000000'],
    })
    expect(response.body).toEqual({ ok: true, customers: 1 })
    expect(askedAbout()).toEqual([RC_A])
    expect(await isAccountSupporter(h.env, session.accountId)).toBe(false)
  })

  it('ignores customers nobody linked, storing nothing', async () => {
    customers.set(RC_A, lifetime)
    const response = await webhook({
      id: 'evt-2',
      type: 'INITIAL_PURCHASE',
      app_user_id: RC_A,
    })
    expect(response.body).toEqual({ ok: true, customers: 0 })
    expect(revenueCat).not.toHaveBeenCalled()
    const rows = await h
      .accountsDb!.prepare('SELECT COUNT(*) AS n FROM revenuecat_customers')
      .first<{ n: number }>()
    expect(rows?.n).toBe(0)
  })

  it('reads both sides of a transfer', async () => {
    customers.set(RC_A, lifetime)
    customers.set(RC_B, free)
    const from = await openTestSession(app, h.env)
    const to = await openTestSession(app, h.env)
    await link(from, RC_A)
    await link(to, RC_B)

    customers.set(RC_A, free)
    customers.set(RC_B, lifetime)
    now += 60_000
    const response = await webhook({
      id: 'evt-3',
      type: 'TRANSFER',
      transferred_from: [RC_A],
      transferred_to: [RC_B],
    })
    expect(response.body.customers).toBe(2)
    expect(await isAccountSupporter(h.env, from.accountId)).toBe(false)
    expect(await isAccountSupporter(h.env, to.accountId)).toBe(true)
  })

  it('handles each event id once', async () => {
    customers.set(RC_A, lifetime)
    const session = await openTestSession(app, h.env)
    await link(session, RC_A)
    revenueCat.mockClear()
    const event = { id: 'evt-4', type: 'RENEWAL', app_user_id: RC_A }
    expect((await webhook(event)).body).toEqual({ ok: true, customers: 1 })
    expect((await webhook(event)).body).toEqual({
      ok: true,
      customers: 0,
      duplicate: true,
    })
    expect(revenueCat).toHaveBeenCalledTimes(1)
  })

  it('answers 503 so RevenueCat retries when RevenueCat can’t be read, recording nothing', async () => {
    customers.set(RC_A, lifetime)
    const session = await openTestSession(app, h.env)
    await link(session, RC_A)
    customers.set(RC_A, 502)
    const event = { id: 'evt-5', type: 'CANCELLATION', app_user_id: RC_A }
    const failed = await webhook(event)
    expect(failed.status).toBe(503)
    expect(failed.body.code).toBe('unavailable')

    customers.set(RC_A, free)
    expect((await webhook(event)).body).toEqual({ ok: true, customers: 1 })
    expect(await isAccountSupporter(h.env, session.accountId)).toBe(false)
  })

  it('never lets an older read overwrite a newer one', async () => {
    customers.set(RC_A, lifetime)
    const session = await openTestSession(app, h.env)
    await link(session, RC_A)
    // A read that started before the stored one (an event processed late).
    customers.set(RC_A, free)
    now = T0 - 60_000
    await webhook({ id: 'evt-6', type: 'EXPIRATION', app_user_id: RC_A })
    now = T0 + 60_000
    expect(await isAccountSupporter(h.env, session.accountId)).toBe(true)
  })

  it('refuses a body without an event id', async () => {
    for (const event of [{}, { id: 7 }, { id: '' }])
      expect((await webhook(event)).status).toBe(400)
  })

  it('reads only linkable ids from the event', () => {
    expect(
      parseWebhookEvent({
        event: {
          id: 'e',
          type: 'TEST',
          app_user_id: RC_A,
          original_app_user_id: RC_A,
          aliases: [RC_B, '$RCAnonymousID:x', 3],
          transferred_to: ['short'],
        },
      })
    ).toEqual({ id: 'e', type: 'TEST', appUserIds: [RC_A, RC_B] })
    expect(parseWebhookEvent(null)).toBeNull()
    expect(parseWebhookEvent({ event: 'x' })).toBeNull()
  })
})

describe('pruning', () => {
  it('drops old event ids and customers no account links', async () => {
    customers.set(RC_A, lifetime)
    const session = await openTestSession(app, h.env)
    await link(session, RC_A)
    await webhook({ id: 'old', type: 'RENEWAL', app_user_id: RC_A })
    const db = accountsDb(h.accountsDb!)
    await h
      .accountsDb!.prepare('DELETE FROM account_revenuecat_customers')
      .run()
    await pruneSupporterRecords(
      db,
      T0 + SUPPORTER_LINK_LIMITS.webhookEventRetentionMs + 1
    )
    const count = async (table: string) =>
      (
        await h
          .accountsDb!.prepare(`SELECT COUNT(*) AS n FROM ${table}`)
          .first<{
            n: number
          }>()
      )?.n
    expect(await count('revenuecat_customers')).toBe(0)
    expect(await count('revenuecat_webhook_events')).toBe(0)
  })
})
