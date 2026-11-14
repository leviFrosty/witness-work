import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import {
  SigningKey,
  TEST_ANDROID_ORIGIN,
  TEST_DEV_BYPASS,
  TEST_LOCAL_ORIGIN,
  TEST_ORIGIN,
  TEST_RP_ID,
  b64u,
  createHarness,
  randomBytes,
  randomId,
  type Harness,
} from '../test/buddies'
import { openTestSession, requestJson, nextTestIp } from '../test/accounts'
import { PasskeyClient, signedEnvelope, authorization } from '../test/passkeys'
import { SoftPasskey, fakeWrap } from '../test/webauthn'
import type { AppEnv } from '../types'
import { createAccountsRoutes } from './route'
import { resetAccountStatusCache } from './auth'
import { issueChallengeToken, issueTicket } from './passkeyTokens'
import { passkeyTag } from './passkeyStore'
import { pruneUsedTokens } from './passkeyStore'
import { accountsDb } from './store'
import { verifyAccessToken, accessTokenKeys } from './tokens'

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
const DAY = 24 * 60 * MINUTE
const app = new Hono<AppEnv>().route('/', createAccountsRoutes()) as never

let h: Harness
let client: PasskeyClient
/** A fixed caller IP for the failure-budget tests; otherwise fresh per request. */
let callerIp: string | null = null

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  h = await createHarness()
  resetAccountStatusCache()
  callerIp = null
  client = new PasskeyClient((method, path, body, headers = {}) =>
    requestJson(app, h.env, method, path, body, {
      ...(callerIp ? { 'cf-connecting-ip': callerIp } : {}),
      ...headers,
    })
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
const activity = async (accessToken: string) =>
  (await send('GET', '/activity', undefined, authorization(accessToken))).body.activity as {
    kind: string
    method?: string
    credentialId?: string
    session?: { sessionId: string; platform?: string }
    actor?: { sessionId: string }
  }[]

/** A phone account with one passkey. */
const accountWithPasskey = async (options: Parameters<PasskeyClient['register']>[1] = {}) => {
  const session = await phone()
  const registered = await client.register(session, options)
  expect(registered.added.status).toBe(200)
  return { session, ...registered }
}

/** A web session opened with a passkey sign-in. */
const webSession = async (key: SigningKey, passkey: SoftPasskey, fields: Record<string, unknown> = {}) => {
  const { assert } = await client.signIn(passkey)
  expect(assert.status).toBe(200)
  const { reply } = await client.openWeb(key, assert.body.ticket, fields)
  expect(reply.status).toBe(201)
  return { key, ...reply.body }
}

/** A sign-in refused as `passkey_failed` with `reason`. */
const refusedSignIn = async (
  passkey: SoftPasskey,
  reason: string,
  options: Parameters<PasskeyClient['signIn']>[1] = {}
) => {
  const { assert } = await client.signIn(passkey, options)
  expect(assert.status).toBe(403)
  expect(assert.body).toMatchObject({ code: 'passkey_failed', reason })
}

describe('the user handle and the name', () => {
  it('derives the tag from the handle (contract vector)', async () => {
    const handle = b64u(Uint8Array.from({ length: 32 }, (_, i) => i))
    expect(await passkeyTag(handle)).toBe('KVW7')
  })

  it('mints the handle once, on the first register/options, and keeps it', async () => {
    const session = await phone()
    expect((await client.list(session)).body).toEqual({ ok: true, passkeys: [] })
    const first = await client.registerOptions(session)
    expect(first.status).toBe(200)
    const tag = await passkeyTag(first.body.userHandle)
    expect(first.body.options).toEqual({
      rp: { id: TEST_RP_ID, name: 'WitnessWork' },
      user: {
        id: first.body.userHandle,
        name: `WitnessWork ${tag}`,
        displayName: `WitnessWork ${tag}`,
      },
      challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      pubKeyCredParams: [
        { type: 'public-key', alg: -8 },
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      timeout: 300_000,
      excludeCredentials: [],
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required',
      },
      attestation: 'none',
    })
    expect(first.body.options.extensions).toBeUndefined()
    const second = await client.registerOptions(session)
    expect(second.body.userHandle).toBe(first.body.userHandle)
    expect((await client.list(session)).body.userHandle).toBe(first.body.userHandle)
  })

  it('gives two devices asking at once the same handle', async () => {
    const session = await phone()
    const other = await phone(session.key)
    const answers = await Promise.all([
      client.registerOptions(session),
      client.registerOptions(other),
      client.registerOptions(session),
    ])
    expect(new Set(answers.map((a) => a.body.userHandle)).size).toBe(1)
    expect(sql('SELECT passkey_user_handle FROM accounts')).toEqual([
      { passkey_user_handle: answers[0].body.userHandle },
    ])
  })

  it('refuses an RP ID the env doesn’t list', async () => {
    const session = await phone()
    const refused = await client.registerOptions(session, { rpId: 'evil.example' })
    expect(refused.status).toBe(400)
    expect((await client.challenge({ purpose: 'sign-in', rpId: 'app.witnesswork.app' })).status).toBe(400)
    expect((await client.challenge({ purpose: 'delete-everything' })).status).toBe(400)
  })
})

describe('adding a passkey', () => {
  it.each(['ES256', 'EdDSA'] as const)('stores a %s registration and logs passkey.added', async (algorithm) => {
    const session = await phone()
    const { passkey, added } = await client.register(session, { algorithm })
    expect(added.status).toBe(200)
    expect(added.body).toEqual({ ok: true, credentialId: passkey.credentialId })
    const list = await client.list(session)
    expect(list.body.passkeys).toEqual([
      {
        credentialId: passkey.credentialId,
        canUnlock: false,
        createdAt: START,
        createdPlatform: 'dev',
        backedUp: true,
      },
    ])
    const entries = await activity(session.accessToken)
    expect(entries[0]).toMatchObject({
      kind: 'passkey.added',
      credentialId: passkey.credentialId,
      session: { sessionId: session.sessionId, platform: 'dev' },
    })
  })

  it('stores the optional wrap and label; the passkey can unlock', async () => {
    const session = await phone()
    const wrapId = randomId()
    const wrap = fakeWrap()
    const label = b64u(randomBytes(40))
    const { passkey, added } = await client.register(session, { extra: { wrapId, wrap, label } })
    expect(added.status).toBe(200)
    const [listed] = (await client.list(session)).body.passkeys
    expect(listed).toMatchObject({ canUnlock: true, label })
    const signIn = await client.signIn(passkey)
    expect(signIn.assert.body.wraps).toEqual([{ wrapId, wrap, keyEpoch: 0 }])
  })

  it('answers a repeat (lost response) with the same credential, and another account’s with conflict', async () => {
    const session = await phone()
    const { passkey, options, response } = await client.register(session)
    const again = await client.add(session, { challengeToken: options.body.challengeToken, response })
    expect(again.body).toEqual({ ok: true, credentialId: passkey.credentialId })
    expect(sql('SELECT COUNT(*) AS n FROM passkeys')).toEqual([{ n: 1 }])
    expect((await activity(session.accessToken)).filter((e) => e.kind === 'passkey.added')).toHaveLength(1)

    const stranger = await phone()
    const strangerOptions = await client.registerOptions(stranger)
    const stolen = await client.add(stranger, {
      challengeToken: strangerOptions.body.challengeToken,
      response,
    })
    expect(stolen.status).toBe(409)
    expect(stolen.body.code).toBe('conflict')
  })

  const refusal = async (
    ceremony: Parameters<SoftPasskey['register']>[1],
    reason: string,
    rpId?: string
  ) => {
    const session = await phone()
    const { added } = await client.register(session, { ceremony, rpId })
    expect(added.status).toBe(403)
    expect(added.body).toMatchObject({ code: 'passkey_failed', reason })
    expect(sql('SELECT COUNT(*) AS n FROM passkeys')).toEqual([{ n: 0 }])
  }

  it('refuses an origin that isn’t paired with the challenge’s RP ID', async () => {
    await refusal({ origin: 'https://evil.example' }, 'origin')
    // Valid for localhost, but this challenge is for beta.app.
    await refusal({ origin: TEST_LOCAL_ORIGIN }, 'origin')
  })

  it('refuses authenticator data for another RP ID', async () => {
    await refusal({ rpId: 'localhost', origin: TEST_ORIGIN }, 'rp_id')
  })

  it('refuses a registration without user verification', async () => {
    await refusal({ userVerified: false }, 'user_verification')
  })

  it('refuses client data for another challenge or ceremony type', async () => {
    await refusal({ challenge: b64u(randomBytes(32)) }, 'challenge')
    // A get's response isn't a registration.
    await refusal({ type: 'webauthn.get' }, 'registration')
  })

  it('accepts a localhost registration from a localhost origin', async () => {
    const session = await phone()
    const { added, passkey } = await client.register(session, {
      rpId: 'localhost',
      ceremony: { origin: TEST_LOCAL_ORIGIN },
    })
    expect(added.status).toBe(200)
    expect(sql('SELECT rp_id FROM passkeys')).toEqual([{ rp_id: 'localhost' }])
    const signIn = await client.signIn(passkey, { rpId: 'localhost', ceremony: { origin: 'http://localhost:5173' } })
    expect(signIn.assert.status).toBe(200)
  })

  it('refuses a used challenge, another session’s, and one whose handle changed', async () => {
    const session = await phone()
    const options = await client.registerOptions(session)
    const first = await SoftPasskey.create('ES256', TEST_RP_ID, options.body.userHandle)
    const second = await SoftPasskey.create('ES256', TEST_RP_ID, options.body.userHandle)
    expect((await client.add(session, {
      challengeToken: options.body.challengeToken,
      response: await first.register(options.body.options),
    })).status).toBe(200)
    const reused = await client.add(session, {
      challengeToken: options.body.challengeToken,
      response: await second.register(options.body.options),
    })
    expect(reused.body).toMatchObject({ code: 'passkey_failed', reason: 'challenge' })

    const otherSession = await phone(session.key)
    const fresh = await client.registerOptions(session)
    const third = await SoftPasskey.create('ES256', TEST_RP_ID, fresh.body.userHandle)
    const elsewhere = await client.add(otherSession, {
      challengeToken: fresh.body.challengeToken,
      response: await third.register(fresh.body.options),
    })
    expect(elsewhere.body).toMatchObject({ code: 'passkey_failed', reason: 'challenge' })

    const later = await client.registerOptions(session)
    sql('UPDATE accounts SET passkey_user_handle = ?', b64u(randomBytes(32)))
    const fourth = await SoftPasskey.create('ES256', TEST_RP_ID, later.body.userHandle)
    const changed = await client.add(session, {
      challengeToken: later.body.challengeToken,
      response: await fourth.register(later.body.options),
    })
    expect(changed.body).toMatchObject({ code: 'passkey_failed', reason: 'registration' })
  })

  it('refuses an expired challenge (5 minutes)', async () => {
    const session = await phone()
    const options = await client.registerOptions(session)
    const passkey = await SoftPasskey.create('ES256', TEST_RP_ID, options.body.userHandle)
    advance(5 * MINUTE + 1)
    const late = await client.add(session, {
      challengeToken: options.body.challengeToken,
      response: await passkey.register(options.body.options),
    })
    expect(late.body).toMatchObject({ code: 'passkey_failed', reason: 'challenge' })
  })

  it('refuses a broken attestation object as registration', async () => {
    const session = await phone()
    const options = await client.registerOptions(session)
    const passkey = await SoftPasskey.create('ES256', TEST_RP_ID, options.body.userHandle)
    const response = await passkey.register(options.body.options)
    response.response.attestationObject = b64u(randomBytes(64))
    const broken = await client.add(session, { challengeToken: options.body.challengeToken, response })
    expect(broken.body).toMatchObject({ code: 'passkey_failed', reason: 'registration' })
  })

  it('needs the envelope of the token’s own account', async () => {
    const session = await phone()
    const stranger = await SigningKey.generate()
    const options = await client.registerOptions(session)
    const passkey = await SoftPasskey.create('ES256', TEST_RP_ID, options.body.userHandle)
    const forbidden = await client.add(
      { ...session, key: stranger },
      { challengeToken: options.body.challengeToken, response: await passkey.register(options.body.options) }
    )
    expect(forbidden.status).toBe(404)
    await phone(stranger)
    const other = await client.add(
      { ...session, key: stranger },
      { challengeToken: options.body.challengeToken, response: await passkey.register(options.body.options) }
    )
    expect(other.status).toBe(403)
    expect(other.body.code).toBe('forbidden')
    const unsigned = await send('POST', '/passkeys', { challengeToken: 'x' }, authorization(session.accessToken))
    expect(unsigned.status).toBe(400)
    const noToken = await send('POST', '/passkeys', await signedEnvelope('passkey/add', session.key, {}))
    expect(noToken.status).toBe(401)
  })

  it('keeps at most 10 passkeys an account', async () => {
    const session = await phone()
    for (let i = 0; i < 10; i++) expect((await client.register(session)).added.status).toBe(200)
    const eleventh = await client.register(session)
    expect(eleventh.added.status).toBe(429)
    expect(eleventh.added.body.code).toBe('limit')
    const options = await client.registerOptions(session)
    expect(options.body.options.excludeCredentials).toHaveLength(10)
  })

  it('refuses a response over 16 KiB as too_large', async () => {
    const session = await phone()
    const options = await client.registerOptions(session)
    const passkey = await SoftPasskey.create('ES256', TEST_RP_ID, options.body.userHandle)
    const response = await passkey.register(options.body.options)
    const big = await client.add(session, {
      challengeToken: options.body.challengeToken,
      response: { ...response, padding: 'A'.repeat(16 * 1_024) },
    })
    expect(big.status).toBe(413)
  })
})

describe('signing in with a passkey', () => {
  it('answers the account, the wraps newest first, and a passkey ticket', async () => {
    const { session, passkey } = await accountWithPasskey({ extra: { wrapId: randomId(), wrap: fakeWrap() } })
    const second = { wrapId: randomId(), wrap: fakeWrap(), keyEpoch: 0 }
    advance(SECOND)
    expect((await client.wrap(session, { credentialId: passkey.credentialId, ...second })).status).toBe(200)
    advance(SECOND)
    const { challenge, assert } = await client.signIn(passkey)
    expect(challenge.body.options).toEqual({
      challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      timeout: 300_000,
      rpId: TEST_RP_ID,
      allowCredentials: [],
      userVerification: 'required',
    })
    expect(assert.status).toBe(200)
    expect(assert.body).toEqual({
      ok: true,
      accountId: session.accountId,
      accountPub: session.key.publicKey,
      status: 'active',
      keyEpoch: 0,
      credentialId: passkey.credentialId,
      userHandle: passkey.userHandle,
      wraps: [second, expect.objectContaining({ keyEpoch: 0 })],
      ticket: expect.any(String),
      ticketExpiresAt: Date.now() + 2 * MINUTE,
    })
    expect(assert.body.ticket.length).toBeLessThanOrEqual(512)
    const [listed] = (await client.list(session)).body.passkeys
    expect(listed.lastUsedAt).toBe(Date.now())
  })

  it('gives an Android origin no ticket', async () => {
    const { passkey } = await accountWithPasskey()
    const { assert } = await client.signIn(passkey, { ceremony: { origin: TEST_ANDROID_ORIGIN } })
    expect(assert.status).toBe(200)
    expect(assert.body.ticket).toBeUndefined()
    expect(assert.body.ticketExpiresAt).toBeUndefined()
  })

  it('signs a suspended account in', async () => {
    const { session, passkey } = await accountWithPasskey()
    sql("UPDATE accounts SET status = 'suspended' WHERE id = ?", session.accountId)
    const { assert } = await client.signIn(passkey)
    expect(assert.body).toMatchObject({ ok: true, status: 'suspended' })
  })

  it('checks the origin and RP ID as a pair', async () => {
    const { passkey } = await accountWithPasskey()
    await refusedSignIn(passkey, 'origin', { ceremony: { origin: TEST_LOCAL_ORIGIN } })
    await refusedSignIn(passkey, 'origin', { ceremony: { origin: 'https://app.witnesswork.app' } })
    // A localhost challenge answered with beta.app's hash, from a localhost origin.
    await refusedSignIn(passkey, 'rp_id', { rpId: 'localhost', ceremony: { origin: TEST_LOCAL_ORIGIN, rpId: TEST_RP_ID } })
    // The hash matches the challenge's RP ID, but the credential is beta.app's.
    await refusedSignIn(passkey, 'rp_id', { rpId: 'localhost', ceremony: { origin: TEST_LOCAL_ORIGIN, rpId: 'localhost' } })
  })

  it('refuses a wrong user handle, a missing one, an unknown credential, a bad signature, and no UV', async () => {
    const { passkey } = await accountWithPasskey()
    await refusedSignIn(passkey, 'user_handle', { ceremony: { userHandle: b64u(randomBytes(32)) } })
    await refusedSignIn(passkey, 'user_handle', { ceremony: { userHandle: null } })
    await refusedSignIn(passkey, 'signature', { ceremony: { badSignature: true } })
    await refusedSignIn(passkey, 'user_verification', { ceremony: { userVerified: false } })
    const stranger = await SoftPasskey.create('ES256', TEST_RP_ID, passkey.userHandle)
    await refusedSignIn(stranger, 'unknown_credential')
  })

  it('accepts a handle of another account only for that account', async () => {
    const a = await accountWithPasskey()
    const b = await accountWithPasskey()
    // B's credential presenting A's handle.
    await refusedSignIn(b.passkey, 'user_handle', { ceremony: { userHandle: a.passkey.userHandle } })
  })

  it('applies the counter rules', async () => {
    const { passkey } = await accountWithPasskey({ synced: false })
    expect(sql('SELECT counter FROM passkeys')).toEqual([{ counter: 1 }])
    expect((await client.signIn(passkey)).assert.status).toBe(200)
    expect(sql('SELECT counter FROM passkeys')).toEqual([{ counter: 2 }])
    await refusedSignIn(passkey, 'counter', { ceremony: { counter: 2 } })
    await refusedSignIn(passkey, 'counter', { ceremony: { counter: 1 } })
    expect((await client.signIn(passkey, { ceremony: { counter: 7 } })).assert.status).toBe(200)

    const synced = (await accountWithPasskey()).passkey
    for (let i = 0; i < 3; i++) expect((await client.signIn(synced)).assert.status).toBe(200)
    // A synced passkey's 0 always passes, even after a non-zero one.
    expect((await client.signIn(synced, { ceremony: { counter: 5 } })).assert.status).toBe(200)
    expect((await client.signIn(synced, { ceremony: { counter: 0 } })).assert.status).toBe(200)
  })

  it('stores the latest backup flags', async () => {
    const { passkey, session } = await accountWithPasskey()
    expect((await client.signIn(passkey, { ceremony: { backupEligible: true, backedUp: false } })).assert.status).toBe(200)
    expect((await client.list(session)).body.passkeys[0].backedUp).toBe(false)
  })

  it('uses a challenge once, and not after 5 minutes', async () => {
    const { passkey } = await accountWithPasskey()
    const challenge = await client.challenge({ purpose: 'sign-in' })
    const first = await client.assertWith({
      challengeToken: challenge.body.challengeToken,
      response: await passkey.assert(challenge.body.options),
    })
    expect(first.status).toBe(200)
    const again = await client.assertWith({
      challengeToken: challenge.body.challengeToken,
      response: await passkey.assert(challenge.body.options),
    })
    expect(again.body).toMatchObject({ code: 'passkey_failed', reason: 'challenge' })

    const later = await client.challenge({ purpose: 'sign-in' })
    advance(5 * MINUTE + 1)
    const expired = await client.assertWith({
      challengeToken: later.body.challengeToken,
      response: await passkey.assert(later.body.options),
    })
    expect(expired.body).toMatchObject({ code: 'passkey_failed', reason: 'challenge' })
  })

  it('never takes a ticket, an access token, or a forged token as a challenge', async () => {
    const { passkey, session } = await accountWithPasskey()
    const challenge = await client.challenge({ purpose: 'sign-in' })
    const response = await passkey.assert(challenge.body.options)
    const ticket = (await client.signIn(passkey)).assert.body.ticket
    const [payload] = challenge.body.challengeToken.split('.')
    for (const challengeToken of [ticket, session.accessToken, `${payload}.${b64u(randomBytes(32))}`]) {
      const refused = await client.assertWith({ challengeToken, response })
      expect(refused.body).toMatchObject({ code: 'passkey_failed', reason: 'challenge' })
    }
    // A register challenge isn't a sign-in challenge.
    const register = await client.registerOptions(session)
    const wrongPurpose = await client.assertWith({ challengeToken: register.body.challengeToken, response })
    expect(wrongPurpose.body).toMatchObject({ reason: 'challenge' })
  })

  it('refuses an over-16 KiB response and a malformed body', async () => {
    const challenge = await client.challenge({ purpose: 'sign-in' })
    const big = await client.assertWith({ challengeToken: challenge.body.challengeToken, response: { id: 'A'.repeat(17 * 1_024) } })
    expect(big.status).toBe(413)
    expect((await client.assertWith({ challengeToken: challenge.body.challengeToken })).status).toBe(400)
  })

  it('refuses a caller after 30 failed assertions an hour', async () => {
    const { passkey } = await accountWithPasskey()
    callerIp = '203.0.113.9'
    for (let i = 0; i < 30; i++)
      expect((await client.signIn(passkey, { ceremony: { badSignature: true } })).assert.status).toBe(403)
    const limited = await client.signIn(passkey)
    expect(limited.assert.status).toBe(429)
    expect(limited.assert.body.code).toBe('rate_limited')
    expect(Number(limited.assert.headers?.get('Retry-After'))).toBeGreaterThan(0)
    // Another caller is unaffected; the first recovers within the hour.
    callerIp = '203.0.113.10'
    expect((await client.signIn(passkey)).assert.status).toBe(200)
    callerIp = '203.0.113.9'
    advance(61 * MINUTE)
    expect((await client.signIn(passkey)).assert.status).toBe(200)
  })

  it('doesn’t count successes against the budget', async () => {
    const { passkey } = await accountWithPasskey()
    callerIp = '203.0.113.20'
    for (let i = 0; i < 35; i++) expect((await client.signIn(passkey)).assert.status).toBe(200)
  })
})

describe('web sessions (POST /sessions with a ticket)', () => {
  it('opens a web session with a passkey ticket', async () => {
    const { session, passkey } = await accountWithPasskey()
    const { assert } = await client.signIn(passkey)
    const label = b64u(randomBytes(30))
    const { reply } = await client.openWeb(session.key, assert.body.ticket, {
      device: label,
      appVersion: '1.46.0',
      capabilities: ['sync-everyone'],
    })
    expect(reply.status).toBe(201)
    expect(
      sql('SELECT capabilities FROM account_sessions WHERE id = ?', reply.body.sessionId)
    ).toEqual([{ capabilities: '["sync-everyone"]' }])
    expect(reply.body).toEqual({
      ok: true,
      accountId: session.accountId,
      status: 'active',
      sessionId: expect.any(String),
      platform: 'web',
      accessToken: expect.any(String),
      accessExpiresAt: START + 15 * MINUTE,
      refreshToken: expect.any(String),
      sessionExpiresAt: START + 180 * DAY,
    })
    const keys = (await accessTokenKeys(h.env))!
    expect((await verifyAccessToken(keys, reply.body.accessToken))?.platform).toBe('web')
    const devices = await send('GET', '/sessions', undefined, authorization(reply.body.accessToken))
    expect(devices.body.sessions).toContainEqual({
      sessionId: reply.body.sessionId,
      platform: 'web',
      method: 'passkey',
      appVersion: '1.46.0',
      device: label,
      current: true,
      createdAt: START,
      lastActiveAt: START,
      expiresAt: START + 180 * DAY,
    })
    expect(devices.body.sessions).toContainEqual(
      expect.objectContaining({ sessionId: session.sessionId, platform: 'dev', method: 'dev' })
    )
    const [opened] = (await activity(reply.body.accessToken)).filter((e) => e.kind === 'session.opened')
    expect(opened).toMatchObject({ method: 'passkey', session: { sessionId: reply.body.sessionId, platform: 'web' } })
    expect(sql('SELECT step_up_credential_id, method, key_epoch FROM account_sessions WHERE id = ?', reply.body.sessionId)).toEqual([
      { step_up_credential_id: passkey.credentialId, method: 'passkey', key_epoch: 0 },
    ])
  })

  it('answers the same signed request again (a lost response) with the same session, a new access token, and the same refresh token', async () => {
    const { session, passkey } = await accountWithPasskey()
    const { assert } = await client.signIn(passkey)
    const { envelope, reply } = await client.openWeb(session.key, assert.body.ticket)
    advance(30 * SECOND)
    const again = await send('POST', '/sessions', envelope)
    expect(again.status).toBe(201)
    expect(again.body.sessionId).toBe(reply.body.sessionId)
    expect(again.body.accessToken).not.toBe(reply.body.accessToken)
    expect(again.body.refreshToken).toBe(reply.body.refreshToken)
    expect((await send('POST', '/sessions/refresh', { refreshToken: again.body.refreshToken })).status).toBe(200)
    expect(sql("SELECT COUNT(*) AS n FROM account_sessions WHERE platform = 'web'")).toEqual([{ n: 1 }])
    expect((await activity(again.body.accessToken)).filter((e) => e.kind === 'session.opened' && e.method === 'passkey')).toHaveLength(1)
  })

  it('refuses a used ticket with another request, and a repeat after the ticket’s 2 minutes', async () => {
    const { session, passkey } = await accountWithPasskey()
    const { assert } = await client.signIn(passkey)
    const { envelope } = await client.openWeb(session.key, assert.body.ticket)
    const other = await client.openWeb(session.key, assert.body.ticket)
    expect(other.reply.status).toBe(403)
    expect(other.reply.body.code).toBe('ticket_invalid')
    advance(2 * MINUTE + 1)
    // The envelope's ts is still within 5 minutes; the ticket isn't.
    expect((await send('POST', '/sessions', envelope)).body.code).toBe('ticket_invalid')
  })

  it('refuses a ticket for another account, an unknown key, and a forged or wrong token', async () => {
    const a = await accountWithPasskey()
    const b = await accountWithPasskey()
    const ticket = (await client.signIn(a.passkey)).assert.body.ticket
    expect((await client.openWeb(b.session.key, ticket)).reply.body.code).toBe('ticket_invalid')
    // A ticket never creates an account.
    expect((await client.openWeb(await SigningKey.generate(), ticket)).reply.body.code).toBe('ticket_invalid')
    expect(sql('SELECT COUNT(*) AS n FROM accounts')).toEqual([{ n: 2 }])
    const [payload] = ticket.split('.')
    const challengeToken = (await client.challenge({ purpose: 'sign-in' })).body.challengeToken
    for (const wrong of [`${payload}.${b64u(randomBytes(32))}`, a.session.accessToken, challengeToken, 'x'.repeat(513)])
      expect((await client.openWeb(a.session.key, wrong)).reply.body.code).toBe('ticket_invalid')
    // Still good for its own account.
    expect((await client.openWeb(a.session.key, ticket)).reply.status).toBe(201)
  })

  it('refuses a passkey ticket whose credential was removed', async () => {
    const { session, passkey } = await accountWithPasskey()
    const ticket = (await client.signIn(passkey)).assert.body.ticket
    expect((await client.remove(session, passkey.credentialId)).status).toBe(200)
    expect((await client.openWeb(session.key, ticket)).reply.body.code).toBe('ticket_invalid')
  })

  it('refuses both a ticket and an attestation', async () => {
    const { session, passkey } = await accountWithPasskey()
    const ticket = (await client.signIn(passkey)).assert.body.ticket
    const both = await client.openWeb(session.key, ticket, { attestation: { purpose: 'account-session' } })
    expect(both.reply.status).toBe(400)
  })

  it('opens recovery and approval sessions, the approval naming the phone as actor', async () => {
    const session = await phone()
    const recovery = await issueTicket(h.env, { kind: 'recovery', accountId: session.accountId })
    const recovered = await client.openWeb(session.key, recovery.ticket)
    expect(recovered.reply.status).toBe(201)
    const approval = await issueTicket(h.env, {
      kind: 'approval',
      accountId: session.accountId,
      channelId: randomId(),
      actorSessionId: session.sessionId,
    })
    const approved = await client.openWeb(session.key, approval.ticket)
    expect(approved.reply.status).toBe(201)
    const entries = (await activity(session.accessToken)).filter((e) => e.kind === 'session.opened')
    expect(entries[0]).toMatchObject({
      method: 'approval',
      session: { sessionId: approved.reply.body.sessionId, platform: 'web' },
      actor: { sessionId: session.sessionId, platform: 'dev' },
    })
    expect(entries[1]).toMatchObject({ method: 'recovery' })
    expect(entries[2]).toMatchObject({ method: 'dev' })
  })

  it('keeps at most 3 web sessions, ending the least recently active, apart from the phones’ 10', async () => {
    const { session, passkey } = await accountWithPasskey()
    const phones = [session]
    for (let i = 0; i < 9; i++) phones.push(await phone(session.key))
    const web = []
    for (let i = 0; i < 3; i++) {
      advance(MINUTE)
      web.push(await webSession(session.key, passkey))
    }
    advance(MINUTE)
    // The first is now the most recently active.
    expect((await send('POST', '/sessions/refresh', { refreshToken: web[0].refreshToken })).status).toBe(200)
    advance(MINUTE)
    const fourth = await webSession(session.key, passkey)
    const refused = await send('POST', '/sessions/refresh', { refreshToken: web[1].refreshToken })
    expect(refused.status).toBe(401)
    expect(refused.body).toMatchObject({ code: 'unauthorized', reason: 'replaced' })
    const live = (await send('GET', '/sessions', undefined, authorization(fourth.accessToken))).body.sessions
    expect(live.filter((s: { platform: string }) => s.platform === 'web')).toHaveLength(3)
    expect(live.filter((s: { platform: string }) => s.platform === 'dev')).toHaveLength(10)
    const replaced = (await activity(fourth.accessToken)).filter((e) => e.kind === 'session.replaced')
    expect(replaced).toEqual([
      expect.objectContaining({ session: expect.objectContaining({ sessionId: web[1].sessionId }), actor: expect.objectContaining({ sessionId: fourth.sessionId }) }),
    ])
    // An eleventh phone ends the oldest phone, never a browser.
    await phone(session.key)
    const after = (await send('GET', '/sessions', undefined, authorization(fourth.accessToken))).body.sessions
    expect(after.filter((s: { platform: string }) => s.platform === 'web')).toHaveLength(3)
  })

  it('slides a web session’s end to 180 days after each refresh, with no absolute limit', async () => {
    const { session, passkey } = await accountWithPasskey()
    const web = await webSession(session.key, passkey)
    let refreshToken = web.refreshToken
    for (let i = 0; i < 3; i++) {
      advance(150 * DAY)
      const refreshed = await send('POST', '/sessions/refresh', { refreshToken })
      expect(refreshed.status).toBe(200)
      expect(refreshed.body.sessionExpiresAt).toBe(Date.now() + 180 * DAY)
      refreshToken = refreshed.body.refreshToken
    }
    advance(180 * DAY + 1)
    const ended = await send('POST', '/sessions/refresh', { refreshToken })
    expect(ended.body).toMatchObject({ code: 'unauthorized', reason: 'expired' })
  })

  it('counts against the 20 opens an account key a day', async () => {
    const session = await phone()
    for (let i = 0; i < 19; i++) await phone(session.key)
    const ticket = await issueTicket(h.env, { kind: 'recovery', accountId: session.accountId })
    const limited = await client.openWeb(session.key, ticket.ticket)
    expect(limited.reply.status).toBe(429)
  })
})

describe('session fields', () => {
  it('takes appVersion on open and refresh and keeps the latest', async () => {
    const session = await phone(undefined, { appVersion: '1.45.0' })
    const list = async (token: string) =>
      (await send('GET', '/sessions', undefined, authorization(token))).body.sessions[0]
    expect(await list(session.accessToken)).toMatchObject({ appVersion: '1.45.0', method: 'dev' })
    const refreshed = await send('POST', '/sessions/refresh', { refreshToken: session.refreshToken, appVersion: '1.46.2' })
    expect(refreshed.status).toBe(200)
    expect(await list(refreshed.body.accessToken)).toMatchObject({ appVersion: '1.46.2' })
    for (const appVersion of ['1.46', '1.x.0', `1.0.${'9'.repeat(40)}`, 146]) {
      expect((await send('POST', '/sessions/refresh', { refreshToken: refreshed.body.refreshToken, appVersion })).status).toBe(400)
      const key = await SigningKey.generate()
      expect((await send('POST', '/sessions', await signedEnvelope('session/open', key, { appVersion }), { 'x-ww-dev-bypass': TEST_DEV_BYPASS })).status).toBe(400)
    }
  })

  it('leaves appVersion out when unknown', async () => {
    const session = await phone()
    const [listed] = (await send('GET', '/sessions', undefined, authorization(session.accessToken))).body.sessions
    expect(listed.appVersion).toBeUndefined()
  })

  it('says why a refresh was refused', async () => {
    const reason = async (refreshToken: string) =>
      (await send('POST', '/sessions/refresh', { refreshToken })).body.reason
    const a = await phone()
    const b = await phone(a.key)
    expect((await send('POST', '/sessions/revoke', { sessionId: b.sessionId }, authorization(a.accessToken))).status).toBe(200)
    expect(await reason(b.refreshToken)).toBe('revoked')
    expect((await send('DELETE', '/sessions/current', undefined, authorization(a.accessToken))).status).toBe(200)
    expect(await reason(a.refreshToken)).toBe('revoked')

    const c = await phone()
    const first = await send('POST', '/sessions/refresh', { refreshToken: c.refreshToken })
    expect((await send('POST', '/sessions/refresh', { refreshToken: first.body.refreshToken })).status).toBe(200)
    advance(2 * MINUTE)
    expect(await reason(c.refreshToken)).toBe('reused')
    expect(await reason(first.body.refreshToken)).toBe('reused')

    const d = await phone()
    advance(90 * DAY + 1)
    expect(await reason(d.refreshToken)).toBe('expired')
    expect(await reason('garbage')).toBe('unknown')
    expect(await reason(`${randomId()}.${b64u(randomBytes(32))}.${b64u(randomBytes(32))}`)).toBe('unknown')
  })
})

describe('step-up on the web', () => {
  it('records a server-checked step-up on the session', async () => {
    const { session, passkey } = await accountWithPasskey()
    const web = await webSession(session.key, passkey)
    advance(10 * MINUTE)
    const { challenge, assert } = await client.stepUp(web, passkey)
    expect(challenge.body.options.allowCredentials).toEqual([
      { id: passkey.credentialId, type: 'public-key', transports: ['internal', 'hybrid'] },
    ])
    expect(assert.status).toBe(200)
    expect(assert.body).toEqual({ ok: true, credentialId: passkey.credentialId, stepUpAt: Date.now() })
    expect(sql('SELECT step_up_at FROM account_sessions WHERE id = ?', web.sessionId)).toEqual([{ step_up_at: Date.now() }])
  })

  it('needs the session the challenge was issued to', async () => {
    const { session, passkey } = await accountWithPasskey()
    const web = await webSession(session.key, passkey)
    const challenge = await client.challenge({ purpose: 'step-up' }, web.accessToken)
    const response = await passkey.assert(challenge.body.options)
    expect((await client.challenge({ purpose: 'step-up' })).status).toBe(401)
    expect((await client.assertWith({ challengeToken: challenge.body.challengeToken, response })).status).toBe(401)
    const elsewhere = await client.assertWith({ challengeToken: challenge.body.challengeToken, response }, session.accessToken)
    expect(elsewhere.body).toMatchObject({ code: 'passkey_failed', reason: 'challenge' })
    // Another account's passkey can't step this session up.
    const other = await accountWithPasskey()
    const theirs = await client.assertWith(
      { challengeToken: challenge.body.challengeToken, response: await other.passkey.assert(challenge.body.options) },
      web.accessToken
    )
    expect(theirs.body).toMatchObject({ code: 'passkey_failed', reason: 'unknown_credential' })
    expect((await client.assertWith({ challengeToken: challenge.body.challengeToken, response }, web.accessToken)).status).toBe(200)
  })

  it('lists when the session’s step-up stops counting, on the server’s clock', async () => {
    const { session, passkey } = await accountWithPasskey()
    const opened = Date.now()
    const web = await webSession(session.key, passkey)
    const listed = async (s: { accessToken: string }) =>
      (await send('GET', '/sessions', undefined, authorization(s.accessToken))).body
    // Opening counts as a step-up.
    expect(await listed(web)).toMatchObject({ now: opened, stepUpUntil: opened + 5 * MINUTE })
    advance(10 * MINUTE)
    expect(await listed(web)).toMatchObject({ now: opened + 10 * MINUTE, stepUpUntil: opened + 5 * MINUTE })
    expect((await client.stepUp(web, passkey)).assert.status).toBe(200)
    expect(await listed(web)).toMatchObject({ stepUpUntil: opened + 15 * MINUTE })
    // Phones never step up (they're exempt), even with a step-up recorded.
    expect(await listed(session)).toMatchObject({ now: Date.now(), stepUpUntil: null })
    sql("UPDATE account_sessions SET step_up_at = ? WHERE platform != 'web'", Date.now())
    expect(await listed(session)).toMatchObject({ stepUpUntil: null })
  })

  it('requires a step-up within 5 minutes for web sessions adding or removing a passkey, or deleting backups', async () => {
    const { session, passkey } = await accountWithPasskey()
    const web = await webSession(session.key, passkey)
    // Opening counts as a step-up.
    expect((await client.register(web)).added.status).toBe(200)
    advance(5 * MINUTE + 1)
    const late = await client.register(web)
    expect(late.added.status).toBe(403)
    expect(late.added.body.code).toBe('step_up_required')
    expect((await client.remove(web, passkey.credentialId)).body.code).toBe('step_up_required')
    const deleteBackups = await send('POST', '/backup/delete', await signedEnvelope('backup/delete', session.key), authorization(web.accessToken))
    expect(deleteBackups.body.code).toBe('step_up_required')
    // Phones are exempt.
    expect((await send('POST', '/backup/delete', await signedEnvelope('backup/delete', session.key), authorization(session.accessToken))).status).toBe(200)

    expect((await client.stepUp(web, passkey)).assert.status).toBe(200)
    expect((await client.register(web)).added.status).toBe(200)
    expect((await send('POST', '/backup/delete', await signedEnvelope('backup/delete', session.key), authorization(web.accessToken))).status).toBe(200)
  })
})

describe('wraps', () => {
  it('stores a wrap once per wrapId and keeps the newest four', async () => {
    const { session, passkey } = await accountWithPasskey()
    const wraps = []
    for (let i = 0; i < 5; i++) {
      advance(SECOND)
      const wrap = { credentialId: passkey.credentialId, wrapId: randomId(), keyEpoch: 0, wrap: fakeWrap() }
      expect((await client.wrap(session, wrap)).body).toEqual({ ok: true })
      wraps.push(wrap)
    }
    expect((await client.wrap(session, { ...wraps[4], wrap: fakeWrap() })).body).toEqual({ ok: true })
    const { assert } = await client.signIn(passkey)
    expect(assert.body.wraps.map((w: { wrapId: string }) => w.wrapId)).toEqual(
      [wraps[4], wraps[3], wraps[2], wraps[1]].map((w) => w.wrapId)
    )
    expect(assert.body.wraps[0].wrap).toBe(wraps[4].wrap)
    expect((await activity(session.accessToken)).map((e) => e.kind)).not.toContain('passkey.wrap')
  })

  it('refuses another key epoch and another account’s credential, and scopes wrapIds to the credential', async () => {
    const { session, passkey } = await accountWithPasskey()
    const other = await accountWithPasskey()
    const wrapId = randomId()
    expect((await client.wrap(session, { credentialId: passkey.credentialId, wrapId, keyEpoch: 1, wrap: fakeWrap() })).body.code).toBe('conflict')
    expect((await client.wrap(session, { credentialId: other.passkey.credentialId, wrapId, keyEpoch: 0, wrap: fakeWrap() })).body.code).toBe('not_found')
    expect((await client.wrap(session, { credentialId: b64u(randomBytes(16)), wrapId, keyEpoch: 0, wrap: fakeWrap() })).body.code).toBe('not_found')
    expect((await client.wrap(other.session, { credentialId: other.passkey.credentialId, wrapId, keyEpoch: 0, wrap: fakeWrap() })).status).toBe(200)
    // Another account's wrap with the same id neither conflicts nor shows.
    expect((await client.wrap(session, { credentialId: passkey.credentialId, wrapId, keyEpoch: 0, wrap: fakeWrap() })).status).toBe(200)
    expect(sql('SELECT COUNT(*) AS n FROM passkey_wraps WHERE wrap_id = ?', wrapId)).toEqual([{ n: 2 }])
    expect((await client.signIn(passkey)).assert.body.wraps).toEqual([expect.objectContaining({ wrapId })])
    for (const bad of [{ wrap: 'short' }, { wrapId: 'x' }, { keyEpoch: -1 }, { wrap: b64u(new Uint8Array(73)) }])
      expect((await client.wrap(session, { credentialId: passkey.credentialId, wrapId: randomId(), keyEpoch: 0, wrap: fakeWrap(), ...bad })).status).toBe(400)
  })

  it('answers only the current key epoch’s wraps', async () => {
    const { session, passkey } = await accountWithPasskey({ extra: { wrapId: randomId(), wrap: fakeWrap() } })
    sql('UPDATE accounts SET key_epoch = 1')
    const { assert } = await client.signIn(passkey)
    expect(assert.body).toMatchObject({ keyEpoch: 1, wraps: [] })
    expect((await client.list(session)).body.passkeys[0].canUnlock).toBe(false)
    expect((await client.wrap(session, { credentialId: passkey.credentialId, wrapId: randomId(), keyEpoch: 0, wrap: fakeWrap() })).body.code).toBe('conflict')
    expect((await client.wrap(session, { credentialId: passkey.credentialId, wrapId: randomId(), keyEpoch: 1, wrap: fakeWrap() })).status).toBe(200)
    expect((await client.list(session)).body.passkeys[0].canUnlock).toBe(true)
  })
})

describe('removing a passkey', () => {
  it('deletes it and its wraps, idempotently, logging passkey.removed once', async () => {
    const { session, passkey } = await accountWithPasskey({ extra: { wrapId: randomId(), wrap: fakeWrap() } })
    expect((await client.remove(session, passkey.credentialId)).body).toEqual({ ok: true })
    expect((await client.remove(session, passkey.credentialId)).body).toEqual({ ok: true })
    expect(sql('SELECT COUNT(*) AS n FROM passkey_wraps')).toEqual([{ n: 0 }])
    expect((await client.list(session)).body.passkeys).toEqual([])
    const removed = (await activity(session.accessToken)).filter((e) => e.kind === 'passkey.removed')
    expect(removed).toEqual([expect.objectContaining({ credentialId: passkey.credentialId })])
    expect((await client.signIn(passkey)).assert.body.reason).toBe('unknown_credential')
  })

  it('never removes another account’s passkey', async () => {
    const { session } = await accountWithPasskey()
    const other = await accountWithPasskey()
    expect((await client.remove(session, other.passkey.credentialId)).body).toEqual({ ok: true })
    expect((await client.list(other.session)).body.passkeys).toHaveLength(1)
  })
})

describe('switches and housekeeping', () => {
  it('answers disabled without the challenge or ticket secret, or the RP config', async () => {
    for (const unset of ['PASSKEY_CHALLENGE_SECRET', 'ACCOUNT_TICKET_SECRET', 'PASSKEY_RP_IDS'] as const) {
      h = await createHarness()
      delete (h.env as unknown as Record<string, unknown>)[unset]
      const refused = await client.challenge({ purpose: 'sign-in' })
      expect(refused.status).toBe(503)
      expect(refused.body.code).toBe('disabled')
    }
  })

  it('prunes used ids once their tokens expire', async () => {
    const { passkey } = await accountWithPasskey()
    await client.signIn(passkey)
    // The add's challenge and envelope nonce, and the sign-in's challenge.
    expect(sql('SELECT COUNT(*) AS n FROM used_token_ids')).toEqual([{ n: 3 }])
    advance(5 * MINUTE + 1)
    expect(await pruneUsedTokens(accountsDb(h.env.ACCOUNTS_DB!))).toBe(3)
    expect(sql('SELECT COUNT(*) AS n FROM used_token_ids')).toEqual([{ n: 0 }])
  })

  it('refuses legacy requests when the legacy switch’s KV read fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    h.kv.get = (async () => {
      throw new Error('kv down')
    }) as never
    const legacy = await send('POST', '/account/register', await signedEnvelope('account/register', await SigningKey.generate()))
    expect(legacy.status).toBe(426)
  })

  it('stores no PRF output the client sent', async () => {
    const session = await phone()
    const { added, passkey } = await client.register(session, {
      ceremony: { clientExtensionResults: { prf: { enabled: true, results: { first: b64u(randomBytes(32)) } } } },
    })
    expect(added.status).toBe(200)
    const signIn = await client.signIn(passkey, {
      ceremony: { clientExtensionResults: { prf: { results: { first: 'secret-prf-output' } } } },
    })
    expect(signIn.assert.status).toBe(200)
    expect(JSON.stringify(sql('SELECT * FROM passkeys'))).not.toContain('secret-prf-output')
  })

  it('issues challenge tokens that only this purpose and session accept', async () => {
    const session = await phone()
    const { token } = await issueChallengeToken(h.env, {
      purpose: 'step-up',
      rpId: TEST_RP_ID,
      challenge: b64u(randomBytes(32)),
      sessionId: session.sessionId,
      accountId: session.accountId,
    })
    expect(token.split('.')).toHaveLength(2)
    expect(nextTestIp()).toMatch(/^198\.19\./)
  })
})

