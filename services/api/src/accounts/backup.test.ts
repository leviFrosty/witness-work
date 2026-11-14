import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SigningKey,
  b64u,
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
const MIB = 1_024 * 1_024
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
const freshIp = () => `198.18.${++ipCounter >> 8}.${ipCounter & 255}`

const envelope = async (
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

const post = async (path: string, body: unknown, ip = freshIp()) => {
  const response = await app.request(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
      body: JSON.stringify(body),
    },
    h.env
  )
  return response
}

const json = async (response: Response) => ({
  status: response.status,
  body: await response.json(),
})

const register = async () => {
  const key = await SigningKey.generate()
  const response = await json(
    await post('/account/register', await envelope('account/register', key))
  )
  expect(response.status).toBe(200)
  return { key, accountId: response.body.accountId as string }
}

interface PutOptions {
  slotId?: string
  bytes?: Uint8Array
  /** Overrides the signed fields. */
  fields?: Record<string, unknown>
  /** Overrides or removes request headers. */
  headers?: Record<string, string | null>
  body?: BodyInit
  signer?: SigningKey
  ip?: string
}

const put = async (key: SigningKey, options: PutOptions = {}) => {
  const bytes = options.bytes ?? randomBytes(4_096)
  const { payload, signature } = await envelope(
    'backup/put',
    key,
    {
      slotId: options.slotId ?? randomId(),
      size: bytes.byteLength,
      sha256: await sha256B64u(bytes),
      ...options.fields,
    },
    options.signer
  )
  const headers: Record<string, string> = {
    'content-type': 'application/octet-stream',
    'cf-connecting-ip': options.ip ?? freshIp(),
    'x-ww-payload': payload,
    'x-ww-signature': signature,
  }
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    if (value == null) delete headers[name]
    else headers[name] = value
  }
  return json(
    await app.request(
      '/backup/put',
      {
        method: 'POST',
        headers,
        body: options.body ?? bytes,
        // Node needs it for a streamed body.
        duplex: 'half',
      } as RequestInit,
      h.env
    )
  )
}

const list = async (key: SigningKey) =>
  json(await post('/backup/list', await envelope('backup/list', key)))

const get = async (key: SigningKey, slotId: string) =>
  post('/backup/get', await envelope('backup/get', key, { slotId }))

const remove = async (key: SigningKey, slotId?: string) =>
  json(
    await post(
      '/backup/delete',
      await envelope('backup/delete', key, slotId ? { slotId } : {})
    )
  )

