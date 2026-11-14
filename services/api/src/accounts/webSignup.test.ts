import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import {
  SigningKey,
  TEST_RP_ID,
  createHarness,
  type Harness,
} from '../test/buddies'
import { nextTestIp, openTestSession, requestJson } from '../test/accounts'
import { failQueries } from '../test/memoryD1'
import { PasskeyClient, authorization } from '../test/passkeys'
import { SoftPasskey, fakeWrap } from '../test/webauthn'
import type { AppEnv } from '../types'
import { createAccountsRoutes } from './route'
import { resetAccountStatusCache } from './auth'
import { SITEVERIFY_URL } from './turnstile'
import { WEB_SIGNUP_KEY, capsShardName, isWebSignupOn } from './webSignup'

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
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const app = new Hono<AppEnv>().route('/', createAccountsRoutes()) as never

const PASS = '1x0000000000000000000000000000000AA'
const FAIL = '2x0000000000000000000000000000000AA'
const SPENT = '3x0000000000000000000000000000000AA'
/** A secret that isn't a test one, so Siteverify's action and host are checked. */
const REAL = 'real-turnstile-secret'

let h: Harness
let client: PasskeyClient
let callerIp: string | null = null
let callerAsn: number | null = null
let siteverify: Record<string, string>[] = []
let siteverifyDown = 0

/**
 * Siteverify as Cloudflare answers it: the test secrets pass, fail, or say
 * "spent" for any token (for `example.com` and no action). Under another
 * secret, a token `pass:<action>:<host>` passes for that action and host.
 */
const answer = (body: Record<string, string>) => {
  if (body.secret === PASS)
    return { success: true, hostname: 'example.com', action: '', 'error-codes': [] }
  if (body.secret === FAIL) return { success: false, 'error-codes': ['invalid-input-response'] }
  if (body.secret === SPENT) return { success: false, 'error-codes': ['timeout-or-duplicate'] }
  const [verdict, action, hostname] = body.response.split(':')
  return verdict === 'pass'
    ? { success: true, action, hostname, 'error-codes': [] }
    : { success: false, 'error-codes': ['invalid-input-response'] }
}

