import { afterAll, describe, expect, it } from 'vitest'
import { DEV_BYPASS_TOKEN, http, openSession, writeTranscript } from '../test/e2e'
import { SigningKey, b64u, randomBytes, randomId } from '../test/buddiesClient'
import { PasskeyClient, authorization, signedEnvelope } from '../test/passkeys'
import { fakeWrap } from '../test/webauthn'

/**
 * Passkeys over real HTTP (witness-work `docs/passkeys-protocol.md`): a phone
 * (dev bypass) registers a software passkey with a wrap, signs in with it
 * from a localhost origin, opens a web session with the ticket, refreshes it,
 * lists devices and passkeys, steps up, saves a wrap, and removes the
 * passkey; plus the refusals that need the real runtime (origin pairing,
 * used tickets, the legacy switch). Writes `.verify/artifacts/e2e-passkeys-*.json`.
 */

const client = new PasskeyClient((method, path, body, headers) =>
  http(method, `/accounts/v1${path}`, { body, headers })
)
const LOCAL_ORIGIN = 'http://localhost:8081'

afterAll(() => {
  writeTranscript('passkeys')
})

describe.skipIf(!DEV_BYPASS_TOKEN)('passkeys on the local worker', () => {
  it('registers, signs in from a browser, opens and refreshes a web session, steps up, wraps, and removes', async () => {
    const phone = await openSession()
    const wrapId = randomId()
    const wrap = fakeWrap()
    const { passkey, added } = await client.register(phone, {
      rpId: 'localhost',
      algorithm: 'EdDSA',
      ceremony: { origin: LOCAL_ORIGIN },
      extra: { wrapId, wrap },
    })
    expect(added.status).toBe(200)

    const { assert } = await client.signIn(passkey, {
      rpId: 'localhost',
      ceremony: { origin: LOCAL_ORIGIN },
    })
    expect(assert.status).toBe(200)
    expect(assert.body).toMatchObject({
      accountId: phone.accountId,
      accountPub: phone.key.publicKey,
      keyEpoch: 0,
      wraps: [{ wrapId, wrap, keyEpoch: 0 }],
    })

    const opened = await client.openWeb(phone.key, assert.body.ticket, {
      appVersion: '1.46.0',
    })
    expect(opened.reply.status).toBe(201)
    expect(opened.reply.body.platform).toBe('web')
    const web = { key: phone.key, ...opened.reply.body }
    // The same request again (a lost response) gets the same session.
    const repeat = await http('POST', '/accounts/v1/sessions', { body: opened.envelope })
    expect(repeat.status).toBe(201)
    expect(repeat.body.sessionId).toBe(web.sessionId)
    web.refreshToken = repeat.body.refreshToken
    web.accessToken = repeat.body.accessToken
    // Any other request with that ticket is refused.
    expect((await client.openWeb(phone.key, assert.body.ticket)).reply.body.code).toBe('ticket_invalid')

    const refreshed = await http('POST', '/accounts/v1/sessions/refresh', {
      body: { refreshToken: web.refreshToken, appVersion: '1.46.1' },
    })
    expect(refreshed.status).toBe(200)
    web.accessToken = refreshed.body.accessToken

    const devices = await http('GET', '/accounts/v1/sessions', { headers: authorization(web.accessToken) })
    expect(devices.body.sessions).toContainEqual(
      expect.objectContaining({ sessionId: web.sessionId, platform: 'web', method: 'passkey', appVersion: '1.46.1', current: true })
    )

    const stepUp = await client.stepUp(web, passkey, { rpId: 'localhost', ceremony: { origin: LOCAL_ORIGIN } })
    expect(stepUp.assert.status).toBe(200)
    expect(stepUp.assert.body.credentialId).toBe(passkey.credentialId)

    const second = { credentialId: passkey.credentialId, wrapId: randomId(), keyEpoch: 0, wrap: fakeWrap() }
    expect((await client.wrap(web, second)).status).toBe(200)
    expect((await client.wrap(web, second)).status).toBe(200)

    const listed = await client.list(web)
    expect(listed.body.passkeys).toEqual([
      expect.objectContaining({ credentialId: passkey.credentialId, canUnlock: true, createdPlatform: 'dev' }),
    ])

    expect((await client.remove(web, passkey.credentialId)).status).toBe(200)
    const activity = await http('GET', '/accounts/v1/activity', { headers: authorization(web.accessToken) })
    const kinds = activity.body.activity.map((entry: { kind: string }) => entry.kind)
    expect(kinds.slice(0, 3)).toEqual(['passkey.removed', 'session.opened', 'passkey.added'])
    const gone = await client.signIn(passkey, { rpId: 'localhost', ceremony: { origin: LOCAL_ORIGIN } })
    expect(gone.assert.body).toMatchObject({ code: 'passkey_failed', reason: 'unknown_credential' })
  })

  it('checks origins and RP IDs as pairs', async () => {
    const phone = await openSession()
    const { passkey } = await client.register(phone)
    const wrongOrigin = await client.signIn(passkey, { ceremony: { origin: LOCAL_ORIGIN } })
    expect(wrongOrigin.assert.body).toMatchObject({ code: 'passkey_failed', reason: 'origin' })
    const wrongRp = await client.signIn(passkey, {
      rpId: 'localhost',
      ceremony: { origin: LOCAL_ORIGIN, rpId: 'beta.app.witnesswork.app' },
    })
    expect(wrongRp.assert.body).toMatchObject({ code: 'passkey_failed', reason: 'rp_id' })
    const android = await client.signIn(passkey, {
      ceremony: { origin: 'android:apk-key-hash:-sYXRdwJA3hvue3mKpYrOZ9zSPC7b4mbgzJmdZEDO5w' },
    })
    expect(android.assert.status).toBe(200)
    expect(android.assert.body.ticket).toBeUndefined()
  })

  it('never opens a web session or creates an account from a bad ticket', async () => {
    const key = await SigningKey.generate()
    for (const ticket of ['', 'x.y', `${b64u(randomBytes(40))}.${b64u(randomBytes(32))}`]) {
      const { reply } = await client.openWeb(key, ticket)
      expect(reply.status).toBe(403)
      expect(reply.body.code).toBe('ticket_invalid')
    }
    // The key has no account: nothing was created.
    const info = await http('POST', '/accounts/v1/passkeys', {
      body: await signedEnvelope('passkey/add', key, {}),
      headers: authorization('x.y.z'),
    })
    expect(info.status).toBe(401)
  })
})
