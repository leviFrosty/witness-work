import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHarness, SigningKey, b64u, randomBytes, randomId, type Harness } from '../test/buddies'
import { bearer, openTestSession, postJson, requestJson, type TestSession } from '../test/accounts'
import type { Environment } from '../types'
import { accountSignedMessage, rekeyNewKeyMessage } from './contracts'
import { resetAccountStatusCache } from './auth'
import { createAccountsRoutes } from './route'
import { accountsDb } from './store'
import { defaultSupporterDependencies, pruneSupporterRecords } from './supporter'

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
 * Supporter links across a key change (witness-work ADR 0039 §9): the change
 * unlinks the account's RevenueCat customers from every other account and
 * locks them to it for 90 days; and `GET /sessions` lists each session's app
 * version for the change's warning about old versions (§10).
 */

const START = Date.UTC(2026, 9, 30, 12)
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const RC_SHARED = 'A1B2C3D4-0000-4000-8000-00000000000a'
const RC_OTHER = 'A1B2C3D4-0000-4000-8000-00000000000b'
const RC_THIRD = 'A1B2C3D4-0000-4000-8000-00000000000c'
/** Another app user id of `RC_SHARED`'s customer (RevenueCat aliases). */
const RC_ALIAS = 'A1B2C3D4-0000-4000-8000-0000000000aa'
const RC_ALIAS_2 = 'A1B2C3D4-0000-4000-8000-0000000000ab'
const lifetime = {
  subscriber: { entitlements: { 'Lifetime Supporter': { expires_date: null } } },
}

/** What RevenueCat says about each id beyond Supporter status: its original id, aliases. */
let identities: Map<string, { original_app_user_id?: string; aliases?: string[] }>
let h: Harness
const app = createAccountsRoutes() as never

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  h = await createHarness()
  resetAccountStatusCache()
  const env = h.env as Environment & Record<string, unknown>
  env.REVENUECAT_API_KEY = 'sk_test'
  identities = new Map()
  vi.spyOn(defaultSupporterDependencies, 'fetch').mockImplementation(async (input) => {
    const id = decodeURIComponent(String(input).split('/').pop()!)
    const named = identities.get(id) ?? {}
    return Response.json({
      subscriber: { ...lifetime.subscriber, original_app_user_id: id, ...named },
    })
  })
  vi.spyOn(defaultSupporterDependencies, 'now').mockImplementation(() => Date.now())
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const advance = (ms: number) => vi.setSystemTime(Date.now() + ms)
const sql = (query: string, ...params: (string | number | null)[]) =>
  h.accountsDb!.db.prepare(query).all(...params) as Record<string, unknown>[]
const encoder = new TextEncoder()

const link = (session: Pick<TestSession, 'accessToken'>, appUserId: string) =>
  postJson(app, h.env, '/revenuecat-customers', { appUserId }, bearer(session.accessToken))
const links = (accountId: string) =>
  sql(
    'SELECT app_user_id FROM account_revenuecat_customers WHERE account_id = ? ORDER BY app_user_id',
    accountId
  ).map((row) => row.app_user_id)

const rekey = async (session: TestSession, keyEpoch = 0) => {
  const newKey = await SigningKey.generate()
  const bytes = encoder.encode(
    JSON.stringify({
      accountPub: session.key.publicKey,
      ts: Date.now(),
      nonce: randomId(),
      newAccountPub: newKey.publicKey,
      keyEpoch,
      history: b64u(randomBytes(100)),
    })
  )
  const response = await postJson(
    app,
    h.env,
    '/account/rekey',
    {
      payload: b64u(bytes),
      signature: b64u(await session.key.sign(accountSignedMessage('account/rekey', bytes))),
      newSignature: b64u(await newKey.sign(rekeyNewKeyMessage(bytes))),
    },
    bearer(session.accessToken)
  )
  expect(response.status).toBe(200)
  return { ...session, key: newKey, accessToken: response.body.accessToken as string }
}