describe('backup', () => {
  it('puts, lists, gets, and deletes a slot', async () => {
    const { key, accountId } = await register()
    const slotId = randomId()
    const bytes = randomBytes(10_000)
    const stored = await put(key, { slotId, bytes })
    const object = h.backups.objects.get(`v1/${accountId}/${slotId}`)
    expect(stored).toEqual({
      status: 200,
      body: { ok: true, uploadedAt: START, etag: object?.etag },
    })
    expect(object?.bytes).toEqual(bytes)
    expect(object?.customMetadata).toEqual({ uploadedAt: String(START) })

    expect(await list(key)).toEqual({
      status: 200,
      body: {
        ok: true,
        slots: [
          { slotId, size: 10_000, uploadedAt: START, etag: object?.etag },
        ],
      },
    })

    const got = await get(key, slotId)
    expect(got.status).toBe(200)
    expect(got.headers.get('content-type')).toBe('application/octet-stream')
    expect(got.headers.get('content-length')).toBe('10000')
    expect(got.headers.get('cache-control')).toBe('no-store')
    expect(got.headers.get('etag')).toBe(`"${object?.etag}"`)
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(bytes)

    expect(await remove(key, slotId)).toEqual({
      status: 200,
      body: { ok: true },
    })
    expect(h.backups.objects.size).toBe(0)
    expect(await json(await get(key, slotId))).toMatchObject({
      status: 404,
      body: { code: 'not_found' },
    })
    // Idempotent.
    expect((await remove(key, slotId)).status).toBe(200)
    expect((await list(key)).body.slots).toEqual([])
  })

  it('still accepts the short x-ww-p / x-ww-s headers older builds send', async () => {
    const { key } = await register()
    const bytes = randomBytes(1_000)
    const { payload, signature } = await envelope('backup/put', key, {
      slotId: randomId(),
      size: bytes.byteLength,
      sha256: await sha256B64u(bytes),
    })
    expect(
      await put(key, {
        bytes,
        headers: {
          'x-ww-payload': null,
          'x-ww-signature': null,
          'x-ww-p': payload,
          'x-ww-s': signature,
        },
      })
    ).toMatchObject({ status: 200, body: { ok: true } })
  })

  it('keeps each account to its own slots', async () => {
    const alice = await register()
    const bob = await register()
    const slotId = randomId()
    await put(alice.key, { slotId })
    await put(bob.key)
    expect((await list(bob.key)).body.slots).toHaveLength(1)
    expect((await json(await get(bob.key, slotId))).body.code).toBe(
      'not_found'
    )
    await remove(bob.key, slotId)
    expect(h.backups.objects.has(`v1/${alice.accountId}/${slotId}`)).toBe(
      true
    )
  })

  it('deletes every slot without a slotId', async () => {
    const alice = await register()
    const bob = await register()
    for (let i = 0; i < 3; i++) await put(alice.key)
    await put(bob.key)
    expect(await remove(alice.key)).toEqual({ status: 200, body: { ok: true } })
    expect((await list(alice.key)).body.slots).toEqual([])
    expect((await list(bob.key)).body.slots).toHaveLength(1)
  })

  it('replaces a slot after a minute, but not sooner', async () => {
    const { key } = await register()
    const slotId = randomId()
    await put(key, { slotId })
    vi.setSystemTime(START + 20_000)
    const early = await put(key, { slotId })
    expect(early).toMatchObject({
      status: 429,
      body: { code: 'rate_limited', retryAfter: 40 },
    })
    // Another slot isn't held up.
    expect((await put(key)).status).toBe(200)

    vi.setSystemTime(START + MINUTE)
    const bytes = randomBytes(123)
    expect(await put(key, { slotId, bytes })).toMatchObject({
      status: 200,
      body: { ok: true, uploadedAt: START + MINUTE },
    })
    const slots = (await list(key)).body.slots as { slotId: string }[]
    expect(slots.find((slot) => slot.slotId === slotId)).toMatchObject({
      slotId,
      size: 123,
      uploadedAt: START + MINUTE,
    })
  })

  describe('If-Match', () => {
    const slotEtag = async (key: SigningKey, slotId: string) =>
      (
        (await list(key)).body.slots as { slotId: string; etag: string }[]
      ).find((slot) => slot.slotId === slotId)!.etag

    const stored = (accountId: string, slotId: string) =>
      h.backups.objects.get(`v1/${accountId}/${slotId}`)

    it('replaces the slot when the etag matches, and returns the new one', async () => {
      const { key, accountId } = await register()
      const slotId = randomId()
      await put(key, { slotId })
      const etag = await slotEtag(key, slotId)
      vi.setSystemTime(START + MINUTE)
      const bytes = randomBytes(77)
      const resealed = await put(key, {
        slotId,
        bytes,
        headers: { 'if-match': `"${etag}"` },
      })
      expect(resealed.status).toBe(200)
      expect(resealed.body.etag).toBe(stored(accountId, slotId)?.etag)
      expect(resealed.body.etag).not.toBe(etag)
      expect(stored(accountId, slotId)?.bytes).toEqual(bytes)
    })

    it('refuses a stale etag with 412 precondition_failed and keeps the newer backup', async () => {
      const { key, accountId } = await register()
      const slotId = randomId()
      await put(key, { slotId })
      const stale = await slotEtag(key, slotId)
      vi.setSystemTime(START + MINUTE)
      const newer = randomBytes(55)
      await put(key, { slotId, bytes: newer })
      vi.setSystemTime(START + 2 * MINUTE)
      expect(
        await put(key, { slotId, headers: { 'if-match': `"${stale}"` } })
      ).toMatchObject({ status: 412, body: { code: 'precondition_failed' } })
      expect(stored(accountId, slotId)?.bytes).toEqual(newer)
    })

    it("refuses a slot that doesn't exist, and doesn't create it", async () => {
      const { key, accountId } = await register()
      const slotId = randomId()
      expect(
        await put(key, {
          slotId,
          headers: { 'if-match': `"${'a'.repeat(32)}"` },
        })
      ).toMatchObject({ status: 412, body: { code: 'precondition_failed' } })
      expect(stored(accountId, slotId)).toBeUndefined()
      expect(h.backups.calls.some((call) => call.startsWith('put '))).toBe(false)
    })

    it('does not re-create a slot deleted since it was read', async () => {
      const { key, accountId } = await register()
      const slotId = randomId()
      await put(key, { slotId })
      const etag = await slotEtag(key, slotId)
      await remove(key, slotId)
      vi.setSystemTime(START + MINUTE)
      expect(
        await put(key, { slotId, headers: { 'if-match': `"${etag}"` } })
      ).toMatchObject({ status: 412, body: { code: 'precondition_failed' } })
      expect(stored(accountId, slotId)).toBeUndefined()
    })

    it('refuses a write that lands between the check and the put (R2 onlyIf)', async () => {
      const { key, accountId } = await register()
      const slotId = randomId()
      await put(key, { slotId })
      const etag = await slotEtag(key, slotId)
      vi.setSystemTime(START + MINUTE)
      const racer = randomBytes(33)
      // Another device's put commits after this request listed the slot.
      const realList = h.backups.list.bind(h.backups)
      vi.spyOn(h.backups, 'list').mockImplementationOnce(async (options) => {
        const listed = await realList(options)
        h.backups.objects.set(`v1/${accountId}/${slotId}`, {
          ...stored(accountId, slotId)!,
          bytes: racer,
          etag: 'f'.repeat(32),
        })
        return listed
      })
      expect(
        await put(key, { slotId, headers: { 'if-match': `"${etag}"` } })
      ).toMatchObject({ status: 412, body: { code: 'precondition_failed' } })
      expect(stored(accountId, slotId)?.bytes).toEqual(racer)
    })

    it.each([
      ['a weak etag', (etag: string) => `W/"${etag}"`],
      ['an unquoted etag', (etag: string) => etag],
      ['*', () => '*'],
      ['an empty etag', () => '""'],
      ['a list of etags', (etag: string) => `"${etag}", "${etag}"`],
    ])('refuses %s as bad_request', async (_name, header) => {
      const { key, accountId } = await register()
      const slotId = randomId()
      const original = randomBytes(40)
      await put(key, { slotId, bytes: original })
      const etag = await slotEtag(key, slotId)
      vi.setSystemTime(START + MINUTE)
      expect(
        await put(key, { slotId, headers: { 'if-match': header(etag) } })
      ).toMatchObject({ status: 400, body: { code: 'bad_request' } })
      expect(stored(accountId, slotId)?.bytes).toEqual(original)
    })

    it('behaves as before without the header', async () => {
      const { key, accountId } = await register()
      const slotId = randomId()
      await put(key, { slotId })
      vi.setSystemTime(START + MINUTE)
      const bytes = randomBytes(21)
      expect((await put(key, { slotId, bytes })).status).toBe(200)
      expect(stored(accountId, slotId)?.bytes).toEqual(bytes)
      // A first put of a new slot needs no header either.
      expect((await put(key)).status).toBe(200)
    })

    it('keeps the one-put-a-minute limit', async () => {
      const { key } = await register()
      const slotId = randomId()
      await put(key, { slotId })
      const etag = await slotEtag(key, slotId)
      vi.setSystemTime(START + 10_000)
      expect(
        await put(key, { slotId, headers: { 'if-match': `"${etag}"` } })
      ).toMatchObject({ status: 429, body: { code: 'rate_limited' } })
    })

    it("doesn't let one account's etag match another's slot", async () => {
      const a = await register()
      const b = await register()
      const slotId = randomId()
      await put(a.key, { slotId })
      const etag = await slotEtag(a.key, slotId)
      expect(
        await put(b.key, { slotId, headers: { 'if-match': `"${etag}"` } })
      ).toMatchObject({ status: 412 })
    })
  })

  it('allows 8 slots an account', async () => {
    const { key } = await register()
    const slots = Array.from({ length: 8 }, randomId)
    for (const slotId of slots)
      expect((await put(key, { slotId })).status).toBe(200)
    expect(await put(key)).toMatchObject({
      status: 429,
      body: { code: 'limit' },
    })
    // An existing slot can still be replaced, and deleting one frees a spot.
    vi.setSystemTime(START + MINUTE)
    expect((await put(key, { slotId: slots[0] })).status).toBe(200)
    await remove(key, slots[1])
    expect((await put(key)).status).toBe(200)
  })

  it('refuses a body that differs from its signed size or sha256', async () => {
    const { key } = await register()
    const bytes = randomBytes(1_000)
    const bad = { status: 400, body: { code: 'bad_request' } }
    expect(
      await put(key, { bytes, fields: { sha256: await sha256B64u(randomBytes(1_000)) } })
    ).toMatchObject(bad)
    expect(await put(key, { bytes, fields: { size: 999 } })).toMatchObject(bad)
    expect(await put(key, { bytes, fields: { size: 1_001 } })).toMatchObject(bad)
    expect(
      await put(key, { bytes, headers: { 'content-length': '999' } })
    ).toMatchObject(bad)
    expect(h.backups.objects.size).toBe(0)
  })

  it('refuses anything over 20 MiB as too_large', async () => {
    const { key } = await register()
    const tooLarge = { status: 413, body: { code: 'too_large' } }
    // A declared Content-Length is refused before the body or signature is read.
    expect(
      await put(key, {
        headers: { 'content-length': String(20 * MIB + 1), 'x-ww-signature': 'nope' },
      })
    ).toMatchObject(tooLarge)
    // A signed size over the cap.
    expect(
      await put(key, { fields: { size: 20 * MIB + 1 } })
    ).toMatchObject(tooLarge)
    // A streamed body past the cap, without Content-Length.
    const big = new Uint8Array(20 * MIB + 1)
    const chunked = new ReadableStream({
      start(controller) {
        controller.enqueue(big)
        controller.close()
      },
    })
    expect(
      await put(key, {
        fields: { size: 20 * MIB },
        body: chunked,
        headers: { 'content-length': null },
      })
    ).toMatchObject(tooLarge)
    expect(h.backups.objects.size).toBe(0)
  })

  it('stores exactly 20 MiB', async () => {
    const { key } = await register()
    const full = new Uint8Array(20 * MIB)
    full.set(randomBytes(64))
    expect((await put(key, { bytes: full })).status).toBe(200)
  })

  it('needs a registered account and a valid signature', async () => {
    const stranger = await SigningKey.generate()
    expect(await put(stranger)).toMatchObject({
      status: 404,
      body: { code: 'unknown_account' },
    })
    expect(await list(stranger)).toMatchObject({
      status: 404,
      body: { code: 'unknown_account' },
    })
    const { key } = await register()
    expect(
      await put(key, { signer: await SigningKey.generate() })
    ).toMatchObject({ status: 401, body: { code: 'bad_signature' } })
    expect(await put(key, { headers: { 'x-ww-payload': null } })).toMatchObject({
      status: 400,
      body: { code: 'bad_request' },
    })
    // A list signature can't be replayed as a delete.
    const crossOp = await json(
      await post('/backup/delete', await envelope('backup/list', key))
    )
    expect(crossOp.body.code).toBe('bad_signature')
    const stale = await json(
      await post(
        '/backup/list',
        await envelope('backup/list', key, { ts: Date.now() - 10 * MINUTE })
      )
    )
    expect(stale).toMatchObject({ status: 401, body: { code: 'stale' } })
  })

  it('lets a suspended account back up', async () => {
    const { key, accountId } = await register()
    h.accountsDb!.db.prepare(
      "UPDATE accounts SET status = 'suspended' WHERE id = ?"
    ).run(accountId)
    expect((await put(key)).status).toBe(200)
    expect((await list(key)).body.slots).toHaveLength(1)
  })

  it('is off without the bucket or the accounts database', async () => {
    const { key } = await register()
    h = await createHarness({ backupBucket: false })
    const off = { status: 503, body: { code: 'disabled' } }
    expect(await put(key)).toMatchObject(off)
    expect(await list(key)).toMatchObject(off)
    expect(await remove(key)).toMatchObject(off)
    h = await createHarness({ accountsDb: false })
    expect(await put(key)).toMatchObject(off)
    expect(await json(await get(key, randomId()))).toMatchObject(off)
    expect(
      await put(key, { headers: { 'content-length': String(21 * MIB) } })
    ).toMatchObject(off)
  })

  it('counts put against the photo-upload edge tier', async () => {
    const { key } = await register()
    const ip = '203.0.113.20'
    for (let i = 0; i < 60; i++)
      expect((await put(key, { ip, bytes: randomBytes(8) })).status).not.toBe(
        500
      )
    expect(await put(key, { ip })).toMatchObject({
      status: 429,
      body: { code: 'rate_limited', retryAfter: 60 },
    })
  })

  it('logs nothing that names the account or a slot', async () => {
    const log = vi.spyOn(console, 'log')
    const warn = vi.spyOn(console, 'warn')
    const error = vi.spyOn(console, 'error')
    const { key, accountId } = await register()
    const slotId = randomId()
    await put(key, { slotId })
    h.backups.failNext('list')
    expect((await list(key)).status).toBe(500)
    const logged = JSON.stringify([
      log.mock.calls,
      warn.mock.calls,
      error.mock.calls,
    ])
    expect(logged).toContain('backup/list')
    for (const secret of [accountId, slotId, key.publicKey])
      expect(logged).not.toContain(secret)
  })
})
