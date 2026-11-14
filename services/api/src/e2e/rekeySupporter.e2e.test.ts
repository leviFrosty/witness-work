import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SigningKey, b64u, randomBytes, randomId } from '../test/buddiesClient'
import { accountSignedMessage, rekeyNewKeyMessage } from '../accounts/contracts'
import {
  DEV_BYPASS_TOKEN,
  REVENUECAT_API_URL,
  bearerHeaders,
  http,
  openSession,
  writeTranscript,
  type E2ESession,
} from '../test/e2e'

/**
 * Supporter links across a key change (witness-work ADR 0039 §9) over real
 * HTTP and the local D1, with a fake RevenueCat as in supporter.e2e.test.ts:
 * another account that linked the changing account's customer later (under
 * the same id or an alias) loses it and can't link it again; the account
 * itself keeps it. Also `GET /sessions`'s `appVersion` (§10).
 *
 * Start the worker with the fake's URL:
 * `REVENUECAT_API_URL=http://127.0.0.1:18790 node scripts/verify/dev.mjs up`.
 */

afterAll(() => {
  writeTranscript('rekey-supporter')
})

const RC_ID = `e2e-${crypto.randomUUID()}`
/** Another app user id of `RC_ID`'s customer. */
const RC_ALIAS = `e2e-${crypto.randomUUID()}`
/** A customer of its own, for the later linker's change. */
const RC_OWNED = `e2e-${crypto.randomUUID()}`
/** Each known id's customer: its original id. */
const originals = new Map([
  [RC_ID, RC_ID],
  [RC_ALIAS, RC_ID],
  [RC_OWNED, RC_OWNED],
])
const lifetime = (original: string) => ({
  subscriber: {
    entitlements: { 'Lifetime Supporter': { expires_date: null } },
    original_app_user_id: original,
  },
})
let fake: Server | null = null

beforeAll(async () => {
  if (!REVENUECAT_API_URL) return
  const { hostname, port } = new URL(REVENUECAT_API_URL)
  fake = createServer((request, response) => {
    const id = decodeURIComponent((request.url ?? '').split('/').pop() ?? '')
    const original = originals.get(id)
    response.writeHead(original ? 200 : 404, { 'content-type': 'application/json' })
    response.end(original ? JSON.stringify(lifetime(original)) : '{}')
  })
  await new Promise<void>((resolve) => fake!.listen(Number(port), hostname, resolve))
})

afterAll(async () => {
  fake?.closeAllConnections()
  await new Promise<void>((resolve) => (fake ? fake.close(() => resolve()) : resolve()))
})

const encoder = new TextEncoder()

const link = (session: Pick<E2ESession, 'accessToken'>, appUserId = RC_ID) =>
  http('POST', '/accounts/v1/revenuecat-customers', {
    body: { appUserId },
    headers: { authorization: `Bearer ${session.accessToken}` },
  })

const supporter = (session: Pick<E2ESession, 'accessToken'>) =>
  http('GET', '/accounts/v1/supporter', {
    headers: { authorization: `Bearer ${session.accessToken}` },
  })

describe.skipIf(!DEV_BYPASS_TOKEN || !REVENUECAT_API_URL)('Supporter links across a key change', () => {
  it('unlinks the customer from accounts that linked it later and locks it to this one', async () => {
    const owner = await openSession()
    const thief = await openSession()
    const aliasThief = await openSession()
    expect((await link(owner)).body).toMatchObject({ ok: true, supporter: true })
    // Later by at least a millisecond.
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect((await link(thief)).body).toMatchObject({ ok: true, supporter: true })
    expect((await link(aliasThief, RC_ALIAS)).body).toMatchObject({ ok: true, supporter: true })

    const newKey = await SigningKey.generate()
    const bytes = encoder.encode(
      JSON.stringify({
        accountPub: owner.key.publicKey,
        ts: Date.now(),
        nonce: randomId(),
        newAccountPub: newKey.publicKey,
        keyEpoch: 0,
        history: b64u(randomBytes(200)),
      })
    )
    const changed = await http('POST', '/accounts/v1/account/rekey', {
      headers: bearerHeaders(owner),
      body: {
        payload: b64u(bytes),
        signature: b64u(await owner.key.sign(accountSignedMessage('account/rekey', bytes))),
        newSignature: b64u(await newKey.sign(rekeyNewKeyMessage(bytes))),
      },
    })
    expect(changed.status).toBe(200)
    const ownerNow = { accessToken: changed.body.accessToken as string }

    // The other account lost the link and can't take it back.
    expect((await supporter(thief)).body).toMatchObject({ supporter: false, customers: 0 })
    const refused = await link(thief)
    expect(refused.status).toBe(409)
    expect(refused.body).toMatchObject({ code: 'conflict', reason: 'customer_locked' })
    // Nor under an alias, nor from a new account.
    expect((await supporter(aliasThief)).body).toMatchObject({ supporter: false, customers: 0 })
    expect((await link(aliasThief, RC_ALIAS)).body).toMatchObject({ reason: 'customer_locked' })
    expect((await link(await openSession())).body).toMatchObject({ reason: 'customer_locked' })

    // The account keeps it, and links it again.
    expect((await supporter(ownerNow)).body).toMatchObject({ supporter: true, customers: 1 })
    expect((await link(ownerNow)).status).toBe(200)
  })

  it('never locks out the earlier owner when a later linker changes its key', async () => {
    const owner = await openSession()
    const attacker = await openSession()
    expect((await link(owner, RC_OWNED)).status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect((await link(attacker, RC_OWNED)).status).toBe(200)

    const newKey = await SigningKey.generate()
    const bytes = encoder.encode(
      JSON.stringify({
        accountPub: attacker.key.publicKey,
        ts: Date.now(),
        nonce: randomId(),
        newAccountPub: newKey.publicKey,
        keyEpoch: 0,
        history: b64u(randomBytes(200)),
      })
    )
    const changed = await http('POST', '/accounts/v1/account/rekey', {
      headers: bearerHeaders(attacker),
      body: {
        payload: b64u(bytes),
        signature: b64u(await attacker.key.sign(accountSignedMessage('account/rekey', bytes))),
        newSignature: b64u(await newKey.sign(rekeyNewKeyMessage(bytes))),
      },
    })
    expect(changed.status).toBe(200)

    // The owner keeps it, and the owner's new account links it too.
    expect((await supporter(owner)).body).toMatchObject({ supporter: true, customers: 1 })
    const ownersNew = await openSession()
    expect((await link(ownersNew, RC_OWNED)).body).toMatchObject({ ok: true, supporter: true })
  })

  it('lists each session’s app version', async () => {
    const key = await SigningKey.generate()
    const bytes = encoder.encode(
      JSON.stringify({ accountPub: key.publicKey, ts: Date.now(), nonce: randomId(), appVersion: '1.46.2' })
    )
    const opened = await http('POST', '/accounts/v1/sessions', {
      headers: { 'x-ww-dev-bypass': DEV_BYPASS_TOKEN ?? '' },
      body: {
        payload: b64u(bytes),
        signature: b64u(await key.sign(accountSignedMessage('session/open', bytes))),
      },
    })
    expect(opened.status).toBe(201)
    const list = await http('GET', '/accounts/v1/sessions', {
      headers: { authorization: `Bearer ${opened.body.accessToken}` },
    })
    expect(list.body.sessions).toEqual([
      expect.objectContaining({ sessionId: opened.body.sessionId, appVersion: '1.46.2', current: true }),
    ])
  })
})