/** Sends to the accounts app with the caller's IP and, when set, ASN (`request.cf`). */
const send = async (
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
) => {
  if (callerAsn == null)
    return requestJson(app, h.env, method, path, body, {
      ...(callerIp ? { 'cf-connecting-ip': callerIp } : {}),
      ...headers,
    })
  const request = new Request(`http://localhost${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': callerIp ?? nextTestIp(),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  Object.defineProperty(request, 'cf', { value: { asn: callerAsn } })
  const response = await (app as Hono<AppEnv>).request(request, undefined, h.env)
  const text = await response.text()
  return { status: response.status, headers: response.headers, body: JSON.parse(text) }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  h = await createHarness()
  resetAccountStatusCache()
  callerIp = null
  callerAsn = null
  siteverify = []
  siteverifyDown = 0
  h.env.TURNSTILE_SECRET_KEY = PASS
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== SITEVERIFY_URL) throw new Error(`unexpected fetch ${input}`)
      const body = JSON.parse(String(init?.body)) as Record<string, string>
      siteverify.push(body)
      if (siteverifyDown > 0) {
        siteverifyDown--
        throw new TypeError('fetch failed')
      }
      return Response.json(answer(body))
    })
  )
  client = new PasskeyClient(send)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const advance = (ms: number) => vi.setSystemTime(Date.now() + ms)
const sql = (query: string, ...params: (string | number | null)[]) =>
  h.accountsDb!.db.prepare(query).all(...params) as Record<string, unknown>[]
const accountCount = () => Number(sql('SELECT COUNT(*) AS n FROM accounts')[0].n)
const signUp = async (fields: Parameters<PasskeyClient['signUp']>[1] = {}) => {
  const key = await SigningKey.generate()
  return { key, ...(await client.signUp(key, fields)) }
}

describe('POST /web/signup/options', () => {
  it('verifies Turnstile with remoteip and an idempotency key, then mints the account', async () => {
    callerIp = '203.0.113.50'
    const options = await client.signupOptions({ turnstileToken: 'tok' })
    expect(options.status).toBe(200)
    expect(siteverify).toEqual([
      {
        secret: PASS,
        response: 'tok',
        remoteip: '203.0.113.50',
        idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    ])
    const { accountId, userHandle, challengeToken } = options.body
    expect(accountId).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(userHandle).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(typeof challengeToken).toBe('string')
    expect(options.body.options).toMatchObject({
      rp: { id: TEST_RP_ID, name: 'WitnessWork' },
      user: { id: userHandle },
      excludeCredentials: [],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      attestation: 'none',
    })
    expect(options.body.options.extensions).toBeUndefined()
    // Nothing stored.
    expect(accountCount()).toBe(0)
  })

  it('takes another listed RP ID and refuses an unlisted one', async () => {
    const local = await client.signupOptions({ turnstileToken: 'tok', rpId: 'localhost' })
    expect(local.body.options.rp.id).toBe('localhost')
    const other = await client.signupOptions({ turnstileToken: 'tok', rpId: 'example.com' })
    expect(other).toMatchObject({ status: 400, body: { error: 'bad_request' } })
  })

  it('refuses a missing token before Siteverify', async () => {
    expect(await client.signupOptions({})).toMatchObject({
      status: 400,
      body: { error: 'bad_request' },
    })
    expect(siteverify).toEqual([])
  })

  it('answers Siteverify’s refusal with its first error code', async () => {
    h.env.TURNSTILE_SECRET_KEY = FAIL
    expect(await client.signupOptions({ turnstileToken: 'tok' })).toMatchObject({
      status: 403,
      body: { error: 'turnstile_failed', reason: 'invalid-input-response' },
    })
    h.env.TURNSTILE_SECRET_KEY = SPENT
    expect(await client.signupOptions({ turnstileToken: 'tok' })).toMatchObject({
      status: 403,
      body: { error: 'turnstile_failed', reason: 'timeout-or-duplicate' },
    })
  })

  it('checks the action and host under a real secret', async () => {
    h.env.TURNSTILE_SECRET_KEY = REAL
    h.env.TURNSTILE_HOSTNAMES = 'verify-beta.witnesswork.app'
    const tries = {
      'pass:web-signup:verify-beta.witnesswork.app': 200,
      // Hostnames are case-insensitive.
      'pass:web-signup:Verify-Beta.WitnessWork.app': 200,
      'pass:web-recovery:verify-beta.witnesswork.app': 'action-mismatch',
      // The widget runs only in the Turnstile frame: one solved on the web
      // app's own host, or anywhere else, doesn't pass.
      'pass:web-signup:beta.app.witnesswork.app': 'hostname-mismatch',
      'pass:web-signup:localhost': 'hostname-mismatch',
      'pass:web-signup:verify.witnesswork.app': 'hostname-mismatch',
      'pass:web-signup:evil.example': 'hostname-mismatch',
      'nope:web-signup:verify-beta.witnesswork.app': 'invalid-input-response',
    }
    for (const [token, expected] of Object.entries(tries)) {
      const reply = await client.signupOptions({ turnstileToken: token })
      if (expected === 200) expect(reply.status, token).toBe(200)
      else expect(reply.body, token).toMatchObject({ error: 'turnstile_failed', reason: expected })
    }
  })

  it('is off under a real secret without TURNSTILE_HOSTNAMES, rather than failing every token', async () => {
    h.env.TURNSTILE_SECRET_KEY = REAL
    delete h.env.TURNSTILE_HOSTNAMES
    expect(
      await client.signupOptions({ turnstileToken: 'pass:web-signup:verify-beta.witnesswork.app' })
    ).toMatchObject({ status: 503, body: { error: 'disabled' } })
    const phone = await openTestSession(app, h.env)
    expect(
      (await client.recovery(phone.key, 'pass:web-recovery:verify-beta.witnesswork.app')).body
    ).toMatchObject({ error: 'disabled' })
    expect(siteverify).toEqual([])
  })

  it('skips the host and action checks for the test secrets', async () => {
    // The pass key answers example.com and no action, and still passes.
    expect((await client.signupOptions({ turnstileToken: 'tok' })).status).toBe(200)
  })

  it('retries Siteverify once with the same idempotency key, then says unavailable', async () => {
    siteverifyDown = 1
    expect((await client.signupOptions({ turnstileToken: 'tok' })).status).toBe(200)
    expect(siteverify).toHaveLength(2)
    expect(siteverify[0].idempotency_key).toBe(siteverify[1].idempotency_key)

    siteverify = []
    siteverifyDown = 2
    const down = await client.signupOptions({ turnstileToken: 'tok' })
    expect(down).toMatchObject({ status: 503, body: { error: 'unavailable' } })
    expect(down.headers?.get('retry-after')).toBe('30')
    expect(siteverify).toHaveLength(2)
  })

  it('refuses an oversized token as bad_request without calling Siteverify', async () => {
    const reply = await client.signupOptions({ turnstileToken: 'x'.repeat(2_049) })
    expect(reply).toMatchObject({ status: 400, body: { error: 'bad_request' } })
    const phone = await openTestSession(app, h.env)
    expect((await client.recovery(phone.key, 'x'.repeat(2_049))).body).toMatchObject({ error: 'bad_request' })
    expect(siteverify).toEqual([])
  })

  it('skips the action and host checks for a test secret only on a development worker', async () => {
    h.env.APP_ATTEST_ENVIRONMENT = 'production'
    h.env.TURNSTILE_SITE_KEY = '0x4AAAAAAAsite-key'
    h.env.TURNSTILE_HOSTNAMES = 'verify.witnesswork.app'
    // On production the pass key's answer (example.com, no action) doesn't match.
    expect((await client.signupOptions({ turnstileToken: 'tok' })).body).toMatchObject({
      error: 'turnstile_failed',
      reason: 'action-mismatch',
    })
  })
})

describe('the kill switch', () => {
  it('is on by default, off by KV or the var, and on after a failed read', async () => {
    const env = (value: string | null | Error, WEB_SIGNUP?: string) => ({
      WEB_SIGNUP,
      NOTES_KV: {
        get: async () => {
          if (value instanceof Error) throw value
          return value
        },
      },
    })
    expect(await isWebSignupOn(env(null))).toBe(true)
    expect(await isWebSignupOn(env(null, 'off'))).toBe(false)
    expect(await isWebSignupOn(env('off', 'on'))).toBe(false)
    expect(await isWebSignupOn(env('on', 'off'))).toBe(true)
    expect(await isWebSignupOn(env(new Error('kv down'), 'off'))).toBe(true)
  })

  it('refuses both sign-up routes before Siteverify, but not recovery', async () => {
    const { key } = await signUp()
    siteverify = []
    await h.kv.put(WEB_SIGNUP_KEY, 'off')
    expect(await client.signupOptions({ turnstileToken: 'tok' })).toMatchObject({
      status: 503,
      body: { error: 'disabled' },
    })
    const other = await SigningKey.generate()
    expect(await client.signupWith(other, { challengeToken: 'x', response: {} })).toMatchObject({
      status: 503,
      body: { error: 'disabled' },
    })
    expect(siteverify).toEqual([])
    expect((await client.recovery(key)).status).toBe(200)
  })
})

describe('POST /web/signup', () => {
  it('creates the account, passkey, wrap and a stepped-up web session in one go', async () => {
    const wrap = fakeWrap()
    const { key, options, signup, passkey } = await signUp({
      extra: {
        wrapId: 'AAAAAAAAAAAAAAAAAAAAAA',
        wrap,
        label: 'bGFiZWw',
        device: 'ZGV2aWNl',
        appVersion: '1.46.0',
        capabilities: ['sync-everyone'],
      },
    })
    expect(signup.status).toBe(201)
    expect(signup.headers?.get('location')).toBe('/accounts/v1/sessions/current')
    expect(signup.body).toMatchObject({
      ok: true,
      accountId: options.body.accountId,
      status: 'active',
      platform: 'web',
      credentialId: passkey.credentialId,
    })
    const [account] = sql('SELECT * FROM accounts')
    expect(account).toMatchObject({
      id: options.body.accountId,
      account_pub: key.publicKey,
      passkey_user_handle: options.body.userHandle,
      created_via: 'web',
      key_epoch: 0,
    })
    expect(sql('SELECT created_platform, label, rp_id FROM passkeys')).toEqual([
      { created_platform: 'web', label: 'bGFiZWw', rp_id: TEST_RP_ID },
    ])
    expect(sql('SELECT wrap, key_epoch FROM passkey_wraps')).toEqual([{ wrap, key_epoch: 0 }])
    const [session] = sql('SELECT * FROM account_sessions')
    expect(session).toMatchObject({
      platform: 'web',
      method: 'signup',
      app_version: '1.46.0',
      capabilities: '["sync-everyone"]',
      device: 'ZGV2aWNl',
      step_up_credential_id: passkey.credentialId,
    })
    expect(session.step_up_at).toBe(START)

    const activity = (
      await send('GET', '/activity', undefined, authorization(signup.body.accessToken))
    ).body.activity as Record<string, unknown>[]
    expect(activity.map((entry) => [entry.kind, entry.method ?? null, entry.credentialId ?? null])).toEqual([
      ['passkey.added', null, passkey.credentialId],
      ['session.opened', 'signup', null],
      ['account.created', null, null],
    ])
    expect(activity[0].session).toMatchObject({ sessionId: signup.body.sessionId, platform: 'web' })

    // Stepped up at sign-up: a sensitive action works at once.
    const listed = await client.list({ key, ...signup.body })
    expect(listed.body.passkeys).toMatchObject([{ credentialId: passkey.credentialId, canUnlock: true }])

    // The passkey signs in to the same account and unlocks it.
    const { assert } = await client.signIn(passkey)
    expect(assert.body).toMatchObject({
      accountId: options.body.accountId,
      accountPub: key.publicKey,
      userHandle: options.body.userHandle,
      wraps: [{ wrap, keyEpoch: 0 }],
    })
  })

  it('signs up without a wrap (a passkey without PRF)', async () => {
    const { signup } = await signUp()
    expect(signup.status).toBe(201)
    expect(sql('SELECT COUNT(*) AS n FROM passkey_wraps')[0].n).toBe(0)
  })

  it('refuses a key that already has an account', async () => {
    const phone = await openTestSession(app, h.env)
    const reply = await client.signUp(phone.key)
    expect(reply.signup).toMatchObject({ status: 409, body: { error: 'conflict' } })
    expect(accountCount()).toBe(1)
  })

  it('refuses a challenge already used (a lost response), and its own key’s repeat', async () => {
    const { key, options, response } = await signUp()
    const again = await client.signupWith(key, { challengeToken: options.body.challengeToken, response })
    expect(again).toMatchObject({ status: 403, body: { error: 'passkey_failed', reason: 'challenge' } })
    const other = await SigningKey.generate()
    const reused = await client.signupWith(other, { challengeToken: options.body.challengeToken, response })
    expect(reused).toMatchObject({ status: 403, body: { error: 'passkey_failed', reason: 'challenge' } })
    // A fresh challenge for the same key is a conflict.
    expect((await client.signUp(key)).signup).toMatchObject({ status: 409, body: { error: 'conflict' } })
    expect(accountCount()).toBe(1)
  })

  it('refuses a challenge that isn’t a sign-up one, or has expired', async () => {
    const phone = await openTestSession(app, h.env)
    const register = await client.registerOptions(phone)
    const passkey = await SoftPasskey.create('ES256', TEST_RP_ID, register.body.userHandle)
    const response = await passkey.register(register.body.options)
    const key = await SigningKey.generate()
    expect(
      await client.signupWith(key, { challengeToken: register.body.challengeToken, response })
    ).toMatchObject({ status: 403, body: { error: 'passkey_failed', reason: 'challenge' } })

    const options = await client.signupOptions({ turnstileToken: 'tok' })
    const late = await SoftPasskey.create('ES256', TEST_RP_ID, options.body.userHandle)
    const lateResponse = await late.register(options.body.options)
    advance(10 * MINUTE + 1)
    expect(
      await client.signupWith(key, { challengeToken: options.body.challengeToken, response: lateResponse })
    ).toMatchObject({ status: 403, body: { error: 'passkey_failed', reason: 'challenge' } })
  })

  it('refuses a registration that doesn’t verify, without counting it', async () => {
    callerIp = '203.0.113.60'
    for (let i = 0; i < 3; i++) {
      const reply = await signUp({ ceremony: { userVerified: false } })
      expect(reply.signup).toMatchObject({
        status: 403,
        body: { error: 'passkey_failed', reason: 'user_verification' },
      })
    }
    const origin = await signUp({ ceremony: { origin: 'https://evil.example' } })
    expect(origin.signup.body).toMatchObject({ error: 'passkey_failed', reason: 'origin' })
    expect(accountCount()).toBe(0)
    // The caps weren't taken: three still fit.
    for (let i = 0; i < 3; i++) expect((await signUp()).signup.status).toBe(201)
  })

  it('needs the new key’s signature', async () => {
    const options = await client.signupOptions({ turnstileToken: 'tok' })
    const passkey = await SoftPasskey.create('ES256', TEST_RP_ID, options.body.userHandle)
    const response = await passkey.register(options.body.options)
    const key = await SigningKey.generate()
    const envelope = await (await import('../test/passkeys')).signedEnvelope(
      'web/signup',
      key,
      { challengeToken: options.body.challengeToken, response },
      await SigningKey.generate()
    )
    expect(await send('POST', '/web/signup', envelope)).toMatchObject({
      status: 401,
      body: { error: 'bad_signature' },
    })
  })

  it('refuses oversized fields', async () => {
    const key = await SigningKey.generate()
    expect(
      await client.signupWith(key, { challengeToken: 'x', response: {}, device: 'a'.repeat(513) })
    ).toMatchObject({ status: 413, body: { error: 'too_large' } })
  })
})

describe('the caps', () => {
  it('allows 3 sign-ups per IP a rolling day, refusing the 4th before Siteverify', async () => {
    callerIp = '203.0.113.70'
    for (let i = 0; i < 3; i++) expect((await signUp()).signup.status).toBe(201)
    siteverify = []
    const fourth = await client.signupOptions({ turnstileToken: 'tok' })
    expect(fourth).toMatchObject({ status: 429, body: { error: 'rate_limited' } })
    expect(Number(fourth.headers?.get('retry-after'))).toBeGreaterThan(0)
    expect(siteverify).toEqual([])
    // Another IP is fine.
    callerIp = '203.0.113.71'
    expect((await signUp()).signup.status).toBe(201)
    // A day later, the first IP is too.
    callerIp = '203.0.113.70'
    advance(DAY + HOUR)
    expect((await signUp()).signup.status).toBe(201)
  })

  it('counts IPv6 by /64', async () => {
    for (let i = 1; i <= 3; i++) {
      callerIp = `2001:db8:1:2::${i}`
      expect((await signUp()).signup.status).toBe(201)
    }
    callerIp = '2001:db8:1:2:ffff::9'
    expect((await client.signupOptions({ turnstileToken: 'tok' })).status).toBe(429)
    callerIp = '2001:db8:1:3::1'
    expect((await client.signupOptions({ turnstileToken: 'tok' })).status).toBe(200)
  })

  it('takes atomically at sign-up: options checked under the cap don’t all succeed', async () => {
    callerIp = '203.0.113.80'
    const keys = await Promise.all([0, 1, 2, 3].map(() => SigningKey.generate()))
    const pending = []
    for (const key of keys) {
      const options = await client.signupOptions({ turnstileToken: 'tok' })
      expect(options.status).toBe(200)
      const passkey = await SoftPasskey.create('ES256', TEST_RP_ID, options.body.userHandle)
      pending.push({ key, options, response: await passkey.register(options.body.options) })
    }
    const replies = await Promise.all(
      pending.map(({ key, options, response }) =>
        client.signupWith(key, { challengeToken: options.body.challengeToken, response })
      )
    )
    expect(replies.map((reply) => reply.status).sort()).toEqual([201, 201, 201, 429])
    expect(accountCount()).toBe(3)
  })

  it('allows 30 sign-ups per network an hour', async () => {
    callerAsn = 64_500
    for (let i = 0; i < 30; i++) {
      callerIp = `198.51.100.${i + 1}`
      expect((await signUp()).signup.status, `sign-up ${i}`).toBe(201)
    }
    callerIp = '198.51.100.200'
    expect((await client.signupOptions({ turnstileToken: 'tok' })).status).toBe(429)
    callerAsn = 64_501
    expect((await client.signupOptions({ turnstileToken: 'tok' })).status).toBe(200)
    callerAsn = 64_500
    advance(HOUR + 5 * MINUTE)
    expect((await signUp()).signup.status).toBe(201)
  })

  it('reads its limits from the vars', async () => {
    h.env.WEB_SIGNUP_PER_IP_DAY = '1'
    callerIp = '203.0.113.90'
    expect((await signUp()).signup.status).toBe(201)
    expect((await client.signupOptions({ turnstileToken: 'tok' })).status).toBe(429)
    h.env.WEB_SIGNUP_PER_IP_DAY = '3'
    h.env.WEB_SIGNUP_PER_ASN_HOUR = '1'
    callerAsn = 64_510
    callerIp = '203.0.113.91'
    expect((await signUp()).signup.status).toBe(201)
    callerIp = '203.0.113.92'
    expect((await client.signupOptions({ turnstileToken: 'tok' })).status).toBe(429)
    h.env.WEB_RECOVERY_PER_IP_DAY = '1'
    const phone = await openTestSession(app, h.env)
    callerAsn = null
    callerIp = '203.0.113.93'
    expect((await client.recovery(phone.key)).status).toBe(200)
    expect((await client.recovery(phone.key)).status).toBe(429)
  })

  it('keeps counting across the daily key change, and never stores an IP or ASN', async () => {
    vi.setSystemTime(Date.UTC(2026, 9, 30, 22))
    callerIp = '203.0.113.100'
    callerAsn = 64_520
    for (let i = 0; i < 3; i++) expect((await signUp()).signup.status).toBe(201)
    // Past midnight UTC, under a new key, yesterday's sign-ups still count.
    vi.setSystemTime(Date.UTC(2026, 9, 31, 2))
    expect((await client.signupOptions({ turnstileToken: 'tok' })).status).toBe(429)
    vi.setSystemTime(Date.UTC(2026, 9, 31, 23))
    expect((await signUp()).signup.status).toBe(201)

    const keys = h.rateCounters.storage(await capsShardName(h.env, '64520')).query('SELECT DISTINCT key FROM hits')
    const names = keys.map((row) => String(row.key))
    expect(names.length).toBe(4)
    for (const name of names) {
      expect(name).toMatch(/^signup-(ip|asn):[A-Za-z0-9_-]{43}$/)
      expect(name).not.toContain('203.0.113')
      expect(name).not.toContain('64520')
    }
  })

  it('gives the caps back when the write fails', async () => {
    callerIp = '203.0.113.110'
    const failing = failQueries(h.accountsDb!, /insert into "passkeys"/i)
    for (let i = 0; i < 3; i++) {
      const reply = await signUp()
      expect(reply.signup).toMatchObject({ status: 500, body: { error: 'internal' } })
    }
    failing.mockRestore()
    expect(accountCount()).toBe(0)
    for (let i = 0; i < 3; i++) expect((await signUp()).signup.status).toBe(201)
    expect((await client.signupOptions({ turnstileToken: 'tok' })).status).toBe(429)
  })

  it('lets the options through when the counter is unreachable, but not the sign-up', async () => {
    callerIp = '203.0.113.120'
    const shard = await capsShardName(h.env, null)
    h.rateCounters.failNextReply(shard)
    expect((await client.signupOptions({ turnstileToken: 'tok' })).status).toBe(200)
    const key = await SigningKey.generate()
    const options = await client.signupOptions({ turnstileToken: 'tok' })
    const passkey = await SoftPasskey.create('ES256', TEST_RP_ID, options.body.userHandle)
    const response = await passkey.register(options.body.options)
    h.rateCounters.failNextReply(shard)
    const refused = await client.signupWith(key, { challengeToken: options.body.challengeToken, response })
    expect(refused).toMatchObject({ status: 503, body: { error: 'unavailable' } })
    expect(Number(refused.headers?.get('retry-after'))).toBeGreaterThan(0)
    expect(accountCount()).toBe(0)
  })

  it('keeps each network’s counts in its own object, named by an HMAC of the ASN', async () => {
    callerIp = '203.0.113.150'
    callerAsn = 64_530
    expect((await signUp()).signup.status).toBe(201)
    callerAsn = 64_531
    expect((await signUp()).signup.status).toBe(201)
    const [a, b] = [await capsShardName(h.env, '64530'), await capsShardName(h.env, '64531')]
    expect(a).not.toBe(b)
    for (const name of [a, b]) {
      expect(name).not.toContain('64530')
      expect(name).not.toContain('64531')
      expect(h.rateCounters.storage(name).query('SELECT COUNT(*) AS n FROM hits')).toEqual([{ n: 2 }])
    }
  })

  it('still refuses a capped IP after its counter object restarts', async () => {
    callerIp = '203.0.113.160'
    for (let i = 0; i < 3; i++) expect((await signUp()).signup.status).toBe(201)
    h.rateCounters.restart(await capsShardName(h.env, null))
    expect((await client.signupOptions({ turnstileToken: 'tok' })).status).toBe(429)
    const phone = await openTestSession(app, h.env)
    callerIp = '203.0.113.161'
    for (let i = 0; i < 10; i++) expect((await client.recovery(phone.key)).status).toBe(200)
    h.rateCounters.restart(await capsShardName(h.env, null))
    expect((await client.recovery(phone.key)).status).toBe(429)
  })

  it('takes each sign-up and recovery envelope once (409 replay)', async () => {
    const phone = await openTestSession(app, h.env)
    const { signedEnvelope } = await import('../test/passkeys')
    const recovery = await signedEnvelope('web/recovery', phone.key, { turnstileToken: 'tok' })
    expect((await send('POST', '/web/recovery', recovery)).status).toBe(200)
    expect((await send('POST', '/web/recovery', recovery)).body).toMatchObject({ error: 'replay' })

    const key = await SigningKey.generate()
    const options = await client.signupOptions({ turnstileToken: 'tok' })
    const passkey = await SoftPasskey.create('ES256', TEST_RP_ID, options.body.userHandle)
    const envelope = await signedEnvelope('web/signup', key, {
      challengeToken: options.body.challengeToken,
      response: await passkey.register(options.body.options),
    })
    expect((await send('POST', '/web/signup', envelope)).status).toBe(201)
    expect((await send('POST', '/web/signup', envelope)).body).toMatchObject({ error: 'replay' })
  })
})

describe('POST /web/recovery', () => {
  it('gives a recovery ticket that opens a web session', async () => {
    const phone = await openTestSession(app, h.env)
    callerIp = '203.0.113.130'
    const recovery = await client.recovery(phone.key, 'tok')
    expect(recovery.status).toBe(200)
    expect(recovery.body).toMatchObject({ ok: true, accountId: phone.accountId })
    expect(recovery.body.ticketExpiresAt).toBe(START + 2 * MINUTE)
    expect(siteverify).toEqual([
      expect.objectContaining({ secret: PASS, response: 'tok', remoteip: '203.0.113.130' }),
    ])
    const { reply } = await client.openWeb(phone.key, recovery.body.ticket, { appVersion: '1.46.0' })
    expect(reply).toMatchObject({ status: 201, body: { accountId: phone.accountId, platform: 'web' } })
    expect(sql('SELECT method FROM account_sessions WHERE platform = ?', 'web')).toEqual([{ method: 'recovery' }])
  })

  it('works for an account made on the web', async () => {
    const { key, options } = await signUp()
    const recovery = await client.recovery(key)
    expect(recovery.body.accountId).toBe(options.body.accountId)
  })

  it('never creates an account', async () => {
    const key = await SigningKey.generate()
    expect(await client.recovery(key)).toMatchObject({
      status: 404,
      body: { error: 'unknown_account' },
    })
    expect(accountCount()).toBe(0)
  })

  it('checks Turnstile for the web-recovery action', async () => {
    const phone = await openTestSession(app, h.env)
    h.env.TURNSTILE_SECRET_KEY = REAL
    h.env.TURNSTILE_HOSTNAMES = 'verify-beta.witnesswork.app'
    expect(
      (await client.recovery(phone.key, 'pass:web-signup:verify-beta.witnesswork.app')).body
    ).toMatchObject({ error: 'turnstile_failed', reason: 'action-mismatch' })
    expect(
      (await client.recovery(phone.key, 'pass:web-recovery:beta.app.witnesswork.app')).body
    ).toMatchObject({ error: 'turnstile_failed', reason: 'hostname-mismatch' })
    expect(
      (await client.recovery(phone.key, 'pass:web-recovery:verify-beta.witnesswork.app')).status
    ).toBe(200)
    expect((await client.recovery(phone.key, 42)).body).toMatchObject({ error: 'bad_request' })
  })

  it('allows 10 per IP a rolling day, counted only once Siteverify passes', async () => {
    const phone = await openTestSession(app, h.env)
    callerIp = '203.0.113.140'
    // Junk with a refused token never locks the IP out.
    h.env.TURNSTILE_SECRET_KEY = FAIL
    for (let i = 0; i < 20; i++) expect((await client.recovery(phone.key)).status).toBe(403)
    h.env.TURNSTILE_SECRET_KEY = PASS
    for (let i = 0; i < 10; i++) expect((await client.recovery(phone.key)).status).toBe(200)
    siteverify = []
    const over = await client.recovery(phone.key)
    expect(over).toMatchObject({ status: 429, body: { error: 'rate_limited' } })
    // Checked before Siteverify too, so a capped IP spends no token.
    expect(siteverify).toEqual([])
    callerIp = '203.0.113.141'
    expect((await client.recovery(phone.key)).status).toBe(200)
    callerIp = '203.0.113.140'
    advance(DAY + HOUR)
    expect((await client.recovery(phone.key)).status).toBe(200)
  })

  it('needs the key’s signature', async () => {
    const phone = await openTestSession(app, h.env)
    const { signedEnvelope } = await import('../test/passkeys')
    const envelope = await signedEnvelope('web/recovery', phone.key, { turnstileToken: 'tok' }, await SigningKey.generate())
    expect(await send('POST', '/web/recovery', envelope)).toMatchObject({
      status: 401,
      body: { error: 'bad_signature' },
    })
  })
})

describe('without Turnstile', () => {
  it('uses Cloudflare’s test secret on a development worker', async () => {
    delete h.env.TURNSTILE_SECRET_KEY
    expect((await client.signupOptions({ turnstileToken: 'tok' })).status).toBe(200)
    expect(siteverify[0].secret).toBe(PASS)
  })

  it('is disabled on production without a secret', async () => {
    delete h.env.TURNSTILE_SECRET_KEY
    h.env.APP_ATTEST_ENVIRONMENT = 'production'
    const phone = { key: await SigningKey.generate() }
    expect(await client.signupOptions({ turnstileToken: 'tok' })).toMatchObject({
      status: 503,
      body: { error: 'disabled' },
    })
    expect(await client.recovery(phone.key)).toMatchObject({
      status: 503,
      body: { error: 'disabled' },
    })
  })
})
