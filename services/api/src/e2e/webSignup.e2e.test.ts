import { afterAll, describe, expect, it } from 'vitest'
import { DEV_BYPASS_TOKEN, LOCAL_LAUNCHER, http, localKv, openSession, writeTranscript } from '../test/e2e'
import { SigningKey, randomId } from '../test/buddiesClient'
import { PasskeyClient, authorization } from '../test/passkeys'
import { SoftPasskey, fakeWrap } from '../test/webauthn'

/**
 * Web sign-up and recovery over real HTTP (witness-work
 * `docs/passkeys-protocol.md`, "Web sign-up"), against the local worker's
 * Cloudflare Turnstile test keys and the real Siteverify: config, sign-up
 * from a localhost origin with a wrap, refresh, sign-in with the new passkey,
 * a recovery ticket and its session, the per-IP cap, and the kill switch.
 * Writes `.verify/artifacts/e2e-web-signup-*.json`.
 */

const LOCAL_ORIGIN = 'http://localhost:8081'
/** Each run its own IPv6 /64, so the caps of earlier runs don't count. */
const ipv6 = () => {
  const group = () => Math.floor(Math.random() * 0xffff).toString(16)
  return `2001:db8:${group()}:${group()}::1`
}
let callerIp: string | null = null
const client = new PasskeyClient((method, path, body, headers) =>
  http(method, `/accounts/v1${path}`, {
    body,
    headers: { ...(callerIp ? { 'cf-connecting-ip': callerIp } : {}), ...headers },
  })
)
const signUp = async (extra: Record<string, unknown> = {}) => {
  const key = await SigningKey.generate()
  return {
    key,
    ...(await client.signUp(key, {
      rpId: 'localhost',
      turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
      ceremony: { origin: LOCAL_ORIGIN },
      extra,
    })),
  }
}

afterAll(() => {
  writeTranscript('web-signup')
})

describe('web sign-up on the local worker', () => {
  it('says sign-up is open, with the Turnstile test site key', async () => {
    const config = await http('GET', '/app/v1/config')
    expect(config.status).toBe(200)
    expect(config.body.webSignup).toEqual({
      enabled: true,
      turnstileSiteKey: '1x00000000000000000000AA',
    })
  })

  it('signs up through Turnstile, refreshes, signs back in with the passkey, and unlocks', async () => {
    const wrapId = randomId()
    const wrap = fakeWrap()
    const { key, options, signup, passkey } = await signUp({ wrapId, wrap, appVersion: '1.46.0' })
    expect(options.body.options.rp.id).toBe('localhost')
    expect(signup.status).toBe(201)
    expect(signup.body).toMatchObject({
      accountId: options.body.accountId,
      platform: 'web',
      credentialId: passkey.credentialId,
    })

    const refreshed = await http('POST', '/accounts/v1/sessions/refresh', {
      body: { refreshToken: signup.body.refreshToken, appVersion: '1.46.0' },
    })
    expect(refreshed.status).toBe(200)
    const activity = await http('GET', '/accounts/v1/activity', {
      headers: authorization(refreshed.body.accessToken),
    })
    expect(
      activity.body.activity.map((entry: { kind: string; method?: string }) =>
        entry.method ? `${entry.kind}(${entry.method})` : entry.kind
      )
    ).toEqual(['passkey.added', 'session.opened(signup)', 'account.created'])

    const { assert } = await client.signIn(passkey, {
      rpId: 'localhost',
      ceremony: { origin: LOCAL_ORIGIN },
    })
    expect(assert.status).toBe(200)
    expect(assert.body).toMatchObject({
      accountId: options.body.accountId,
      accountPub: key.publicKey,
      userHandle: options.body.userHandle,
      wraps: [{ wrapId, wrap, keyEpoch: 0 }],
    })
    const opened = await client.openWeb(key, assert.body.ticket)
    expect(opened.reply).toMatchObject({ status: 201, body: { platform: 'web' } })

    // A lost response: the same key again is a conflict.
    const again = await client.signupOptions({ rpId: 'localhost', turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' })
    const second = await SoftPasskey.create('ES256', 'localhost', again.body.userHandle)
    const conflict = await client.signupWith(key, {
      challengeToken: again.body.challengeToken,
      response: await second.register(again.body.options, { origin: LOCAL_ORIGIN }),
    })
    expect(conflict).toMatchObject({ status: 409, body: { error: 'conflict' } })
  })

  it.skipIf(!DEV_BYPASS_TOKEN)('recovers an account with its key: a ticket, then a web session', async () => {
    const phone = await openSession()
    const recovery = await client.recovery(phone.key, 'XXXX.DUMMY.TOKEN.XXXX')
    expect(recovery).toMatchObject({ status: 200, body: { accountId: phone.accountId } })
    const opened = await client.openWeb(phone.key, recovery.body.ticket, { appVersion: '1.46.0' })
    expect(opened.reply).toMatchObject({ status: 201, body: { platform: 'web', accountId: phone.accountId } })
    const sessions = await http('GET', '/accounts/v1/sessions', {
      headers: authorization(opened.reply.body.accessToken),
    })
    expect(
      sessions.body.sessions.find(
        (s: { sessionId: string }) => s.sessionId === opened.reply.body.sessionId
      )
    ).toMatchObject({ platform: 'web', method: 'recovery' })

    const stranger = await SigningKey.generate()
    expect(await client.recovery(stranger)).toMatchObject({
      status: 404,
      body: { error: 'unknown_account' },
    })
  })

  it.skipIf(!LOCAL_LAUNCHER)('caps sign-ups at 3 per IP a day', async () => {
    callerIp = ipv6()
    try {
      for (let i = 0; i < 3; i++) expect((await signUp()).signup.status).toBe(201)
      const over = await client.signupOptions({ turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' })
      expect(over).toMatchObject({ status: 429, body: { error: 'rate_limited' } })
      expect(Number(over.headers?.get('retry-after'))).toBeGreaterThan(0)
    } finally {
      callerIp = null
    }
  })

  it.skipIf(!LOCAL_LAUNCHER)('pauses sign-up with KV accounts:web-signup', async () => {
    try {
      localKv('put', 'accounts:web-signup', 'off')
      expect(await client.signupOptions({ turnstileToken: 'x' })).toMatchObject({
        status: 503,
        body: { error: 'disabled' },
      })
      expect((await http('GET', '/app/v1/config')).body.webSignup.enabled).toBe(false)
    } finally {
      localKv('delete', 'accounts:web-signup')
    }
    expect((await http('GET', '/app/v1/config')).body.webSignup.enabled).toBe(true)
  })
})
