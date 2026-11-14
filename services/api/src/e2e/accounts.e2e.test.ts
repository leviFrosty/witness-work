import { afterAll, describe, expect, it } from 'vitest'
import { accountSignedMessage, type AccountsOp } from '../accounts/contracts'
import {
  SigningKey,
  b64u,
  randomBytes,
  randomId,
  sha256B64u,
} from '../test/buddiesClient'
import {
  ADMIN_TOKEN,
  DEV_BYPASS_TOKEN,
  LOCAL_LAUNCHER,
  http,
  httpBytes,
  localKv,
  writeTranscript,
} from '../test/e2e'

/**
 * Anonymous accounts: open an attested session (the dev bypass), read the
 * account with GET /account, refresh, and close it; register and read the
 * account back with the legacy account/info, move the key through a handoff
 * channel, and back up to R2, both ways; and the legacy switch refusing the
 * envelope forms with 426.
 */

afterAll(() => {
  writeTranscript('accounts')
})

const encoder = new TextEncoder()

const signedEnvelope = async (
  op: AccountsOp,
  key: SigningKey,
  fields: Record<string, unknown> = {},
  signer = key
) => {
  const bytes = encoder.encode(
    JSON.stringify({
      accountPub: key.publicKey,
      ts: Date.now(),
      nonce: randomId(),
      ...fields,
    })
  )
  return {
    payload: b64u(bytes),
    signature: b64u(await signer.sign(accountSignedMessage(op, bytes))),
  }
}

const send = async (
  op: AccountsOp,
  key: SigningKey,
  signer = key,
  fields: Record<string, unknown> = {}
) =>
  http('POST', `/accounts/v1/${op}`, {
    body: await signedEnvelope(op, key, fields, signer),
  })

interface Session {
  key: SigningKey
  accountId: string
  sessionId: string
  accessToken: string
  refreshToken: string
  accessExpiresAt: number
  sessionExpiresAt: number
}

const openSession = async (key?: SigningKey): Promise<Session> => {
  const signingKey = key ?? (await SigningKey.generate())
  const res = await http('POST', '/accounts/v1/sessions', {
    headers: { 'x-ww-dev-bypass': DEV_BYPASS_TOKEN ?? '' },
    body: await signedEnvelope('session/open', signingKey),
  })
  expect(res.status).toBe(201)
  expect(res.headers.get('location')).toBe('/accounts/v1/sessions/current')
  return { key: signingKey, ...(res.body as Omit<Session, 'key'>) }
}

const bearer = (session: Session) => ({
  authorization: `Bearer ${session.accessToken}`,
})

const registered = async () => {
  const key = await SigningKey.generate()
  expect((await send('account/register', key)).status).toBe(200)
  return key
}

describe('POST /accounts/v1/account/info', () => {
  it('404s for a key that never registered, without creating it', async () => {
    const key = await SigningKey.generate()
    const res = await send('account/info', key)
    expect(res.status).toBe(404)
    expect(res.body).toMatchObject({ ok: false, code: 'unknown_account' })
  })

  it('reads back the account register created', async () => {
    const key = await SigningKey.generate()
    const registered = await send('account/register', key)
    expect(registered.status).toBe(200)
    const { accountId } = registered.body as { accountId: string }

    const res = await send('account/info', key)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      ok: true,
      accountId,
      accountPub: key.publicKey,
      status: 'active',
      createdAt: expect.any(Number),
      keyEpoch: 0,
      inboxIds: [],
      statusChanges: [],
    })
  })

  it('refuses another key’s signature', async () => {
    const key = await SigningKey.generate()
    await send('account/register', key)
    const res = await send('account/info', key, await SigningKey.generate())
    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: 'bad_signature' })
  })

  it.skipIf(!ADMIN_TOKEN)('shows a suspension made through admin', async () => {
    const key = await SigningKey.generate()
    const { accountId } = (await send('account/register', key)).body as {
      accountId: string
    }
    const suspended = await http('POST', '/admin/accounts/status', {
      headers: { 'x-ww-admin-token': ADMIN_TOKEN ?? '' },
      body: { accountId, status: 'suspended', reason: 'admin' },
    })
    expect(suspended.status).toBe(200)

    const res = await send('account/info', key)
    expect(res.body).toMatchObject({
      status: 'suspended',
      statusChanges: [{ status: 'suspended', createdAt: expect.any(Number) }],
    })
    expect(JSON.stringify(res.body)).not.toContain('admin')
  })
})