describe('Supporter links across a key change', () => {
  it('unlinks the account’s customers from accounts that linked them later, and keeps its own', async () => {
    const owner = await openTestSession(app, h.env)
    const thief = await openTestSession(app, h.env)
    const bystander = await openTestSession(app, h.env)
    const earlier = await openTestSession(app, h.env)
    expect((await link(earlier, RC_THIRD)).status).toBe(200)
    advance(MINUTE)
    expect((await link(owner, RC_SHARED)).status).toBe(200)
    expect((await link(owner, RC_THIRD)).status).toBe(200)
    advance(MINUTE)
    expect((await link(thief, RC_SHARED)).status).toBe(200)
    expect((await link(thief, RC_OTHER)).status).toBe(200)
    expect((await link(bystander, RC_THIRD)).status).toBe(200)

    await rekey(owner)
    expect(links(owner.accountId)).toEqual([RC_SHARED, RC_THIRD])
    // Only the changing account's customers, and only from later links.
    expect(links(thief.accountId)).toEqual([RC_OTHER])
    expect(links(bystander.accountId)).toEqual([])
    expect(links(earlier.accountId)).toEqual([RC_THIRD])
    // Locked only where this account linked first: RC_THIRD is `earlier`'s.
    expect(
      sql('SELECT app_user_id, account_id, locked_until FROM revenuecat_customer_locks ORDER BY app_user_id')
    ).toEqual([
      { app_user_id: RC_SHARED, account_id: owner.accountId, locked_until: START + 2 * MINUTE + 90 * DAY },
    ])
  })

  it('neither unlinks nor locks out the earlier owner when a later account changes its key', async () => {
    const owner = await openTestSession(app, h.env)
    const attacker = await openTestSession(app, h.env)
    const later = await openTestSession(app, h.env)
    expect((await link(owner, RC_SHARED)).status).toBe(200)
    advance(MINUTE)
    expect((await link(attacker, RC_SHARED)).status).toBe(200)
    advance(MINUTE)
    expect((await link(later, RC_SHARED)).status).toBe(200)
    await rekey(attacker)
    // The owner linked first: its link stays, and nothing is locked.
    expect(links(owner.accountId)).toEqual([RC_SHARED])
    expect(links(attacker.accountId)).toEqual([RC_SHARED])
    expect(sql('SELECT * FROM revenuecat_customer_locks')).toEqual([])
    // Only an account that linked after the attacker lost it.
    expect(links(later.accountId)).toEqual([])
    // The owner, and the owner's new accounts, link it as before.
    expect((await link(owner, RC_SHARED)).status).toBe(200)
    expect((await link(await openTestSession(app, h.env), RC_SHARED)).status).toBe(200)
  })

  it('lets the earlier owner’s own change unlink and lock out a later attacker', async () => {
    const owner = await openTestSession(app, h.env)
    const attacker = await openTestSession(app, h.env)
    expect((await link(owner, RC_SHARED)).status).toBe(200)
    advance(MINUTE)
    expect((await link(attacker, RC_SHARED)).status).toBe(200)
    const changed = await rekey(attacker)
    advance(MINUTE)
    await rekey(owner)
    expect(links(attacker.accountId)).toEqual([])
    expect(sql('SELECT app_user_id, account_id FROM revenuecat_customer_locks')).toEqual([
      { app_user_id: RC_SHARED, account_id: owner.accountId },
    ])
    const refused = await link(changed, RC_SHARED)
    expect(refused.body).toMatchObject({ code: 'conflict', reason: 'customer_locked' })
  })

  it('locks nothing when another account linked the customer at the same time', async () => {
    const owner = await openTestSession(app, h.env)
    const other = await openTestSession(app, h.env)
    expect((await link(owner, RC_SHARED)).status).toBe(200)
    expect((await link(other, RC_SHARED)).status).toBe(200)
    await rekey(owner)
    expect(links(other.accountId)).toEqual([RC_SHARED])
    expect(sql('SELECT * FROM revenuecat_customer_locks')).toEqual([])
  })

  it('locks by the account’s earliest link to the customer, under any of its ids', async () => {
    identities.set(RC_ALIAS, { original_app_user_id: RC_SHARED })
    const owner = await openTestSession(app, h.env)
    const other = await openTestSession(app, h.env)
    expect((await link(owner, RC_SHARED)).status).toBe(200)
    advance(MINUTE)
    expect((await link(other, RC_ALIAS)).status).toBe(200)
    advance(MINUTE)
    // A later link under another id doesn't make the owner's claim younger.
    expect((await link(owner, RC_ALIAS)).status).toBe(200)
    await rekey(owner)
    expect(links(other.accountId)).toEqual([])
    expect(
      sql('SELECT app_user_id FROM revenuecat_customer_locks ORDER BY app_user_id').map((row) => row.app_user_id)
    ).toEqual([RC_SHARED, RC_ALIAS].sort())
  })

  it('never moves first_linked_at: relinking keeps a link’s age', async () => {
    const owner = await openTestSession(app, h.env)
    const other = await openTestSession(app, h.env)
    expect((await link(other, RC_SHARED)).status).toBe(200)
    advance(MINUTE)
    expect((await link(owner, RC_SHARED)).status).toBe(200)
    advance(MINUTE)
    // Relinking moves linked_at, not first_linked_at, so `other` stays older.
    expect((await link(other, RC_SHARED)).status).toBe(200)
    expect(
      sql('SELECT linked_at, first_linked_at FROM account_revenuecat_customers WHERE account_id = ?', other.accountId)
    ).toEqual([{ linked_at: START + 2 * MINUTE, first_linked_at: START }])
    await rekey(owner)
    expect(links(other.accountId)).toEqual([RC_SHARED])
  })

  it('locks the customer’s original id, so an alias can’t get around it', async () => {
    identities.set(RC_ALIAS, { original_app_user_id: RC_SHARED })
    identities.set(RC_ALIAS_2, { original_app_user_id: RC_ALIAS_2, aliases: [RC_SHARED, '$RCAnonymousID:abc'] })
    const owner = await openTestSession(app, h.env)
    expect((await link(owner, RC_SHARED)).status).toBe(200)
    advance(MINUTE)
    // A later account linked the same customer under an alias: it goes too.
    const thief = await openTestSession(app, h.env)
    expect((await link(thief, RC_ALIAS)).status).toBe(200)
    await rekey(owner)
    expect(links(thief.accountId)).toEqual([])
    for (const alias of [RC_ALIAS, RC_ALIAS_2]) {
      const refused = await link(thief, alias)
      expect(refused.status, alias).toBe(409)
      expect(refused.body).toMatchObject({ code: 'conflict', reason: 'customer_locked' })
    }
    expect(links(thief.accountId)).toEqual([])
  })

  it('locks an aliased customer the account linked under its alias', async () => {
    identities.set(RC_ALIAS, { original_app_user_id: RC_SHARED })
    const owner = await openTestSession(app, h.env)
    expect((await link(owner, RC_ALIAS)).status).toBe(200)
    await rekey(owner)
    const refused = await link(await openTestSession(app, h.env), RC_SHARED)
    expect(refused.body).toMatchObject({ code: 'conflict', reason: 'customer_locked' })
  })

  it('matches a customer whose original id is anonymous', async () => {
    const anonymous = '$RCAnonymousID:0123456789abcdef0123456789abcdef'
    identities.set(RC_SHARED, { original_app_user_id: anonymous })
    identities.set(RC_ALIAS, { original_app_user_id: anonymous })
    const owner = await openTestSession(app, h.env)
    expect((await link(owner, RC_SHARED)).status).toBe(200)
    advance(MINUTE)
    const thief = await openTestSession(app, h.env)
    expect((await link(thief, RC_ALIAS)).status).toBe(200)
    await rekey(owner)
    expect(links(thief.accountId)).toEqual([])
    expect((await link(thief, RC_ALIAS)).body).toMatchObject({ reason: 'customer_locked' })
  })

  it('refuses linking a locked customer to another account for 90 days', async () => {
    const owner = await openTestSession(app, h.env)
    const thief = await openTestSession(app, h.env)
    expect((await link(owner, RC_SHARED)).status).toBe(200)
    const changed = await rekey(owner)

    const refused = await link(thief, RC_SHARED)
    expect(refused.status).toBe(409)
    expect(refused.body).toMatchObject({ code: 'conflict', reason: 'customer_locked' })
    expect(links(thief.accountId)).toEqual([])
    // Refused before RevenueCat is read.
    const reads = vi.mocked(defaultSupporterDependencies.fetch).mock.calls.length
    await link(thief, RC_SHARED)
    expect(vi.mocked(defaultSupporterDependencies.fetch).mock.calls.length).toBe(reads)

    // The account itself still links it.
    expect((await link(changed, RC_SHARED)).status).toBe(200)

    // Any other account, until the lock ends 90 days after the change.
    advance(90 * DAY - MINUTE)
    expect((await link(await openTestSession(app, h.env), RC_SHARED)).status).toBe(409)
    advance(2 * MINUTE)
    expect((await link(await openTestSession(app, h.env), RC_SHARED)).status).toBe(200)
  })

  it('extends the lock with each change', async () => {
    const owner = await openTestSession(app, h.env)
    expect((await link(owner, RC_SHARED)).status).toBe(200)
    const once = await rekey(owner)
    advance(DAY)
    await rekey({ ...once, ...(await refreshed(once)) }, 1)
    expect(sql('SELECT locked_until FROM revenuecat_customer_locks')).toEqual([
      { locked_until: START + DAY + 90 * DAY },
    ])
  })

  it('prunes locks once they end', async () => {
    const owner = await openTestSession(app, h.env)
    expect((await link(owner, RC_SHARED)).status).toBe(200)
    await rekey(owner)
    const db = accountsDb(h.env.ACCOUNTS_DB!)
    await pruneSupporterRecords(db, START + 89 * DAY)
    expect(sql('SELECT COUNT(*) AS n FROM revenuecat_customer_locks')[0].n).toBe(1)
    await pruneSupporterRecords(db, START + 91 * DAY)
    expect(sql('SELECT COUNT(*) AS n FROM revenuecat_customer_locks')[0].n).toBe(0)
  })
})

