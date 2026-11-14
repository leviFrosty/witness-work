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
import { type AccountsOp, accountSignedMessage } from './contracts'
import { createAccountsRoutes } from './route'

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

const START = Date.UTC(2026, 9, 12, 12)
const MINUTE = 60_000
const encoder = new TextEncoder()
const app = createAccountsRoutes()

let h: Harness

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  h = await createHarness()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

let ipCounter = 0
const post = async (path: string, body: unknown, ip?: string) => {
  const response = await app.request(
    path,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // A fresh caller per request unless a test is about the edge tier.
        'cf-connecting-ip': ip ?? `198.18.${++ipCounter >> 8}.${ipCounter & 255}`,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    h.env
  )
  return { status: response.status, body: await response.json() }
}

const signed = async (
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

const register = async () => {
  const key = await SigningKey.generate()
  const response = await post(
    '/account/register',
    await signed('account/register', key)
  )
  expect(response.status).toBe(200)
  return { key, accountId: response.body.accountId as string }
}

/** What the QR code gives the new phone, and the server's verifier. */
const newChannel = async () => {
  const token = randomBytes(16)
  return {
    channelId: randomId(),
    claimToken: b64u(token),
    verifier: await sha256B64u(token),
  }
}

type Channel = Awaited<ReturnType<typeof newChannel>>

const oldOp = async (
  op: 'handoff/open' | 'handoff/status' | 'handoff/send' | 'handoff/cancel',
  key: SigningKey,
  fields: Record<string, unknown>
) => post(`/${op}`, await signed(op, key, fields))

const open = (key: SigningKey, ch: Channel) =>
  oldOp('handoff/open', key, {
    channelId: ch.channelId,
    verifier: ch.verifier,
  })
const status = (key: SigningKey, ch: Channel) =>
  oldOp('handoff/status', key, { channelId: ch.channelId })
const send = (key: SigningKey, ch: Channel, sealedKey = blobOfSize(80)) =>
  oldOp('handoff/send', key, { channelId: ch.channelId, key: sealedKey })

const claimBody = async (ch: Channel) => ({
  channelId: ch.channelId,
  claimToken: ch.claimToken,
  claimPub: (await SigningKey.generate()).publicKey,
  hello: blobOfSize(200),
})
const claim = (body: Record<string, unknown>) => post('/handoff/claim', body)
const tokenOp = (
  op: 'receive' | 'done' | 'cancel',
  ch: Channel,
  claimToken = ch.claimToken
) => post(`/handoff/${op}`, { channelId: ch.channelId, claimToken })

describe('handoff', () => {
  it('walks open → claimed → sent → done, deleting the blobs at done', async () => {
    const { key } = await register()
    const ch = await newChannel()
    const expiresAt = START + 10 * MINUTE
    expect(await open(key, ch)).toEqual({
      status: 200,
      body: { ok: true, expiresAt },
    })
    expect((await status(key, ch)).body).toEqual({
      ok: true,
      status: 'open',
      expiresAt,
    })
    expect((await tokenOp('receive', ch)).body).toEqual({
      ok: true,
      status: 'open',
    })

    const body = await claimBody(ch)
    expect(await claim(body)).toEqual({
      status: 200,
      body: { ok: true, expiresAt },
    })
    expect((await status(key, ch)).body).toEqual({
      ok: true,
      status: 'claimed',
      expiresAt,
      claimPub: body.claimPub,
      hello: body.hello,
    })
    expect((await tokenOp('receive', ch)).body).toEqual({
      ok: true,
      status: 'claimed',
    })
    // Done before the key arrives is out of order.
    expect((await tokenOp('done', ch)).body.code).toBe('conflict')

    const sealedKey = blobOfSize(80)
    expect(await send(key, ch, sealedKey)).toEqual({
      status: 200,
      body: { ok: true },
    })
    expect((await status(key, ch)).body.status).toBe('sent')
    expect((await tokenOp('receive', ch)).body).toEqual({
      ok: true,
      status: 'sent',
      key: sealedKey,
    })
    // Only while claimed.
    expect((await send(key, ch)).body.code).toBe('conflict')

    expect(await tokenOp('done', ch)).toEqual({
      status: 200,
      body: { ok: true },
    })
    expect((await tokenOp('done', ch)).status).toBe(200)
    expect((await status(key, ch)).body).toEqual({
      ok: true,
      status: 'done',
      expiresAt,
    })
    expect((await tokenOp('receive', ch)).body).toEqual({
      ok: true,
      status: 'done',
    })
    const [row] = h.handoffs
      .storage(ch.channelId)
      .query('SELECT claim_pub, hello, key FROM channel')
    expect(row).toEqual({ claim_pub: null, hello: null, key: null })
    // Cancelling a finished handoff leaves it done.
    expect((await tokenOp('cancel', ch)).status).toBe(200)
    expect((await status(key, ch)).body.status).toBe('done')
  })

  it('lets either phone cancel, deleting every blob, idempotently', async () => {
    const { key } = await register()
    const byOld = await newChannel()
    await open(key, byOld)
    await claim(await claimBody(byOld))
    expect(
      await oldOp('handoff/cancel', key, { channelId: byOld.channelId })
    ).toEqual({ status: 200, body: { ok: true } })
    expect(
      (await oldOp('handoff/cancel', key, { channelId: byOld.channelId }))
        .status
    ).toBe(200)
    expect((await status(key, byOld)).body).toEqual({
      ok: true,
      status: 'cancelled',
      expiresAt: START + 10 * MINUTE,
    })
    expect((await tokenOp('receive', byOld)).body.status).toBe('cancelled')
    expect((await send(key, byOld)).body.code).toBe('conflict')

    const byNew = await newChannel()
    await open(key, byNew)
    await claim(await claimBody(byNew))
    await send(key, byNew)
    expect(await tokenOp('cancel', byNew)).toEqual({
      status: 200,
      body: { ok: true },
    })
    expect((await tokenOp('receive', byNew)).body).toEqual({
      ok: true,
      status: 'cancelled',
    })
    expect((await tokenOp('done', byNew)).body.code).toBe('conflict')
    const [row] = h.handoffs
      .storage(byNew.channelId)
      .query('SELECT claim_pub, hello, key FROM channel')
    expect(row).toEqual({ claim_pub: null, hello: null, key: null })
  })

  it('lets the first claim win and repeats it, but no other', async () => {
    const { key } = await register()
    const ch = await newChannel()
    await open(key, ch)
    const first = await claimBody(ch)
    expect((await claim(first)).status).toBe(200)
    // A lost response: the same body again.
    expect((await claim(first)).status).toBe(200)
    // Someone else with the same QR code, or the same phone re-sealing.
    expect(await claim(await claimBody(ch))).toMatchObject({
      status: 409,
      body: { code: 'conflict' },
    })
    expect(
      await claim({ ...first, hello: blobOfSize(200) })
    ).toMatchObject({ status: 409, body: { code: 'conflict' } })
    expect((await status(key, ch)).body.claimPub).toBe(first.claimPub)
    // The winner's repeat still works after the key is sent, not once cancelled.
    await send(key, ch)
    expect((await claim(first)).status).toBe(200)
    await tokenOp('cancel', ch)
    expect((await claim(first)).body.code).toBe('conflict')
  })

  it('burns the channel after five wrong claim tokens', async () => {
    const { key } = await register()
    const ch = await newChannel()
    await open(key, ch)
    const body = await claimBody(ch)
    for (let i = 0; i < 4; i++) {
      const wrong = await claim({ ...body, claimToken: randomId() })
      expect(wrong).toMatchObject({
        status: 401,
        body: { code: 'bad_signature' },
      })
    }
    expect((await status(key, ch)).body.status).toBe('open')
    // Wrong tokens count on every new-phone op.
    expect((await tokenOp('receive', ch, randomId())).status).toBe(401)
    expect((await status(key, ch)).body.status).toBe('cancelled')
    expect((await claim(body)).body.code).toBe('conflict')
  })

  it('burns a claimed channel too, dropping its blobs', async () => {
    const { key } = await register()
    const ch = await newChannel()
    await open(key, ch)
    await claim(await claimBody(ch))
    for (let i = 0; i < 5; i++)
      expect((await tokenOp('done', ch, randomId())).status).toBe(401)
    expect((await status(key, ch)).body).toEqual({
      ok: true,
      status: 'cancelled',
      expiresAt: START + 10 * MINUTE,
    })
  })

  it('refuses another account as the old phone', async () => {
    const owner = await register()
    const other = await register()
    const ch = await newChannel()
    await open(owner.key, ch)
    await claim(await claimBody(ch))
    const forbidden = { status: 403, body: { code: 'forbidden' } }
    expect(await status(other.key, ch)).toMatchObject(forbidden)
    expect(await send(other.key, ch)).toMatchObject(forbidden)
    expect(
      await oldOp('handoff/cancel', other.key, { channelId: ch.channelId })
    ).toMatchObject(forbidden)
    expect((await status(owner.key, ch)).body.status).toBe('claimed')
    // Opening an existing channel is a conflict, for anyone.
    expect((await open(other.key, ch)).body.code).toBe('conflict')
    expect((await open(owner.key, ch)).body.code).toBe('conflict')
  })

  it('needs a registered account and a valid signature for old-phone ops', async () => {
    const stranger = await SigningKey.generate()
    const ch = await newChannel()
    expect(await open(stranger, ch)).toMatchObject({
      status: 404,
      body: { code: 'unknown_account' },
    })
    const { key } = await register()
    const forged = await post(
      '/handoff/open',
      await signed(
        'handoff/open',
        key,
        { channelId: ch.channelId, verifier: ch.verifier },
        await SigningKey.generate()
      )
    )
    expect(forged).toMatchObject({ status: 401, body: { code: 'bad_signature' } })
    // A status signature can't open.
    const crossOp = await post('/handoff/open', {
      ...(await signed('handoff/status', key, {
        channelId: ch.channelId,
        verifier: ch.verifier,
      })),
    })
    expect(crossOp.body.code).toBe('bad_signature')
  })

  it('works for a suspended account', async () => {
    const { key, accountId } = await register()
    h.accountsDb!.db.prepare(
      "UPDATE accounts SET status = 'suspended' WHERE id = ?"
    ).run(accountId)
    expect((await open(key, await newChannel())).status).toBe(200)
  })

  it('answers not_found for unknown and expired channels, and the alarm deletes them', async () => {
    const { key } = await register()
    const unknown = await newChannel()
    expect((await status(key, unknown)).body.code).toBe('not_found')
    expect((await claim(await claimBody(unknown))).body.code).toBe('not_found')
    expect((await tokenOp('receive', unknown)).status).toBe(404)

    const ch = await newChannel()
    await open(key, ch)
    await claim(await claimBody(ch))
    const storage = h.handoffs.storage(ch.channelId)
    expect(storage.alarm()).toBe(START + 10 * MINUTE)

    vi.setSystemTime(START + 10 * MINUTE)
    expect((await status(key, ch)).body.code).toBe('not_found')
    expect((await tokenOp('receive', ch)).body.code).toBe('not_found')
    await h.handoffs.fireAlarm(ch.channelId)
    expect(storage.tables()).toEqual([])
    expect(storage.alarm()).toBeNull()

    // The channel id can be opened again once its old channel is gone.
    expect((await open(key, ch)).status).toBe(200)
  })

  it('reschedules an early alarm until expiry', async () => {
    const { key } = await register()
    const ch = await newChannel()
    await open(key, ch)
    vi.setSystemTime(START + 5 * MINUTE)
    await h.handoffs.fireAlarm(ch.channelId)
    const storage = h.handoffs.storage(ch.channelId)
    expect(storage.alarm()).toBe(START + 10 * MINUTE)
    expect(storage.tables()).toEqual(['channel'])
  })

  it('enforces the sealed blob caps', async () => {
    const { key } = await register()
    const ch = await newChannel()
    await open(key, ch)
    const body = await claimBody(ch)
    expect(
      await claim({ ...body, hello: 'A'.repeat(2_049) })
    ).toMatchObject({ status: 413, body: { code: 'too_large' } })
    expect((await claim({ ...body, hello: 'A'.repeat(2_048) })).status).toBe(
      200
    )
    expect(await send(key, ch, 'A'.repeat(1_025))).toMatchObject({
      status: 413,
      body: { code: 'too_large' },
    })
    expect((await send(key, ch, 'A'.repeat(1_024))).status).toBe(200)
  })

  it('refuses malformed requests', async () => {
    const { key } = await register()
    const ch = await newChannel()
    const bad = { status: 400, body: { code: 'bad_request' } }
    expect(
      await oldOp('handoff/open', key, { channelId: 'short', verifier: ch.verifier })
    ).toMatchObject(bad)
    expect(
      await oldOp('handoff/open', key, { channelId: ch.channelId })
    ).toMatchObject(bad)
    await open(key, ch)
    const body = await claimBody(ch)
    expect(await claim({ ...body, claimPub: 'nope' })).toMatchObject(bad)
    expect(await claim({ ...body, hello: '' })).toMatchObject(bad)
    expect(await claim({ ...body, hello: '***' })).toMatchObject(bad)
    expect(await post('/handoff/claim', '{not json')).toMatchObject(bad)
    expect(await post('/handoff/receive', { channelId: ch.channelId })).toMatchObject(bad)
    expect(await post('/handoff/cancel', { channelId: ch.channelId })).toMatchObject(bad)
    // Malformed tokens don't count toward burning the channel.
    expect((await status(key, ch)).body.status).toBe('open')
  })

  it('limits handoff/open to 20 per account a day', async () => {
    const { key } = await register()
    for (let i = 0; i < 20; i++)
      expect((await open(key, await newChannel())).status).toBe(200)
    const refused = await open(key, await newChannel())
    expect(refused).toMatchObject({
      status: 429,
      body: { code: 'rate_limited' },
    })
    expect(refused.body.retryAfter).toBeGreaterThan(0)
    // Another account has its own budget.
    const other = await register()
    expect((await open(other.key, await newChannel())).status).toBe(200)
    // A day later it refills.
    vi.setSystemTime(START + 24 * 60 * MINUTE)
    expect((await open(key, await newChannel())).status).toBe(200)
  })

  it('counts open against the register edge tier and the rest against read', async () => {
    const { key } = await register()
    const ip = '203.0.113.9'
    for (let i = 0; i < 60; i++) {
      const response = await post(
        '/handoff/open',
        await signed('handoff/open', key, {
          channelId: randomId(),
          verifier: (await newChannel()).verifier,
        }),
        ip
      )
      // The daily quota may refuse first; either way the edge counted it.
      expect([200, 429]).toContain(response.status)
    }
    const edge = await post(
      '/handoff/open',
      await signed('handoff/open', key, {
        channelId: randomId(),
        verifier: (await newChannel()).verifier,
      }),
      ip
    )
    expect(edge).toMatchObject({ status: 429, body: { code: 'rate_limited' } })
    expect(edge.body.retryAfter).toBe(60)
    // The read tier is separate and larger.
    const ch = await newChannel()
    expect(
      (await post('/handoff/receive', { channelId: ch.channelId, claimToken: ch.claimToken }, ip))
        .body.code
    ).toBe('not_found')
  })

  it('is off without the accounts database', async () => {
    h = await createHarness({ accountsDb: false })
    const ch = await newChannel()
    const off = { status: 503, body: { code: 'disabled' } }
    expect(await open(await SigningKey.generate(), ch)).toMatchObject(off)
    expect(await claim(await claimBody(ch))).toMatchObject(off)
    expect(await tokenOp('receive', ch)).toMatchObject(off)
  })

  it('logs nothing that names the channel, the token, or the account', async () => {
    const log = vi.spyOn(console, 'log')
    const warn = vi.spyOn(console, 'warn')
    const error = vi.spyOn(console, 'error')
    const { key, accountId } = await register()
    const ch = await newChannel()
    await open(key, ch)
    await claim(await claimBody(ch))
    await tokenOp('receive', ch, randomId())
    const logged = JSON.stringify([
      log.mock.calls,
      warn.mock.calls,
      error.mock.calls,
    ])
    for (const secret of [ch.channelId, ch.claimToken, accountId, key.publicKey])
      expect(logged).not.toContain(secret)
  })
})