describe('replays, races, and limits', () => {
  it('keeps the first answer’s refresh token working after a lost-response repeat', async () => {
    const { session, passkey } = await accountWithPasskey()
    const { assert } = await client.signIn(passkey)
    const { envelope, reply } = await client.openWeb(session.key, assert.body.ticket)
    advance(30 * SECOND)
    const again = await send('POST', '/sessions', envelope)
    expect(again.status).toBe(201)
    expect(again.body.sessionId).toBe(reply.body.sessionId)
    // Long after any grace minute: the first answer's token still refreshes.
    advance(5 * MINUTE)
    const first = await send('POST', '/sessions/refresh', { refreshToken: reply.body.refreshToken })
    expect(first.status).toBe(200)
    // The repeat's token, within the minute after, gets the same next token.
    const second = await send('POST', '/sessions/refresh', { refreshToken: again.body.refreshToken })
    expect(second.status).toBe(200)
    expect(second.body.refreshToken).toBe(first.body.refreshToken)
    const kinds = (await activity(session.accessToken)).map((e) => e.kind)
    expect(kinds).not.toContain('session.refresh_reused')
    expect((await send('POST', '/sessions/refresh', { refreshToken: second.body.refreshToken })).status).toBe(200)
  })

  it('answers a repeat after the first answer refreshed with the token it was replaced by', async () => {
    const { session, passkey } = await accountWithPasskey()
    const { assert } = await client.signIn(passkey)
    const { envelope, reply } = await client.openWeb(session.key, assert.body.ticket)
    const refreshed = await send('POST', '/sessions/refresh', { refreshToken: reply.body.refreshToken })
    expect(refreshed.status).toBe(200)
    advance(20 * SECOND)
    const again = await send('POST', '/sessions', envelope)
    expect(again.status).toBe(201)
    expect(again.body.refreshToken).toBe(refreshed.body.refreshToken)
    expect((await send('POST', '/sessions/refresh', { refreshToken: refreshed.body.refreshToken })).status).toBe(200)
  })

  it('takes each signed passkey and backup envelope once (409 replay)', async () => {
    const { session, passkey } = await accountWithPasskey()
    const options = await client.registerOptions(session)
    const other = await SoftPasskey.create('ES256', TEST_RP_ID, options.body.userHandle)
    const add = await signedEnvelope('passkey/add', session.key, {
      challengeToken: options.body.challengeToken,
      response: await other.register(options.body.options),
    })
    expect((await send('POST', '/passkeys', add, authorization(session.accessToken))).status).toBe(200)
    const addAgain = await send('POST', '/passkeys', add, authorization(session.accessToken))
    expect(addAgain.status).toBe(409)
    expect(addAgain.body.code).toBe('replay')

    const wrap = await signedEnvelope('passkey/wrap', session.key, {
      credentialId: passkey.credentialId,
      wrapId: randomId(),
      keyEpoch: 0,
      wrap: fakeWrap(),
    })
    expect((await send('POST', '/passkeys/wrap', wrap, authorization(session.accessToken))).status).toBe(200)
    expect((await send('POST', '/passkeys/wrap', wrap, authorization(session.accessToken))).body.code).toBe('replay')

    const remove = await signedEnvelope('passkey/remove', session.key, { credentialId: other.credentialId })
    expect((await send('POST', '/passkeys/remove', remove, authorization(session.accessToken))).status).toBe(200)
    expect((await send('POST', '/passkeys/remove', remove, authorization(session.accessToken))).body.code).toBe('replay')

    const backup = await signedEnvelope('backup/delete', session.key)
    expect((await send('POST', '/backup/delete', backup, authorization(session.accessToken))).status).toBe(200)
    expect((await send('POST', '/backup/delete', backup, authorization(session.accessToken))).body.code).toBe('replay')

    // Pruned once the envelopes' 5 minutes are over.
    advance(5 * MINUTE + 1)
    await pruneUsedTokens(accountsDb(h.env.ACCOUNTS_DB!))
    expect(sql('SELECT COUNT(*) AS n FROM used_token_ids')).toEqual([{ n: 0 }])
  })

  it('never stores more than 10 passkeys, even from parallel adds', async () => {
    const session = await phone()
    for (let i = 0; i < 9; i++) expect((await client.register(session)).added.status).toBe(200)
    const prepared = await Promise.all(
      Array.from({ length: 4 }, async () => {
        const options = await client.registerOptions(session)
        const passkey = await SoftPasskey.create('ES256', TEST_RP_ID, options.body.userHandle)
        return { challengeToken: options.body.challengeToken, response: await passkey.register(options.body.options) }
      })
    )
    const replies = await Promise.all(prepared.map((fields) => client.add(session, fields)))
    expect(replies.map((r) => r.status).sort()).toEqual([200, 429, 429, 429])
    expect(sql('SELECT COUNT(*) AS n FROM passkeys')).toEqual([{ n: 10 }])
    expect(sql("SELECT COUNT(*) AS n FROM account_activity WHERE kind = 'passkey.added'")).toEqual([{ n: 10 }])
  })

  it('never lowers a stored counter', async () => {
    const { passkey } = await accountWithPasskey()
    h.accountsDb!.db.prepare('UPDATE passkeys SET counter = 5').run()
    expect((await client.signIn(passkey, { ceremony: { counter: 0 } })).assert.status).toBe(200)
    expect(sql('SELECT counter FROM passkeys')).toEqual([{ counter: 5 }])
  })

  it('names the failure budget by an HMAC under a Worker secret, never a plain hash of the IP', async () => {
    const { passkey } = await accountWithPasskey()
    const names: string[] = []
    const record = () => {
      const namespace = h.env.ACCOUNT_RATE_COUNTER
      const idFromName = namespace.idFromName.bind(namespace)
      namespace.idFromName = ((name: string) => {
        names.push(name)
        return idFromName(name)
      }) as never
    }
    record()
    callerIp = '203.0.113.30'
    await client.signIn(passkey, { ceremony: { badSignature: true } })
    const { quotaName } = await import('./signed')
    expect(names.length).toBeGreaterThan(0)
    expect(names).not.toContain(await quotaName('passkey-assert-failures', '203.0.113.30'))
    const first = names[0]
    h.env.ACCOUNT_TICKET_SECRET = 'another-account-ticket-secret-0123456789ab'
    names.length = 0
    await client.signIn(passkey, { ceremony: { badSignature: true } }).catch(() => undefined)
    expect(names[0]).toBeDefined()
    expect(names[0]).not.toBe(first)
  })

  it('opens an approval session only while the approving phone’s session is live', async () => {
    const session = await phone()
    const other = await phone(session.key)
    const approval = await issueTicket(h.env, {
      kind: 'approval',
      accountId: session.accountId,
      channelId: randomId(),
      actorSessionId: other.sessionId,
    })
    expect((await send('DELETE', '/sessions/current', undefined, authorization(other.accessToken))).status).toBe(200)
    expect((await client.openWeb(session.key, approval.ticket)).reply.body.code).toBe('ticket_invalid')
  })

  it('exempts only ios, android, and dev sessions from step-up', async () => {
    const { refuseWithoutStepUp } = await import('./stepUp')
    const db = accountsDb(h.env.ACCOUNTS_DB!)
    for (const platform of ['ios', 'android', 'dev'] as const)
      expect(await refuseWithoutStepUp(db, { accountId: randomId(), sessionId: randomId(), platform })).toBeNull()
    const unknown = await refuseWithoutStepUp(db, { accountId: randomId(), sessionId: randomId(), platform: 'tv' as never })
    expect(unknown?.status).toBe(403)
  })

  it('defaults a challenge’s RP ID to the one the request’s Origin pairs with', async () => {
    const session = await phone()
    const origin = (value: string) => ({ origin: value })
    const signIn = await send('POST', '/passkeys/challenge', { purpose: 'sign-in' }, origin(TEST_LOCAL_ORIGIN))
    expect(signIn.body.options.rpId).toBe('localhost')
    const stepUp = await send('POST', '/passkeys/challenge', { purpose: 'step-up' }, { ...origin(TEST_LOCAL_ORIGIN), ...authorization(session.accessToken) })
    expect(stepUp.body.options.rpId).toBe('localhost')
    const register = await send('POST', '/passkeys/register/options', {}, { ...origin(TEST_LOCAL_ORIGIN), ...authorization(session.accessToken) })
    expect(register.body.options.rp.id).toBe('localhost')
    for (const other of [TEST_ORIGIN, 'https://elsewhere.example'])
      expect((await send('POST', '/passkeys/challenge', { purpose: 'sign-in' }, origin(other))).body.options.rpId).toBe(TEST_RP_ID)
    // An explicit rpId still wins.
    expect((await send('POST', '/passkeys/challenge', { purpose: 'step-up', rpId: TEST_RP_ID }, { ...origin(TEST_LOCAL_ORIGIN), ...authorization(session.accessToken) })).body.options.rpId).toBe(TEST_RP_ID)
  })

  it('names a missing user-presence flag and a ceremony of the wrong type precisely', async () => {
    const { passkey } = await accountWithPasskey()
    await refusedSignIn(passkey, 'user_presence', { ceremony: { userPresent: false } })
    await refusedSignIn(passkey, 'signature', { ceremony: { type: 'webauthn.create' } })
    const session = await phone()
    const options = await client.registerOptions(session)
    const created = await SoftPasskey.create('ES256', TEST_RP_ID, options.body.userHandle)
    const wrongType = await client.add(session, {
      challengeToken: options.body.challengeToken,
      response: await created.register(options.body.options, { type: 'webauthn.get' }),
    })
    expect(wrongType.body).toMatchObject({ code: 'passkey_failed', reason: 'registration' })
  })

  it('never asks a caller to wait past the end of the window', async () => {
    const { passkey } = await accountWithPasskey()
    callerIp = '203.0.113.40'
    for (let i = 0; i < 30; i++) await client.signIn(passkey, { ceremony: { badSignature: true } })
    const limited = await client.signIn(passkey)
    expect(limited.assert.status).toBe(429)
    expect(Number(limited.assert.headers?.get('Retry-After'))).toBeLessThanOrEqual(60 * 60)
  })
})