describe('POST /accounts/v1/handoff/*', () => {
  it('relays a sealed key from the old phone to the new one', async () => {
    const key = await registered()
    const token = randomBytes(16)
    const channelId = randomId()
    const claimToken = b64u(token)
    const opened = await send('handoff/open', key, key, {
      channelId,
      verifier: await sha256B64u(token),
    })
    expect(opened.status).toBe(200)
    expect(opened.body).toEqual({ ok: true, expiresAt: expect.any(Number) })

    const claimPub = (await SigningKey.generate()).publicKey
    const hello = b64u(randomBytes(120))
    const claim = { channelId, claimToken, claimPub, hello }
    expect((await http('POST', '/accounts/v1/handoff/claim', { body: claim })).status).toBe(200)
    // A lost response, repeated.
    expect((await http('POST', '/accounts/v1/handoff/claim', { body: claim })).status).toBe(200)

    const status = await send('handoff/status', key, key, { channelId })
    expect(status.body).toMatchObject({ ok: true, status: 'claimed', claimPub, hello })
    // Another account can't read it.
    const stranger = await registered()
    expect((await send('handoff/status', stranger, stranger, { channelId })).body.code).toBe('forbidden')

    const sealedKey = b64u(randomBytes(80))
    expect((await send('handoff/send', key, key, { channelId, key: sealedKey })).status).toBe(200)
    const received = await http('POST', '/accounts/v1/handoff/receive', {
      body: { channelId, claimToken },
    })
    expect(received.body).toEqual({ ok: true, status: 'sent', key: sealedKey })
    expect(
      (await http('POST', '/accounts/v1/handoff/done', { body: { channelId, claimToken } })).status
    ).toBe(200)
    expect((await send('handoff/status', key, key, { channelId })).body).toEqual({
      ok: true,
      status: 'done',
      expiresAt: opened.body.expiresAt,
    })
  })

  it('burns a channel after five wrong tokens', async () => {
    const key = await registered()
    const token = randomBytes(16)
    const channelId = randomId()
    await send('handoff/open', key, key, { channelId, verifier: await sha256B64u(token) })
    for (let i = 0; i < 5; i++) {
      const wrong = await http('POST', '/accounts/v1/handoff/receive', {
        body: { channelId, claimToken: randomId() },
      })
      expect(wrong.body.code).toBe('bad_signature')
    }
    expect((await send('handoff/status', key, key, { channelId })).body.status).toBe('cancelled')
  })
})

