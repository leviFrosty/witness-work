import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SigningKey,
  b64u,
  blobOfSize,
  createHarness,
  randomBytes,
  randomId,
  sha256B64u,
  type Harness,
} from '../test/buddies'
import {
  accountEnvelope,
  bearer,
  nextTestIp,
  openTestSession,
  postJson,
  requestJson,
  type TestSession,
} from '../test/accounts'
import { resetAccountStatusCache } from './auth'
import { createAccountsRoutes } from './route'

/**
 * The account routes converted to bearer tokens (witness-work ADR 0027):
 * bearer requests with plain JSON, the legacy envelope while the legacy
 * switch is on, and 426 once it's off. The legacy paths' own behavior is in
 * accounts.test.ts, handoff.test.ts, and backup.test.ts, which run with the
 * switch on.
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

const START = Date.UTC(2026, 9, 15, 12)
const app = createAccountsRoutes() as never

let h: Harness

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  h = await createHarness()
  resetAccountStatusCache()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const post = (path: string, body: unknown, headers?: Record<string, string>) =>
  postJson(app, h.env, path, body, headers)
const session = (key?: SigningKey) => openTestSession(app, h.env, key)
const legacyOff = () => h.kv.put('auth:legacy', 'off')

describe('GET /account', () => {
  const read = (headers?: Record<string, string>) =>
    requestJson(app, h.env, 'GET', '/account', undefined, headers)

  it('reads the token’s account, with or without the legacy switch', async () => {
    const s = await session()
    const first = await read(bearer(s.accessToken))
    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({
      ok: true,
      accountId: s.accountId,
      accountPub: s.key.publicKey,
    })
    await legacyOff()
    expect((await read(bearer(s.accessToken))).status).toBe(200)
  })

  it('is bearer only: no token is 401, never a legacy request', async () => {
    const missing = await read()
    expect(missing.status).toBe(401)
    expect(missing.body.code).toBe('unauthorized')
    expect(missing.headers.get('www-authenticate')).toBe(
      'Bearer error="invalid_token"'
    )
    expect((await read(bearer('expired.or.forged'))).status).toBe(401)
  })

  it('answers disabled without the accounts database', async () => {
    const s = await session()
    delete h.env.ACCOUNTS_DB
    const refused = await read(bearer(s.accessToken))
    expect(refused.status).toBe(503)
    expect(refused.body.code).toBe('disabled')
  })
})

describe('account/info and account/register', () => {
  it('answers a bearer request without a body, and ignores one', async () => {
    const s = await session()
    for (const body of [undefined, {}, await accountEnvelope('account/info', await SigningKey.generate())]) {
      const read = await post('/account/info', body, bearer(s.accessToken))
      expect(read.status).toBe(200)
      expect(read.body.accountId).toBe(s.accountId)
    }
  })

  it('never falls back to the envelope when the token is bad', async () => {
    const s = await session()
    const refused = await post(
      '/account/info',
      await accountEnvelope('account/info', s.key),
      bearer('expired.or.forged')
    )
    expect(refused.status).toBe(401)
    expect(refused.body.code).toBe('unauthorized')
  })

  it('refuses the envelope forms with 426 once the legacy switch is off', async () => {
    const s = await session()
    await legacyOff()
    const info = await post('/account/info', await accountEnvelope('account/info', s.key))
    expect(info.status).toBe(426)
    expect(info.body.code).toBe('upgrade_required')
    const register = await post(
      '/account/register',
      await accountEnvelope('account/register', await SigningKey.generate())
    )
    expect(register.status).toBe(426)
    // Sessions and bearer requests carry on.
    expect((await post('/account/info', undefined, bearer(s.accessToken))).status).toBe(200)
    await session()
  })

  it('follows AUTH_LEGACY when the KV key is absent', async () => {
    h.env.AUTH_LEGACY = 'off'
    const refused = await post(
      '/account/register',
      await accountEnvelope('account/register', await SigningKey.generate())
    )
    expect(refused.status).toBe(426)
    await h.kv.put('auth:legacy', 'on')
    const allowed = await post(
      '/account/register',
      await accountEnvelope('account/register', await SigningKey.generate())
    )
    expect(allowed.status).toBe(200)
  })
})

// --- Handoff -----------------------------------------------------------------

const newChannel = async () => {
  const token = randomBytes(16)
  return {
    channelId: randomId(),
    claimToken: b64u(token),
    verifier: await sha256B64u(token),
  }
}
type Channel = Awaited<ReturnType<typeof newChannel>>

const claim = async (ch: Channel, headers?: Record<string, string>) =>
  post(
    '/handoff/claim',
    {
      channelId: ch.channelId,
      claimToken: ch.claimToken,
      claimPub: (await SigningKey.generate()).publicKey,
      hello: blobOfSize(200),
    },
    headers
  )

describe('handoff, old phone with a bearer token', () => {
  it('opens, reads, sends, and the new phone receives', async () => {
    const s = await session()
    const ch = await newChannel()
    const auth = bearer(s.accessToken)
    expect(
      await post('/handoff/open', { channelId: ch.channelId, verifier: ch.verifier }, auth)
    ).toMatchObject({ status: 200, body: { ok: true, expiresAt: START + 10 * 60_000 } })
    expect((await post('/handoff/status', { channelId: ch.channelId }, auth)).body).toMatchObject({
      ok: true,
      status: 'open',
    })
    expect((await claim(ch)).status).toBe(200)
    expect((await post('/handoff/status', { channelId: ch.channelId }, auth)).body.status).toBe(
      'claimed'
    )
    const sealedKey = blobOfSize(80)
    expect(
      (await post('/handoff/send', { channelId: ch.channelId, key: sealedKey }, auth)).status
    ).toBe(200)
    const received = await post('/handoff/receive', {
      channelId: ch.channelId,
      claimToken: ch.claimToken,
    })
    expect(received.body).toEqual({ ok: true, status: 'sent', key: sealedKey })
  })

  it('is the same channel owner whichever way the old phone authenticates', async () => {
    const s = await session()
    const ch = await newChannel()
    await post(
      '/handoff/open',
      { channelId: ch.channelId, verifier: ch.verifier },
      bearer(s.accessToken)
    )
    // The envelope form, signed by the same account key, reads it too.
    const legacy = await post(
      '/handoff/status',
      await accountEnvelope('handoff/status', s.key, { channelId: ch.channelId })
    )
    expect(legacy.body.status).toBe('open')
    // Another account's token can't.
    const other = await session()
    const refused = await post(
      '/handoff/status',
      { channelId: ch.channelId },
      bearer(other.accessToken)
    )
    expect(refused.status).toBe(403)
    expect(refused.body.code).toBe('forbidden')
  })

  it('checks the plain JSON fields', async () => {
    const s = await session()
    const auth = bearer(s.accessToken)
    expect((await post('/handoff/open', { channelId: 'short' }, auth)).status).toBe(400)
    expect((await post('/handoff/status', 'not json', auth)).status).toBe(400)
    expect(
      (await post('/handoff/send', { channelId: randomId(), key: 'A'.repeat(1_025) }, auth)).body
        .code
    ).toBe('too_large')
    // An envelope is not a bearer request's body.
    const envelope = await accountEnvelope('handoff/status', s.key, { channelId: randomId() })
    expect((await post('/handoff/status', envelope, auth)).status).toBe(400)
  })

  it('counts handoff/open against the token’s account', async () => {
    const s = await session()
    for (let i = 0; i < 20; i++) {
      const ch = await newChannel()
      const opened = await post(
        '/handoff/open',
        { channelId: ch.channelId, verifier: ch.verifier },
        bearer(s.accessToken)
      )
      expect(opened.status).toBe(200)
    }
    const ch = await newChannel()
    // The same account through its envelope shares the quota.
    const refused = await post(
      '/handoff/open',
      await accountEnvelope('handoff/open', s.key, {
        channelId: ch.channelId,
        verifier: ch.verifier,
      })
    )
    expect(refused.status).toBe(429)
  })

  it('tells the phones apart on handoff/cancel', async () => {
    const owner = await session()
    const ch = await newChannel()
    await post(
      '/handoff/open',
      { channelId: ch.channelId, verifier: ch.verifier },
      bearer(owner.accessToken)
    )
    // The new phone may have a session of its own: claimToken still decides.
    const newPhone = await session()
    expect((await claim(ch, bearer(newPhone.accessToken))).status).toBe(200)
    const byToken = await post(
      '/handoff/cancel',
      { channelId: ch.channelId, claimToken: ch.claimToken },
      bearer(newPhone.accessToken)
    )
    expect(byToken).toMatchObject({ status: 200, body: { ok: true } })

    // The old phone cancels with its token and no claimToken.
    const second = await newChannel()
    await post(
      '/handoff/open',
      { channelId: second.channelId, verifier: second.verifier },
      bearer(owner.accessToken)
    )
    const stranger = await post(
      '/handoff/cancel',
      { channelId: second.channelId },
      bearer(newPhone.accessToken)
    )
    expect(stranger.status).toBe(403)
    const byOwner = await post(
      '/handoff/cancel',
      { channelId: second.channelId },
      bearer(owner.accessToken)
    )
    expect(byOwner.status).toBe(200)
    const status = await post(
      '/handoff/status',
      { channelId: second.channelId },
      bearer(owner.accessToken)
    )
    expect(status.body.status).toBe('cancelled')

    // Without either, it's neither phone's.
    expect((await post('/handoff/cancel', { channelId: second.channelId })).status).toBe(400)
  })

  it('refuses the old phone’s envelopes with 426 once the legacy switch is off', async () => {
    const s = await session()
    const ch = await newChannel()
    await legacyOff()
    for (const [op, fields] of [
      ['handoff/open', { channelId: ch.channelId, verifier: ch.verifier }],
      ['handoff/status', { channelId: ch.channelId }],
      ['handoff/send', { channelId: ch.channelId, key: blobOfSize(80) }],
      ['handoff/cancel', { channelId: ch.channelId }],
    ] as const) {
      const refused = await post(`/${op}`, await accountEnvelope(op, s.key, fields))
      expect(refused.status, op).toBe(426)
      expect(refused.body.code).toBe('upgrade_required')
    }
    // The new phone's claimToken ops are unchanged.
    await post('/handoff/open', { channelId: ch.channelId, verifier: ch.verifier }, bearer(s.accessToken))
    expect((await claim(ch)).status).toBe(200)
    expect(
      (await post('/handoff/cancel', { channelId: ch.channelId, claimToken: ch.claimToken })).status
    ).toBe(200)
  })
})

// --- Backup ------------------------------------------------------------------

const putBearer = async (
  s: TestSession,
  options: {
    slotId?: string
    bytes?: Uint8Array
    headers?: Record<string, string | null>
  } = {}
) => {
  const bytes = options.bytes ?? randomBytes(4_096)
  const headers: Record<string, string> = {
    ...bearer(s.accessToken),
    'content-type': 'application/octet-stream',
    'cf-connecting-ip': nextTestIp(),
    'x-ww-slot-id': options.slotId ?? randomId(),
    'x-ww-sha256': await sha256B64u(bytes),
    'content-length': String(bytes.byteLength),
  }
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    if (value == null) delete headers[name]
    else headers[name] = value
  }
  const response = await (app as { request: typeof fetch }).request(
    '/backup/put',
    { method: 'POST', headers, body: bytes, duplex: 'half' } as RequestInit,
    h.env as never
  )
  return { status: response.status, body: await response.json() }
}

describe('backup with a bearer token', () => {
  it('puts, lists, gets, and deletes (with the account key’s signature)', async () => {
    const s = await session()
    const slotId = randomId()
    const bytes = randomBytes(10_000)
    expect(await putBearer(s, { slotId, bytes })).toEqual({
      status: 200,
      body: { ok: true, uploadedAt: START, etag: expect.any(String) },
    })
    expect(h.backups.objects.get(`v1/${s.accountId}/${slotId}`)?.bytes).toEqual(bytes)

    const listed = await post('/backup/list', undefined, bearer(s.accessToken))
    expect(listed.body).toEqual({
      ok: true,
      slots: [
        {
          slotId,
          size: 10_000,
          uploadedAt: START,
          etag: h.backups.objects.get(`v1/${s.accountId}/${slotId}`)?.etag,
        },
      ],
    })

    const got = await (app as { request: typeof fetch }).request(
      '/backup/get',
      {
        method: 'POST',
        headers: { ...bearer(s.accessToken), 'content-type': 'application/json' },
        body: JSON.stringify({ slotId }),
      },
      h.env as never
    )
    expect(got.status).toBe(200)
    expect(got.headers.get('cache-control')).toBe('no-store')
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(bytes)

    const deleted = await post(
      '/backup/delete',
      await accountEnvelope('backup/delete', s.key, { slotId }),
      bearer(s.accessToken)
    )
    expect(deleted).toMatchObject({ status: 200, body: { ok: true } })
    expect(h.backups.objects.size).toBe(0)
  })

  it('needs the slot, digest, and length headers on put', async () => {
    const s = await session()
    const slotId = randomId()
    for (const headers of [
      { 'x-ww-slot-id': null },
      { 'x-ww-slot-id': 'short' },
      { 'x-ww-sha256': null },
      { 'x-ww-sha256': b64u(randomBytes(32)) },
    ]) {
      const refused = await putBearer(s, { slotId, headers })
      expect(refused.status, JSON.stringify(headers)).toBe(400)
      expect(refused.body.code).toBe('bad_request')
    }
    const huge = await putBearer(s, { headers: { 'content-length': String(21 * 1_024 * 1_024) } })
    expect(huge.status).toBe(413)
    expect(h.backups.objects.size).toBe(0)
  })

  it('keeps the same limits as the envelope form', async () => {
    const s = await session()
    const slotId = randomId()
    expect((await putBearer(s, { slotId })).status).toBe(200)
    const again = await putBearer(s, { slotId })
    expect(again.status).toBe(429)
    expect(again.body.code).toBe('rate_limited')
  })

  it('refuses a delete without the envelope, or signed by another account', async () => {
    const s = await session()
    const slotId = randomId()
    await putBearer(s, { slotId })

    const tokenOnly = await post('/backup/delete', { slotId }, bearer(s.accessToken))
    expect(tokenOnly.status).toBe(400)

    const other = await session()
    const mismatched = await post(
      '/backup/delete',
      await accountEnvelope('backup/delete', other.key, { slotId }),
      bearer(s.accessToken)
    )
    expect(mismatched.status).toBe(403)
    expect(mismatched.body.code).toBe('forbidden')

    const forged = await post(
      '/backup/delete',
      await accountEnvelope('backup/delete', s.key, { slotId }, other.key),
      bearer(s.accessToken)
    )
    expect(forged.status).toBe(401)
    expect(forged.body.code).toBe('bad_signature')

    const badToken = await post(
      '/backup/delete',
      await accountEnvelope('backup/delete', s.key, { slotId }),
      bearer('not.a.token')
    )
    expect(badToken.status).toBe(401)
    expect(badToken.body.code).toBe('unauthorized')
    expect(h.backups.objects.size).toBe(1)
  })

  it('refuses the envelope forms with 426 once the legacy switch is off', async () => {
    const s = await session()
    await legacyOff()
    const bytes = randomBytes(64)
    const envelope = await accountEnvelope('backup/put', s.key, {
      slotId: randomId(),
      size: bytes.byteLength,
      sha256: await sha256B64u(bytes),
    })
    const put = await (app as { request: typeof fetch }).request(
      '/backup/put',
      {
        method: 'POST',
        headers: {
          'x-ww-payload': envelope.payload,
          'x-ww-signature': envelope.signature,
          'content-length': String(bytes.byteLength),
        },
        body: bytes,
        duplex: 'half',
      } as RequestInit,
      h.env as never
    )
    expect(put.status).toBe(426)
    for (const op of ['backup/list', 'backup/get', 'backup/delete'] as const) {
      const refused = await post(`/${op}`, await accountEnvelope(op, s.key, { slotId: randomId() }))
      expect(refused.status, op).toBe(426)
    }
    // Bearer requests carry on, and delete's step-up still uses its envelope.
    expect((await putBearer(s)).status).toBe(200)
    expect(
      (
        await post(
          '/backup/delete',
          await accountEnvelope('backup/delete', s.key),
          bearer(s.accessToken)
        )
      ).status
    ).toBe(200)
  })
})