/** A fresh access token for `session`, after time moved on. */
const refreshed = async (session: Pick<TestSession, 'refreshToken'>) => {
  const response = await postJson(app, h.env, '/sessions/refresh', {
    refreshToken: session.refreshToken,
  })
  expect(response.status).toBe(200)
  return {
    accessToken: response.body.accessToken as string,
    refreshToken: response.body.refreshToken as string,
  }
}

describe('GET /sessions for the old-version warning', () => {
  it('lists each session’s app version, as last opened or refreshed', async () => {
    const phone = await openTestSession(app, h.env, undefined, { appVersion: '1.46.2' })
    const tablet = await openTestSession(app, h.env, phone.key, { appVersion: '1.47.0' })
    await openTestSession(app, h.env, phone.key)
    const refreshedTablet = await postJson(app, h.env, '/sessions/refresh', {
      refreshToken: tablet.refreshToken,
      appVersion: '1.47.1',
    })
    expect(refreshedTablet.status).toBe(200)
    const list = await requestJson(app, h.env, 'GET', '/sessions', undefined, bearer(phone.accessToken))
    const versions = Object.fromEntries(
      (list.body.sessions as { sessionId: string; appVersion?: string }[]).map((row) => [
        row.sessionId,
        row.appVersion ?? null,
      ])
    )
    expect(versions[phone.sessionId]).toBe('1.46.2')
    expect(versions[tablet.sessionId]).toBe('1.47.1')
    expect(Object.values(versions)).toContain(null)
  })
})