describe('POST /accounts/v1/backup/*', () => {
  const put = async (key: SigningKey, slotId: string, bytes: Uint8Array) => {
    const { payload, signature } = await signedEnvelope('backup/put', key, {
      slotId,
      size: bytes.byteLength,
      sha256: await sha256B64u(bytes),
    })
    return httpBytes('/accounts/v1/backup/put', {
      bytes,
      headers: { 'x-ww-payload': payload, 'x-ww-signature': signature },
    })
  }

  it('round-trips a slot through R2 and deletes it', async () => {
    const key = await registered()
    const slotId = randomId()
    const bytes = randomBytes(64 * 1_024)
    const stored = await put(key, slotId, bytes)
    expect(stored.status).toBe(200)
    expect(stored.body).toEqual({
      ok: true,
      uploadedAt: expect.any(Number),
      etag: expect.any(String),
    })
    // One put a slot a minute.
    const again = await put(key, slotId, bytes)
    expect(again.status).toBe(429)
    expect(again.body.code).toBe('rate_limited')

    const listed = await send('backup/list', key)
    expect(listed.body).toEqual({
      ok: true,
      slots: [
        {
          slotId,
          size: bytes.byteLength,
          uploadedAt: stored.body.uploadedAt,
          etag: stored.body.etag,
        },
      ],
    })

    const got = await httpBytes('/accounts/v1/backup/get', {
      json: await signedEnvelope('backup/get', key, { slotId }),
    })
    expect(got.status).toBe(200)
    expect(got.bytes).toEqual(bytes)
    expect(got.headers.get('etag')).toBe(`"${stored.body.etag}"`)

    expect((await send('backup/delete', key)).status).toBe(200)
    expect((await send('backup/list', key)).body.slots).toEqual([])
  })

  it('refuses a body whose sha256 differs', async () => {
    const key = await registered()
    const bytes = randomBytes(1_000)
    const { payload, signature } = await signedEnvelope('backup/put', key, {
      slotId: randomId(),
      size: bytes.byteLength,
      sha256: await sha256B64u(randomBytes(1_000)),
    })
    const res = await httpBytes('/accounts/v1/backup/put', {
      bytes,
      headers: { 'x-ww-payload': payload, 'x-ww-signature': signature },
    })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('bad_request')
  })
})

describe.skipIf(!DEV_BYPASS_TOKEN)('/accounts/v1/sessions (dev bypass)', () => {
  it('opens a session, reads the account with it, refreshes, and closes', async () => {
    const session = await openSession()
    expect(session).toMatchObject({
      accountId: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
      sessionId: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
      accessToken: expect.stringMatching(/^[\w-]+\.[\w-]+\.[\w-]+$/),
      refreshToken: expect.stringMatching(
        /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/
      ),
    })
    expect(session.sessionExpiresAt - session.accessExpiresAt).toBeGreaterThan(89 * 24 * 3_600_000)

    const info = await http('GET', '/accounts/v1/account', { headers: bearer(session) })
    expect(info.status).toBe(200)
    expect(info.body).toMatchObject({
      ok: true,
      accountId: session.accountId,
      accountPub: session.key.publicKey,
      status: 'active',
    })
    // The legacy path answers bearer requests the same way.
    const legacyInfo = await http('POST', '/accounts/v1/account/info', {
      headers: bearer(session),
    })
    expect(legacyInfo.body).toEqual(info.body)

    const refreshed = await http('POST', '/accounts/v1/sessions/refresh', {
      body: { refreshToken: session.refreshToken },
    })
    expect(refreshed.status).toBe(200)
    expect(refreshed.body).toMatchObject({
      ok: true,
      sessionExpiresAt: session.sessionExpiresAt,
    })
    expect(refreshed.body.refreshToken).not.toBe(session.refreshToken)
    const next = { ...session, ...(refreshed.body as Partial<Session>) }
    expect(
      (await http('GET', '/accounts/v1/account', { headers: bearer(next) })).body.accountId
    ).toBe(session.accountId)

    const closed = await http('DELETE', '/accounts/v1/sessions/current', { headers: bearer(next) })
    expect(closed.status).toBe(200)
    expect(closed.body).toEqual({ ok: true })
    // Idempotent while the access token lives.
    expect(
      (await http('DELETE', '/accounts/v1/sessions/current', { headers: bearer(next) })).status
    ).toBe(200)
    const after = await http('POST', '/accounts/v1/sessions/refresh', {
      body: { refreshToken: next.refreshToken },
    })
    expect(after.status).toBe(401)
    expect(after.body.code).toBe('unauthorized')
    expect(after.headers.get('www-authenticate')).toBe('Bearer error="invalid_token"')
  })

  it('ends the session when an older refresh token comes back', async () => {
    const refresh = (refreshToken: string) =>
      http('POST', '/accounts/v1/sessions/refresh', { body: { refreshToken } })
    const session = await openSession()
    const first = await refresh(session.refreshToken)
    expect(first.status).toBe(200)
    const second = await refresh(first.body.refreshToken as string)
    expect(second.status).toBe(200)

    // Two tokens old: refused, and the session ends with it.
    const reused = await refresh(session.refreshToken)
    expect(reused.status).toBe(401)
    expect(reused.body.code).toBe('unauthorized')
    expect((await refresh(second.body.refreshToken as string)).status).toBe(401)

    // Malformed tokens are refused alike.
    for (const token of ['', 'not-a-token', b64u(randomBytes(32))])
      expect((await refresh(token)).status).toBe(401)
  })

  it('never ends a session for a refresh token it didn’t issue', async () => {
    const refresh = (refreshToken: string) =>
      http('POST', '/accounts/v1/sessions/refresh', { body: { refreshToken } })
    const session = await openSession()
    const [sessionId, secret, mac] = session.refreshToken.split('.')
    // The session id is no secret (every access token's `sid`); without the
    // worker's MAC, a token naming it is refused and the session lives.
    for (const token of [
      `${sessionId}.${b64u(randomBytes(32))}.${b64u(randomBytes(32))}`,
      `${sessionId}.${b64u(randomBytes(32))}.${mac}`,
      // Two-part tokens from before the MAC.
      `${sessionId}.${secret}`,
      `${sessionId}.${b64u(randomBytes(32))}`,
    ]) {
      const refused = await refresh(token)
      expect(refused.status).toBe(401)
      expect(refused.body.code).toBe('unauthorized')
    }
    const next = await refresh(session.refreshToken)
    expect(next.status).toBe(200)
    expect((await refresh(next.body.refreshToken as string)).status).toBe(200)
  })

  it('gives a double refresh and a lost-response retry the same token', async () => {
    const refresh = (refreshToken: string) =>
      http('POST', '/accounts/v1/sessions/refresh', { body: { refreshToken } })
    const session = await openSession()
    const [one, two] = await Promise.all([
      refresh(session.refreshToken),
      refresh(session.refreshToken),
    ])
    expect(one.status).toBe(200)
    expect(two.status).toBe(200)
    expect(two.body.refreshToken).toBe(one.body.refreshToken)
    // A retry within the minute, as after a lost response, gets it again.
    const retried = await refresh(session.refreshToken)
    expect(retried.body.refreshToken).toBe(one.body.refreshToken)

    // Whichever answer the device kept, the session goes on.
    const next = await refresh(one.body.refreshToken as string)
    expect(next.status).toBe(200)
    const info = await http('GET', '/accounts/v1/account', {
      headers: { authorization: `Bearer ${next.body.accessToken}` },
    })
    expect(info.body.accountId).toBe(session.accountId)
  })

  it('refuses a bad bearer token without trying the envelope', async () => {
    const key = await registered()
    const res = await http('POST', '/accounts/v1/account/info', {
      headers: { authorization: 'Bearer not.a.token' },
      body: await signedEnvelope('account/info', key),
    })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('unauthorized')
  })

  it('backs up and hands off with a bearer token', async () => {
    const session = await openSession()
    const slotId = randomId()
    const bytes = randomBytes(8 * 1_024)
    const stored = await httpBytes('/accounts/v1/backup/put', {
      bytes,
      headers: {
        ...bearer(session),
        'x-ww-slot-id': slotId,
        'x-ww-sha256': await sha256B64u(bytes),
      },
    })
    expect(stored.status).toBe(200)
    const got = await httpBytes('/accounts/v1/backup/get', {
      json: { slotId },
      headers: bearer(session),
    })
    expect(got.bytes).toEqual(bytes)
    // A token alone can't delete; the account key signs it too.
    expect(
      (await http('POST', '/accounts/v1/backup/delete', { headers: bearer(session), body: { slotId } }))
        .status
    ).toBe(400)
    const deleted = await http('POST', '/accounts/v1/backup/delete', {
      headers: bearer(session),
      body: await signedEnvelope('backup/delete', session.key, { slotId }),
    })
    expect(deleted.status).toBe(200)
    const listed = await http('POST', '/accounts/v1/backup/list', { headers: bearer(session) })
    expect(listed.body).toEqual({ ok: true, slots: [] })

    const token = randomBytes(16)
    const channelId = randomId()
    const opened = await http('POST', '/accounts/v1/handoff/open', {
      headers: bearer(session),
      body: { channelId, verifier: await sha256B64u(token) },
    })
    expect(opened.status).toBe(200)
    const status = await http('POST', '/accounts/v1/handoff/status', {
      headers: bearer(session),
      body: { channelId },
    })
    expect(status.body).toMatchObject({ ok: true, status: 'open' })
    const cancelled = await http('POST', '/accounts/v1/handoff/cancel', {
      headers: bearer(session),
      body: { channelId },
    })
    expect(cancelled.status).toBe(200)
  })
})

describe.skipIf(!LOCAL_LAUNCHER || !DEV_BYPASS_TOKEN)('the legacy switch (local KV)', () => {
  it('refuses envelope-authenticated requests with 426 while bearer ones work', async () => {
    const key = await registered()
    const session = await openSession(key)
    try {
      localKv('put', 'auth:legacy', 'off')
      const info = await send('account/info', key)
      expect(info.status).toBe(426)
      expect(info.body).toEqual({ ok: false, error: 'upgrade_required', code: 'upgrade_required' })
      expect(info.headers.get('retry-after')).toBeNull()
      expect((await send('account/register', await SigningKey.generate())).status).toBe(426)
      expect((await send('backup/list', key)).status).toBe(426)

      const viaToken = await http('GET', '/accounts/v1/account', { headers: bearer(session) })
      expect(viaToken.status).toBe(200)
      expect(viaToken.body.accountId).toBe(session.accountId)
      const legacyPath = await http('POST', '/accounts/v1/account/info', {
        headers: bearer(session),
      })
      expect(legacyPath.status).toBe(200)
      // Sessions still open (they replace account/register).
      await openSession()
    } finally {
      // Back to the suites' default: on (see src/test/e2eGlobalSetup.ts).
      localKv('put', 'auth:legacy', 'on')
    }
    expect((await send('account/info', key)).status).toBe(200)
  })
})

describe('GET /app/v1/config', () => {
  it('answers without authentication', async () => {
    const res = await http('GET', '/app/v1/config')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.body.ok).toBe(true)
    // Coarse location from request.cf: always present, null when unknown.
    expect(res.body.country === null || /^[A-Z]{2}$/.test(res.body.country)).toBe(true)
    expect(res.body.regionCode === null || /^[A-Z0-9]{1,3}$/.test(res.body.regionCode)).toBe(true)
    if (res.body.country === null) expect(res.body.regionCode).toBeNull()
  })

  it.skipIf(!LOCAL_LAUNCHER)('serves KV app:min-version', async () => {
    try {
      localKv('put', 'app:min-version', '{"minVersion":"9.8.7"}')
      expect((await http('GET', '/app/v1/config')).body).toMatchObject({ ok: true, minAppVersion: '9.8.7' })
    } finally {
      localKv('delete', 'app:min-version')
    }
    expect((await http('GET', '/app/v1/config')).body).not.toHaveProperty('minAppVersion')
  })
})

describe('GET /accounts/handoff', () => {
  it.each(['/accounts/handoff', '/h'])('%s serves the scan-from-the-app page', async (path) => {
    const res = await http('GET', path)
    expect(res.status).toBe(200)
    expect(res.text).toContain('Scan this code in WitnessWork')
  })
})
