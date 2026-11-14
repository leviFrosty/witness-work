import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DAY_MS,
  Owner,
  SigningKey,
  Writer,
  b64u,
  blobOfSize,
  createHarness,
  envelope,
  inviteSecrets,
  liveHeaders,
  photoBlob,
  randomId,
  relayError,
  unsignedEnvelope,
  type ApiResponse,
  type Harness,
  type HarnessOptions,
  type PhotoBlob,
  TEST_WEB_ORIGIN,
} from '../test/buddies'
import { bearer, liveTicket, openTestSession, postJson, type TestSession } from '../test/accounts'
import { inboxLinkMessage } from '../accounts/contracts'
import { createAccountsRoutes } from '../accounts/route'
import { createAccountsAdminRoutes } from '../accounts/admin'
import { resetAccountStatusCache } from '../accounts/auth'
import { accessTokenKeys, signAccessToken } from '../accounts/tokens'
import {
  BUDDIES_CLIENT_HEADER,
  BUDDIES_LIVE_ACCOUNT_HEADER,
  BUDDIES_LIMITS,
  BUDDIES_OPS,
  type BuddiesSignedOp,
} from './contracts'
import { BuddyInbox } from './inboxDO'

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
 * The Buddies relay on account sessions (witness-work ADR 0027,
 * "Authentication (sessions)" in docs/buddies-protocol.md): bearer requests
 * for every op class, the legacy switch, and per-account limits. The legacy
 * (signed) behavior is covered by the other Buddies tests, which run with the
 * switch on.
 */

const START = Date.UTC(2026, 9, 16, 12)
const ADMIN_TOKEN = 'admin-secret-for-tests'
const IP = '203.0.113.7'
const encoder = new TextEncoder()
const accountsApp = createAccountsRoutes() as never
const adminApp = createAccountsAdminRoutes() as never

let h: Harness

const setUp = async (options: HarnessOptions = {}) => {
  h = await createHarness(options)
  h.env.ADMIN_API_TOKEN = ADMIN_TOKEN
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  resetAccountStatusCache()
  await setUp()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const session = () => openTestSession(accountsApp, h.env)
const legacyOff = () => h.kv.put('auth:legacy', 'off')
const encodeFields = (fields: Record<string, unknown>) =>
  b64u(encoder.encode(JSON.stringify(fields)))

const setStatus = async (accountId: string, status: string) => {
  const response = await adminApp.request(
    '/status',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ww-admin-token': ADMIN_TOKEN,
      },
      body: JSON.stringify({ accountId, status, reason: 'report' }),
    },
    h.env
  )
  expect(response.status).toBe(200)
  resetAccountStatusCache()
}

/** One person on a session: an account key, its token, and an inbox. */
class BearerOwner {
  readonly inboxId = randomId()

  private constructor(
    readonly session: TestSession,
    readonly key: SigningKey
  ) {}

  /** Opens a session and (unless `register` is false) registers a linked inbox. */
  static async create(register = true): Promise<BearerOwner> {
    const owner = new BearerOwner(await session(), await SigningKey.generate())
    if (register) {
      const response = await owner.register()
      if (response.status !== 200)
        throw new Error(`register failed: ${response.status}`)
    }
    return owner
  }

  get auth(): Record<string, string> {
    return bearer(this.session.accessToken)
  }

  /** The `account` proof linking this inbox to `account` (this one's by default). */
  async proof(account: TestSession = this.session) {
    const message = inboxLinkMessage(
      account.accountId,
      this.inboxId,
      this.key.publicKey
    )
    return {
      accountId: account.accountId,
      signature: b64u(await account.key.sign(message)),
    }
  }

  /** A bearer `inbox/register`: the token plus the self-signed envelope. */
  async register(
    fields: Record<string, unknown> = {},
    headers = this.auth
  ): Promise<ApiResponse> {
    const payload = {
      inboxId: this.inboxId,
      ownerPub: this.key.publicKey,
      account: await this.proof(),
      ts: Date.now(),
      nonce: randomId(),
      ...fields,
    }
    return h.post(
      '/inbox/register',
      await envelope('inbox/register', payload, this.key),
      headers
    )
  }

  /** A bearer owner op: plain JSON fields with this inbox's id. */
  op(
    op: BuddiesSignedOp,
    fields: Record<string, unknown> = {},
    headers = this.auth
  ): Promise<ApiResponse> {
    return h.post(`/${op}`, { inboxId: this.inboxId, ...fields }, headers)
  }

  sync(headers = this.auth): Promise<ApiResponse> {
    return this.op('inbox/sync', { since: 0 }, headers)
  }

  /** A bearer `inbox/live` upgrade: the fields in `x-buddies-payload`. */
  connect(headers = this.auth, fields: Record<string, unknown> = {}) {
    return h.live({
      upgrade: 'websocket',
      'x-buddies-payload': encodeFields({ inboxId: this.inboxId, ...fields }),
      ...headers,
    })
  }

  /** A bearer `blob/put`: the fields in `x-buddies-payload`, the bytes raw. */
  async putBlob(
    blob: PhotoBlob,
    headers = this.auth,
    fields: Record<string, unknown> = {}
  ): Promise<ApiResponse> {
    const response = await h.request('/blob/put', {
      method: 'POST',
      headers: {
        'cf-connecting-ip': IP,
        'content-type': 'application/octet-stream',
        'content-length': String(blob.bytes.byteLength),
        'x-buddies-payload': encodeFields({
          inboxId: this.inboxId,
          blobId: blob.blobId,
          bytes: blob.bytes.byteLength,
          expiresAt: Date.now() + 30 * DAY_MS,
          readTokenHash: blob.readTokenHash,
          ...fields,
        }),
        ...headers,
      },
      body: blob.bytes,
      ...({ duplex: 'half' } as object),
    })
    return { status: response.status, body: await response.json() }
  }

  /** Adds a slot for a buddy's writer key, by bearer request. */
  async addWriter(): Promise<Writer> {
    const key = await SigningKey.generate()
    const slotId = randomId()
    const response = await this.op('slot/add', {
      slotId,
      writerPub: key.publicKey,
    })
    expect(response.status).toBe(200)
    return new Writer(h, this.inboxId, slotId, key)
  }
}

/** A writer op: the writer-signed envelope, plus `headers` (a token). */
const writerSend = async (
  writer: Writer,
  op: BuddiesSignedOp,
  fields: Record<string, unknown>,
  headers: Record<string, string>,
  key = writer.key
) =>
  h.post(
    `/${op}`,
    await envelope(
      op,
      {
        inboxId: writer.inboxId,
        slotId: writer.slotId,
        ts: Date.now(),
        nonce: randomId(),
        ...fields,
      },
      key
    ),
    headers
  )

const getBlob = async (
  inboxId: string,
  blob: PhotoBlob,
  headers: Record<string, string>
) => {
  const response = await h.request('/blob/get', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': IP,
      ...headers,
    },
    body: JSON.stringify(
      unsignedEnvelope({ inboxId, blobId: blob.blobId, token: blob.token })
    ),
  })
  return response.status === 200
    ? { status: 200, bytes: new Uint8Array(await response.arrayBuffer()) }
    : { status: response.status, body: await response.json() }
}

const nonceRows = (inboxId: string) =>
  h.inboxes.storage(inboxId).query('SELECT COUNT(*) AS n FROM nonce')[0].n

describe('bearer owner ops', () => {
  it('registers with a proof for the token’s account, then runs every owner op as plain JSON', async () => {
    const owner = await BearerOwner.create(false)
    expect(await owner.register()).toEqual({
      status: 200,
      body: { ok: true, accountId: owner.session.accountId },
    })

    const synced = await owner.sync()
    expect(synced).toEqual({
      status: 200,
      body: {
        ok: true,
        seq: 0,
        slots: [],
        cards: [],
        events: [],
        roster: null,
        capabilities: { photos: true },
      },
    })

    const deviceId = randomId()
    expect(
      (
        await owner.op('device/register', {
          deviceId,
          apnsToken: 'ab'.repeat(32),
          apnsEnvironment: 'sandbox',
          templates: { 'plan.joined': { title: 'Plans', body: 'Joined' } },
        })
      ).body
    ).toEqual({ ok: true })
    expect(await owner.op('roster/put', { blob: blobOfSize(64) })).toEqual({
      status: 200,
      body: { ok: true, seq: 1 },
    })
    const slotId = randomId()
    const writer = await SigningKey.generate()
    expect(
      (await owner.op('slot/add', { slotId, writerPub: writer.publicKey }))
        .body
    ).toEqual({ ok: true })
    const invite = await inviteSecrets()
    expect(
      (
        await owner.op('invite/create', {
          inviteId: invite.inviteId,
          claimVerifier: invite.claimVerifier,
          blob: blobOfSize(100),
          expiresAt: Date.now() + DAY_MS,
        })
      ).status
    ).toBe(200)
    for (const [op, fields] of [
      ['invite/delete', { inviteId: invite.inviteId }],
      ['blob/delete', { blobIds: [b64u(new Uint8Array(32))] }],
      ['device/unregister', { deviceId }],
      ['slot/remove', { slotId }],
    ] as const) {
      expect(await owner.op(op, fields)).toEqual({
        status: 200,
        body: { ok: true },
      })
    }
    const after = await owner.sync()
    expect(after.body).toMatchObject({ seq: 1, slots: [] })

    expect((await owner.op('inbox/delete')).status).toBe(200)
    expect(await owner.sync()).toEqual({
      status: 404,
      body: relayError('not_found'),
    })
  })

  it('requires the proof on a bearer register, and for the token’s own account', async () => {
    const owner = await BearerOwner.create(false)
    const other = await session()
    const quotas = vi.spyOn(h.env.BUDDY_REGISTRATION_QUOTA, 'idFromName')

    expect(await owner.register({ account: undefined })).toEqual({
      status: 400,
      body: relayError('bad_request'),
    })
    expect(await owner.register({ account: await owner.proof(other) })).toEqual(
      { status: 403, body: relayError('forbidden') }
    )
    // Refused before the quota counts them.
    expect(quotas).not.toHaveBeenCalled()
    // The other account's own token with its own proof would be fine.
    expect(
      (
        await owner.register(
          { account: await owner.proof(other) },
          bearer(other.accessToken)
        )
      ).body
    ).toEqual({ ok: true, accountId: other.accountId })
  })

  it('refuses another account’s inbox with forbidden', async () => {
    const owner = await BearerOwner.create()
    const stranger = await session()
    const as = bearer(stranger.accessToken)

    expect(await owner.sync(as)).toEqual({
      status: 403,
      body: relayError('forbidden'),
    })
    expect(
      await owner.op('slot/add', { slotId: randomId(), writerPub: owner.key.publicKey }, as)
    ).toEqual({ status: 403, body: relayError('forbidden') })
    expect((await owner.op('inbox/delete', {}, as)).status).toBe(403)
    expect((await owner.op('slot/remove', { slotId: randomId() }, as)).status).toBe(403)
    expect((await owner.connect(as)).status).toBe(403)
    const blob = await photoBlob()
    await owner.addWriter()
    expect(await owner.putBlob(blob, as)).toEqual({
      status: 403,
      body: relayError('forbidden'),
    })
    // The owner is untouched.
    expect((await owner.sync()).status).toBe(200)
  })

  it('answers not_linked for an inbox registered before accounts, until it links', async () => {
    const legacy = await Owner.create(h)
    const owner = await BearerOwner.create(false)
    // Same inbox and owner key as the legacy registration.
    Object.assign(owner, { inboxId: legacy.inboxId, key: legacy.key })

    expect(await owner.sync()).toEqual({
      status: 409,
      body: relayError('not_linked'),
    })
    expect((await owner.connect()).status).toBe(409)
    expect(await owner.register()).toEqual({
      status: 200,
      body: { ok: true, accountId: owner.session.accountId },
    })
    expect((await owner.sync()).status).toBe(200)
    // The legacy envelope keeps working while the switch is on.
    expect((await legacy.sync()).status).toBe(200)
  })

  it('answers not_found for an unknown inbox', async () => {
    const owner = await BearerOwner.create(false)
    expect(await owner.sync()).toEqual({
      status: 404,
      body: relayError('not_found'),
    })
  })

  it('refuses a bad token without trying the envelope', async () => {
    const owner = await Owner.create(h)
    const signed = await envelope(
      'inbox/sync',
      { inboxId: owner.inboxId, since: 0, ts: Date.now(), nonce: randomId() },
      owner.key
    )
    for (const token of ['expired.or.forged', '']) {
      const response = await h.request('/inbox/sync', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'cf-connecting-ip': IP },
        body: JSON.stringify(signed),
      })
      expect(response.status).toBe(401)
      expect(response.headers.get('www-authenticate')).toBe(
        'Bearer error="invalid_token"'
      )
      expect(await response.json()).toEqual(relayError('unauthorized'))
    }
  })

  it('refuses an envelope as a bearer owner body', async () => {
    const owner = await BearerOwner.create()
    const signed = await envelope(
      'inbox/sync',
      { inboxId: owner.inboxId, since: 0, ts: Date.now(), nonce: randomId() },
      owner.key
    )
    expect(await h.post('/inbox/sync', signed, owner.auth)).toEqual({
      status: 400,
      body: relayError('bad_request'),
    })
    expect(
      await h.post('/inbox/sync', { ...signed, inboxId: owner.inboxId, since: 0 }, owner.auth)
    ).toEqual({ status: 400, body: relayError('bad_request') })
    expect(await h.post('/inbox/sync', '{not json', owner.auth)).toEqual({
      status: 400,
      body: relayError('bad_request'),
    })
  })

  it('takes no ts or nonce: repeats are no replay, and no nonce is stored', async () => {
    const owner = await BearerOwner.create()
    const before = nonceRows(owner.inboxId)
    const blob = blobOfSize(64)
    const fields = { blob, ts: Date.now() - DAY_MS, nonce: randomId() }
    expect(await owner.op('roster/put', fields)).toEqual({
      status: 200,
      body: { ok: true, seq: 1 },
    })
    expect(await owner.op('roster/put', fields)).toEqual({
      status: 200,
      body: { ok: true, seq: 2 },
    })
    expect(nonceRows(owner.inboxId)).toBe(before)
  })

  it('refuses a suspended account’s owner ops, but lets it leave', async () => {
    const owner = await BearerOwner.create()
    const slotId = randomId()
    expect(
      (await owner.op('slot/add', { slotId, writerPub: owner.key.publicKey }))
        .status
    ).toBe(200)
    await setStatus(owner.session.accountId, 'suspended')

    expect(await owner.sync()).toEqual({
      status: 403,
      body: relayError('suspended'),
    })
    expect((await owner.connect()).status).toBe(403)
    expect((await owner.op('slot/remove', { slotId })).status).toBe(200)
    expect((await owner.op('inbox/delete')).status).toBe(200)
  })

  it('keeps the kill switch: only leaving works while Buddies is off', async () => {
    const owner = await BearerOwner.create()
    await h.kv.put('buddies:enabled', 'false')
    expect(await owner.sync()).toEqual({
      status: 503,
      body: relayError('disabled'),
    })
    expect((await owner.connect()).status).toBe(503)
    expect((await owner.op('slot/remove', { slotId: randomId() })).status).toBe(
      200
    )
    expect((await owner.op('inbox/delete')).status).toBe(200)
  })

  it('answers disabled on a worker without sessions', async () => {
    const owner = await BearerOwner.create()
    delete h.env.ACCOUNT_TOKEN_SECRET
    expect(await owner.sync()).toEqual({
      status: 503,
      body: relayError('disabled'),
    })
  })
})

/** The inbox's `owner_account` row, straight from its storage. */
const ownerAccountRow = (inboxId: string) =>
  h.inboxes
    .storage(inboxId)
    .query(
      'SELECT account_id AS accountId, suspended, confirmed FROM owner_account'
    )

const lookupInbox = async (inboxId: string) => {
  const response = await adminApp.request(
    '/lookup',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ww-admin-token': ADMIN_TOKEN,
      },
      body: JSON.stringify({ inboxId }),
    },
    h.env
  )
  return { status: response.status, body: await response.json() }
}

/** Makes the accounts database refuse writes to `account_inboxes`. */
const failInboxLinks = () => {
  const db = h.accountsDb!
  const prepare = db.prepare.bind(db)
  return vi.spyOn(db, 'prepare').mockImplementation((query: string) => {
    if (/^insert into "account_inboxes"/i.test(query))
      throw new Error('D1 down')
    return prepare(query)
  })
}

describe('confirmed inbox links', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('keeps an inbox the accounts database never linked not_linked, until registering again links it', async () => {
    const owner = await BearerOwner.create(false)
    const failing = failInboxLinks()
    expect(await owner.register()).toEqual({
      status: 500,
      body: { ok: false, error: 'internal', code: 'internal' },
    })
    failing.mockRestore()

    // The inbox accepted the registration, but moderation can't find it, so
    // no token may act as its owner.
    expect(await lookupInbox(owner.inboxId)).toMatchObject({ status: 404 })
    expect(h.inboxes.storage(owner.inboxId).tables()).not.toContain(
      'owner_account'
    )
    expect(await owner.sync()).toEqual({
      status: 409,
      body: relayError('not_linked'),
    })
    expect((await owner.connect()).status).toBe(409)
    expect(await owner.putBlob(await photoBlob())).toEqual({
      status: 409,
      body: relayError('not_linked'),
    })

    // The app's relink is the same registration again.
    expect(await owner.register()).toEqual({
      status: 200,
      body: { ok: true, accountId: owner.session.accountId },
    })
    expect(await owner.register()).toEqual({
      status: 200,
      body: { ok: true, accountId: owner.session.accountId },
    })
    expect((await owner.sync()).status).toBe(200)

    // Moderation reaches it now.
    await setStatus(owner.session.accountId, 'suspended')
    expect(await owner.sync()).toEqual({
      status: 403,
      body: relayError('suspended'),
    })
  })

  it('leaves a link the inbox never confirmed to moderation and the next registration', async () => {
    const owner = await BearerOwner.create(false)
    const object = h.inboxes.object(owner.inboxId)
    vi.spyOn(object, 'confirmAccount').mockRejectedValueOnce(
      new Error('RPC reply lost')
    )
    expect((await owner.register()).status).toBe(500)
    // The accounts database holds the link; the inbox doesn't trust it yet.
    expect((await lookupInbox(owner.inboxId)).body.account.id).toBe(
      owner.session.accountId
    )
    expect(await owner.sync()).toEqual({
      status: 409,
      body: relayError('not_linked'),
    })

    // A suspension finds the inbox through the database and confirms it.
    await setStatus(owner.session.accountId, 'suspended')
    expect(ownerAccountRow(owner.inboxId)).toEqual([
      { accountId: owner.session.accountId, suspended: 1, confirmed: 1 },
    ])
    expect(await owner.sync()).toEqual({
      status: 403,
      body: relayError('suspended'),
    })
    expect(await owner.register()).toEqual({
      status: 403,
      body: relayError('suspended'),
    })
    expect((await owner.op('slot/remove', { slotId: randomId() })).status).toBe(
      200
    )
  })

  it('names the database’s winner when two accounts claim an inbox at once', async () => {
    // One person with the inbox's owner key and two accounts.
    const first = await BearerOwner.create(false)
    const second = await BearerOwner.create(false)
    Object.assign(second, { inboxId: first.inboxId, key: first.key })
    const object = h.inboxes.object(first.inboxId)
    const register = object.register.bind(object)
    let secondChecked!: () => void
    const bothChecked = new Promise<void>((resolve) => (secondChecked = resolve))
    let releaseSecond!: () => void
    const secondMayRegister = new Promise<void>(
      (resolve) => (releaseSecond = resolve)
    )
    // Both pass the database check before either links; the first finishes
    // before the second's registration reaches the inbox (the order that
    // used to leave the inbox naming the loser).
    vi.spyOn(object, 'register').mockImplementation(async (call, linked) => {
      if (call.account?.accountId === second.session.accountId) {
        secondChecked()
        await secondMayRegister
      } else {
        await bothChecked
      }
      return register(call, linked)
    })

    const firstReply = first.register()
    const secondReply = second.register()
    expect(await firstReply).toEqual({
      status: 200,
      body: { ok: true, accountId: first.session.accountId },
    })
    releaseSecond()
    expect(await secondReply).toEqual({
      status: 409,
      body: relayError('conflict'),
    })

    expect((await lookupInbox(first.inboxId)).body.account.id).toBe(
      first.session.accountId
    )
    expect(ownerAccountRow(first.inboxId)).toEqual([
      { accountId: first.session.accountId, suspended: 0, confirmed: 1 },
    ])
    expect((await first.sync()).status).toBe(200)
    expect(await second.sync()).toEqual({
      status: 403,
      body: relayError('forbidden'),
    })
  })

  it('carries a suspension that lands while the link is written', async () => {
    const owner = await BearerOwner.create(false)
    const object = h.inboxes.object(owner.inboxId)
    const register = object.register.bind(object)
    // Suspended after the registration's check, while no link exists for
    // the admin to find.
    vi.spyOn(object, 'register').mockImplementationOnce(async (call, linked) => {
      await setStatus(owner.session.accountId, 'suspended')
      return register(call, linked)
    })
    expect((await owner.register()).status).toBe(200)
    expect(ownerAccountRow(owner.inboxId)).toEqual([
      { accountId: owner.session.accountId, suspended: 1, confirmed: 1 },
    ])
    expect(await owner.sync()).toEqual({
      status: 403,
      body: relayError('suspended'),
    })
  })

  it('treats a link from before confirmation as none until the app links it again', async () => {
    const owner = await BearerOwner.create()
    const loser = await session()
    // A row as the inbox stored it before confirmation, naming an account
    // the accounts database doesn't link (a lost concurrent claim).
    const storage = h.inboxes.storage(owner.inboxId)
    storage.query('UPDATE owner_account SET account_id = ?', loser.accountId)
    storage.query('ALTER TABLE owner_account DROP COLUMN confirmed')
    h.inboxes.restart(owner.inboxId)

    expect(await owner.sync(bearer(loser.accessToken))).toEqual({
      status: 409,
      body: relayError('not_linked'),
    })
    expect(await owner.sync()).toEqual({
      status: 409,
      body: relayError('not_linked'),
    })
    expect(ownerAccountRow(owner.inboxId)).toEqual([
      { accountId: loser.accountId, suspended: 0, confirmed: 0 },
    ])

    expect(await owner.register()).toEqual({
      status: 200,
      body: { ok: true, accountId: owner.session.accountId },
    })
    expect(ownerAccountRow(owner.inboxId)).toEqual([
      { accountId: owner.session.accountId, suspended: 0, confirmed: 1 },
    ])
    expect((await owner.sync()).status).toBe(200)
    expect((await owner.sync(bearer(loser.accessToken))).status).toBe(403)
  })

  it('keeps an old row’s suspension while it waits to be confirmed', async () => {
    const owner = await BearerOwner.create()
    await setStatus(owner.session.accountId, 'suspended')
    const storage = h.inboxes.storage(owner.inboxId)
    storage.query('ALTER TABLE owner_account DROP COLUMN confirmed')
    h.inboxes.restart(owner.inboxId)
    const legacy = await Owner.create(h, false)
    Object.assign(legacy, { inboxId: owner.inboxId, key: owner.key })
    expect(await legacy.sync()).toMatchObject({
      status: 403,
      body: relayError('suspended'),
    })
  })
})

describe('bearer writer and capability ops', () => {
  it('takes the token plus the writer envelope, never comparing the token’s account', async () => {
    const owner = await BearerOwner.create()
    const buddy = await session()
    const writer = await owner.addWriter()

    const put = await writerSend(
      writer,
      'event/put',
      { eventId: randomId(), kind: 'plan.joined', blob: blobOfSize(48), push: false },
      bearer(buddy.accessToken)
    )
    expect(put).toEqual({ status: 200, body: { ok: true, seq: 1 } })
    // Any valid session works: the writer signature is the capability.
    expect(
      (await writerSend(writer, 'card/put', { blob: blobOfSize(64) }, owner.auth))
        .body
    ).toEqual({ ok: true, seq: 2 })
    const stranger = await SigningKey.generate()
    expect(
      await writerSend(
        writer,
        'card/put',
        { blob: blobOfSize(64) },
        bearer(buddy.accessToken),
        stranger
      )
    ).toEqual({ status: 401, body: relayError('bad_signature') })
    expect(
      await writerSend(writer, 'card/put', { blob: blobOfSize(64) }, bearer('forged'))
    ).toEqual({ status: 401, body: relayError('unauthorized') })

    const synced = await owner.sync()
    expect(synced.body.events).toHaveLength(1)
    expect(synced.body.cards).toHaveLength(1)
    // The inbox knows only its owner's account, never a writer's.
    const accounts = h.inboxes
      .storage(owner.inboxId)
      .query('SELECT account_id AS accountId FROM owner_account')
    expect(accounts).toEqual([{ accountId: owner.session.accountId }])

    expect(
      (await writerSend(writer, 'slot/leave', {}, bearer(buddy.accessToken)))
        .body
    ).toEqual({ ok: true })
    expect((await owner.sync()).body.slots).toEqual([])
  })

  it('fetches and claims invites with the token and today’s body', async () => {
    const owner = await BearerOwner.create()
    const buddy = await session()
    const as = bearer(buddy.accessToken)
    const invite = await inviteSecrets()
    await owner.op('invite/create', {
      inviteId: invite.inviteId,
      claimVerifier: invite.claimVerifier,
      blob: blobOfSize(100),
      expiresAt: Date.now() + DAY_MS,
    })

    const fetched = await h.post(
      '/invite/fetch',
      unsignedEnvelope({ inviteId: invite.inviteId }),
      as
    )
    expect(fetched.body).toMatchObject({ ok: true, status: 'open' })
    const claimed = await h.post(
      '/invite/claim',
      unsignedEnvelope({
        inviteId: invite.inviteId,
        claimSecret: invite.claimSecret,
        blob: blobOfSize(80),
      }),
      as
    )
    expect(claimed).toEqual({ status: 200, body: { ok: true } })
    expect((await owner.sync()).body.events).toMatchObject([
      { kind: 'invite.claimed', eventId: invite.inviteId },
    ])
  })

  it('refuses a suspended account’s writes and invite claims, but lets it read and leave', async () => {
    const owner = await BearerOwner.create()
    const buddy = await session()
    const as = bearer(buddy.accessToken)
    const writer = await owner.addWriter()
    const invite = await inviteSecrets()
    await owner.op('invite/create', {
      inviteId: invite.inviteId,
      claimVerifier: invite.claimVerifier,
      blob: blobOfSize(100),
      expiresAt: Date.now() + DAY_MS,
    })
    expect(
      (await writerSend(writer, 'card/put', { blob: blobOfSize(64) }, as)).body
    ).toEqual({ ok: true, seq: 1 })
    await setStatus(buddy.accountId, 'suspended')

    const refused = { status: 403, body: relayError('suspended') }
    expect(
      await writerSend(writer, 'card/put', { blob: blobOfSize(64) }, as)
    ).toEqual(refused)
    expect(
      await writerSend(
        writer,
        'event/put',
        { eventId: randomId(), kind: 'plan.invite', blob: blobOfSize(48) },
        as
      )
    ).toEqual(refused)
    const claim = unsignedEnvelope({
      inviteId: invite.inviteId,
      claimSecret: invite.claimSecret,
      blob: blobOfSize(80),
    })
    expect(await h.post('/invite/claim', claim, as)).toEqual(refused)
    // Reading reaches nobody.
    expect(
      (
        await h.post(
          '/invite/fetch',
          unsignedEnvelope({ inviteId: invite.inviteId }),
          as
        )
      ).body
    ).toMatchObject({ ok: true, status: 'open' })

    let synced = await owner.sync()
    expect(synced.body.cards).toHaveLength(1)
    expect(synced.body.events).toEqual([])
    // The inbox still knows only its owner's account.
    expect(
      h.inboxes
        .storage(owner.inboxId)
        .query('SELECT account_id AS accountId FROM owner_account')
    ).toEqual([{ accountId: owner.session.accountId }])

    await setStatus(buddy.accountId, 'active')
    expect(
      (await writerSend(writer, 'card/put', { blob: blobOfSize(64) }, as)).body
    ).toEqual({ ok: true, seq: 2 })
    expect((await h.post('/invite/claim', claim, as)).status).toBe(200)

    await setStatus(buddy.accountId, 'suspended')
    expect((await writerSend(writer, 'slot/leave', {}, as)).body).toEqual({
      ok: true,
    })
    synced = await owner.sync()
    expect(synced.body.slots).toEqual([])
  })

  it('applies a suspension at once in the isolate that made it', async () => {
    const owner = await BearerOwner.create()
    const buddy = await session()
    const as = bearer(buddy.accessToken)
    const writer = await owner.addWriter()
    expect(
      (await writerSend(writer, 'card/put', { blob: blobOfSize(64) }, as)).status
    ).toBe(200)
    // The admin route, without the test helper's cache reset.
    const response = await adminApp.request(
      '/status',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ww-admin-token': ADMIN_TOKEN,
        },
        body: JSON.stringify({
          accountId: buddy.accountId,
          status: 'suspended',
          reason: 'report',
        }),
      },
      h.env
    )
    expect(response.status).toBe(200)
    expect(
      await writerSend(writer, 'card/put', { blob: blobOfSize(64) }, as)
    ).toEqual({ status: 403, body: relayError('suspended') })
  })

  it('can’t refuse a legacy writer op: it names no account', async () => {
    const owner = await BearerOwner.create()
    const buddy = await session()
    const writer = await owner.addWriter()
    await setStatus(buddy.accountId, 'suspended')
    expect(
      (await writerSend(writer, 'card/put', { blob: blobOfSize(64) }, {})).body
    ).toEqual({ ok: true, seq: 1 })
  })

  it('puts photo blobs by token and reads them with the read token', async () => {
    const owner = await BearerOwner.create()
    const blob = await photoBlob()
    expect(await owner.putBlob(blob)).toEqual({
      status: 403,
      body: relayError('no_buddies'),
    })
    await owner.addWriter()
    const put = await owner.putBlob(blob)
    expect(put).toEqual({
      status: 200,
      body: { ok: true, expiresAt: expect.any(Number) },
    })
    // A repeat is idempotent, not a replay.
    expect((await owner.putBlob(blob)).status).toBe(200)

    const buddy = await session()
    const read = await getBlob(owner.inboxId, blob, bearer(buddy.accessToken))
    expect(read).toEqual({ status: 200, bytes: blob.bytes })
    expect(
      await getBlob(owner.inboxId, { ...blob, token: b64u(new Uint8Array(32)) }, bearer(buddy.accessToken))
    ).toMatchObject({ status: 404, body: relayError('not_found') })

    expect(
      (await owner.op('blob/delete', { blobIds: [blob.blobId] })).status
    ).toBe(200)
    expect((await getBlob(owner.inboxId, blob, owner.auth)).status).toBe(404)
  })

  it('refuses a signature header, a short payload header, and a wrong body on a bearer blob/put', async () => {
    const owner = await BearerOwner.create()
    await owner.addWriter()
    const blob = await photoBlob()
    expect(
      await owner.putBlob(blob, { ...owner.auth, 'x-buddies-signature': 'x' })
    ).toEqual({ status: 400, body: relayError('bad_request') })
    expect(
      await owner.putBlob(blob, { ...owner.auth, 'x-buddies-s': 'x' })
    ).toEqual({ status: 400, body: relayError('bad_request') })
    expect(
      await owner.putBlob(blob, {
        ...owner.auth,
        'x-buddies-payload': '',
        'x-buddies-p': encodeFields({ inboxId: owner.inboxId }),
      })
    ).toEqual({ status: 400, body: relayError('bad_request') })
    const other = await photoBlob()
    expect(
      await owner.putBlob(blob, owner.auth, { blobId: other.blobId })
    ).toEqual({ status: 400, body: relayError('bad_request') })
  })
})

describe('bearer live socket', () => {
  it('says hello, signals changes, and closes with 4003 on suspension', async () => {
    const owner = await BearerOwner.create()
    const live = await owner.connect()
    expect(live.status).toBe(101)
    expect(live.socket!.messages()).toEqual([{ type: 'hello', seq: 0 }])
    await owner.op('roster/put', { blob: blobOfSize(32) })
    expect(live.socket!.messages()).toEqual([
      { type: 'hello', seq: 0 },
      { type: 'changed', seq: 1 },
    ])
    await setStatus(owner.session.accountId, 'suspended')
    expect(live.socket!.closedBy).toEqual({ code: 4003, reason: 'suspended' })
  })

  it('refuses a web token, where nothing would close the socket', async () => {
    const owner = await BearerOwner.create()
    const keys = (await accessTokenKeys(h.env as never))!
    const { accessToken } = await signAccessToken(keys, {
      accountId: owner.session.accountId,
      sessionId: owner.session.sessionId,
      platform: 'web',
    })
    const live = await owner.connect(bearer(accessToken))
    expect(live.status).toBe(403)
  })

  it('refuses a signature header, and ignores an account header from the client', async () => {
    const owner = await BearerOwner.create()
    expect(
      (await owner.connect({ ...owner.auth, 'x-buddies-signature': 'x' }))
        .status
    ).toBe(400)

    // A legacy upgrade can't claim an account through the internal header.
    const legacy = await Owner.create(h)
    const forged = await liveHeaders(
      { inboxId: owner.inboxId, ts: Date.now(), nonce: randomId() },
      legacy.key
    )
    const refused = await h.live({
      ...forged,
      [BUDDIES_LIVE_ACCOUNT_HEADER]: owner.session.accountId,
    })
    expect(refused).toMatchObject({
      status: 401,
      body: relayError('bad_signature'),
    })
    const unsigned = await h.live({
      upgrade: 'websocket',
      'x-buddies-payload': encodeFields({ inboxId: owner.inboxId }),
      [BUDDIES_LIVE_ACCOUNT_HEADER]: owner.session.accountId,
    })
    expect(unsigned.status).toBe(400)
    expect(unsigned.socket).toBeNull()
  })

  it('takes the bearer upgrade only as a WebSocket', async () => {
    const owner = await BearerOwner.create()
    const response = await h.live(
      {
        'x-buddies-payload': encodeFields({ inboxId: owner.inboxId }),
        ...owner.auth,
      },
      'GET'
    )
    expect(response).toMatchObject({
      status: 426,
      body: relayError('upgrade_required'),
    })
  })
})

/**
 * The browser's live socket (witness-work ADR 0038 §10): a ticket naming the
 * inbox rides in the `Sec-WebSocket-Protocol` offer, next to `ww.v1`, from
 * an allowed origin. Never the access token: Cloudflare's logs record that
 * header.
 */
describe('browser live socket', () => {
  const MINUTE_MS = 60_000
  const advance = (ms: number) => vi.setSystemTime(Date.now() + ms)

  const ticket = (
    session: TestSession,
    inboxId: string,
    socket: 'sync' | 'buddies' = 'buddies'
  ) => liveTicket(accountsApp, h.env, session, socket, inboxId)

  const offer = async (owner: BearerOwner, session = owner.session) => [
    'ww.v1',
    `ticket.${await ticket(session, owner.inboxId)}`,
  ]

  const browserLive = (
    protocols: string[] | string,
    headers: Record<string, string> = {}
  ) =>
    h.live({
      upgrade: 'websocket',
      origin: TEST_WEB_ORIGIN,
      'sec-websocket-protocol': Array.isArray(protocols)
        ? protocols.join(', ')
        : protocols,
      ...headers,
    })

  /** The requests `BuddyInbox` got through `fetch`. */
  const forwarded = () => {
    const seen: Request[] = []
    const original = BuddyInbox.prototype.fetch
    vi.spyOn(BuddyInbox.prototype, 'fetch').mockImplementation(function (
      this: BuddyInbox,
      request: Request
    ) {
      seen.push(request)
      return original.call(this, request)
    })
    return seen
  }

  it('mints a 30-second ticket for the inbox', async () => {
    const owner = await BearerOwner.create()
    const response = await postJson(
      accountsApp,
      h.env,
      '/live/ticket',
      { socket: 'buddies', id: owner.inboxId },
      owner.auth
    )
    expect(response).toMatchObject({
      status: 200,
      body: { ok: true, expiresAt: Math.floor(Date.now() / 1_000) * 1_000 + 30_000 },
    })
  })

  it('opens with ww.v1 echoed, says hello, and signals changes', async () => {
    const owner = await BearerOwner.create()
    const live = await browserLive(await offer(owner))
    expect(live.status).toBe(101)
    expect(live.protocol).toBe('ww.v1')
    expect(live.socket!.messages()).toEqual([{ type: 'hello', seq: 0 }])
    await owner.op('roster/put', { blob: blobOfSize(32) })
    expect(live.socket!.messages().at(-1)).toEqual({ type: 'changed', seq: 1 })
  })

  it('works with the legacy switch off: it is always a bearer request', async () => {
    const owner = await BearerOwner.create()
    await legacyOff()
    expect((await browserLive(await offer(owner))).status).toBe(101)
  })

  it('never forwards the ticket or the offer to the DO', async () => {
    const seen = forwarded()
    const owner = await BearerOwner.create()
    const minted = await ticket(owner.session, owner.inboxId)
    expect((await browserLive(['ww.v1', `ticket.${minted}`])).status).toBe(101)
    expect(seen).toHaveLength(1)
    const headers = Object.fromEntries(seen[0].headers.entries())
    expect(headers['sec-websocket-protocol']).toBeUndefined()
    expect(headers.authorization).toBeUndefined()
    expect(JSON.stringify(headers)).not.toContain(minted)
    expect(headers[BUDDIES_LIVE_ACCOUNT_HEADER]).toBe(owner.session.accountId)
    expect(headers['x-buddies-payload']).toBe(encodeFields({ inboxId: owner.inboxId }))
    expect(headers['x-buddies-session-expires-at']).toBe(
      String(owner.session.accessExpiresAt)
    )
    expect(headers['x-ww-live-ticket']).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(seen[0].url).not.toContain(owner.inboxId)
  })

  it('takes the inbox from the ticket, never a client payload header', async () => {
    const seen = forwarded()
    const owner = await BearerOwner.create()
    const other = await BearerOwner.create()
    const live = await browserLive(await offer(owner), {
      'x-buddies-payload': encodeFields({ inboxId: other.inboxId }),
    })
    expect(live.status).toBe(101)
    expect(seen[0].headers.get('x-buddies-payload')).toBe(
      encodeFields({ inboxId: owner.inboxId })
    )
  })

  it('needs ww.v1 and an allowed Origin, checked before the ticket and the DO', async () => {
    const seen = forwarded()
    const owner = await BearerOwner.create()
    expect(await browserLive((await offer(owner)).slice(1))).toMatchObject({
      status: 400,
      body: relayError('bad_request'),
      protocol: null,
    })
    for (const origin of ['https://evil.example', 'null']) {
      expect(await browserLive(await offer(owner), { origin })).toMatchObject({
        status: 403,
        body: relayError('forbidden'),
      })
      expect(await browserLive(['ww.v1', 'ticket.nope'], { origin })).toMatchObject({
        status: 403,
        body: relayError('forbidden'),
      })
    }
    const noOrigin = await h.live({
      upgrade: 'websocket',
      'sec-websocket-protocol': (await offer(owner)).join(', '),
    })
    expect(noOrigin).toMatchObject({ status: 403, body: relayError('forbidden') })
    expect(seen).toHaveLength(0)
  })

  it('refuses a missing, forged, expired, or Cloud Sync ticket with 401', async () => {
    const owner = await BearerOwner.create()
    const [, entry] = await offer(owner)
    for (const protocols of [
      ['ww.v1'],
      ['ww.v1', 'ticket.not.a.ticket'],
      ['ww.v1', `ticket.${owner.session.accessToken}`],
      ['ww.v1', `${entry.slice(0, -2)}${entry.endsWith('AA') ? 'BB' : 'AA'}`],
      // A Cloud Sync ticket whose slot id happens to look like an inbox id.
      ['ww.v1', `ticket.${await ticket(owner.session, owner.inboxId, 'sync')}`],
    ]) {
      expect(await browserLive(protocols), protocols[1]?.slice(0, 30)).toMatchObject({
        status: 401,
        body: relayError('unauthorized'),
      })
    }
    const later = await offer(owner)
    advance(31_000)
    expect(await browserLive(later)).toMatchObject({
      status: 401,
      body: relayError('unauthorized'),
    })
  })

  it('refuses malformed offers with bad_request', async () => {
    const owner = await BearerOwner.create()
    const [ww, entry] = await offer(owner)
    for (const protocols of [
      [ww, ww, entry],
      [ww, entry, entry],
      [ww, '', entry],
      [ww, entry, 'chat'],
      [ww, 'ticket.'],
      [ww, entry, `payload.${encodeFields({ inboxId: owner.inboxId })}`],
      [ww, `bearer.${owner.session.accessToken}`],
      [ww, entry, `slot.${randomId()}`],
      [ww, entry, `x${'A'.repeat(5_000)}`],
    ]) {
      expect(
        await browserLive(protocols),
        protocols.join(', ').slice(0, 80)
      ).toMatchObject({ status: 400, body: relayError('bad_request') })
    }
    expect(
      await browserLive([ww, entry], { 'x-buddies-signature': 'x' })
    ).toMatchObject({ status: 400, body: relayError('bad_request') })
    expect(await browserLive([ww, entry], owner.auth)).toMatchObject({
      status: 400,
      body: relayError('bad_request'),
    })
  })

  it('runs the header path’s checks: kill switch, ownership, link, suspension', async () => {
    const owner = await BearerOwner.create()
    const other = await BearerOwner.create()
    // Another account's inbox: the ticket mints, the inbox refuses.
    expect(await browserLive(await offer(owner, other.session))).toMatchObject({
      status: 403,
      body: relayError('forbidden'),
    })

    const unlinked = await BearerOwner.create(false)
    expect(await browserLive(await offer(unlinked))).toMatchObject({
      status: 404,
      body: relayError('not_found'),
    })
    const legacy = await Owner.create(h)
    const legacyInbox = [
      'ww.v1',
      `ticket.${await ticket(owner.session, legacy.inboxId)}`,
    ]
    expect(await browserLive(legacyInbox)).toMatchObject({
      status: 409,
      body: relayError('not_linked'),
    })

    await setStatus(owner.session.accountId, 'suspended')
    expect(await browserLive(await offer(owner))).toMatchObject({
      status: 403,
      body: relayError('suspended'),
    })
    await setStatus(owner.session.accountId, 'active')

    await h.kv.put('buddies:enabled', 'false')
    expect(await browserLive(await offer(owner))).toMatchObject({
      status: 503,
      body: relayError('disabled'),
    })
  })

  it('mints only for a live session; a ticket minted before still opens', async () => {
    const owner = await BearerOwner.create()
    const entries = await offer(owner)
    const response = await accountsApp.request(
      '/sessions/current',
      { method: 'DELETE', headers: owner.auth },
      h.env
    )
    expect(response.status).toBe(200)
    expect(
      await postJson(
        accountsApp,
        h.env,
        '/live/ticket',
        { socket: 'buddies', id: owner.inboxId },
        owner.auth
      )
    ).toMatchObject({ status: 401, body: relayError('unauthorized') })
    // The upgrade checks no session, as the header path doesn't.
    expect((await browserLive(entries)).status).toBe(101)
    expect((await owner.connect()).status).toBe(101)
  })

  it('opens one socket per ticket: a copy is 409 while it is open', async () => {
    const owner = await BearerOwner.create()
    const entries = await offer(owner)
    const first = await browserLive(entries)
    expect(first.status).toBe(101)
    const second = await browserLive(await offer(owner))
    expect(second.status).toBe(101)
    // A replayed copy pushes no socket off: it never opens.
    for (let i = 0; i < 15; i++)
      expect(await browserLive(entries)).toMatchObject({
        status: 409,
        body: relayError('conflict'),
      })
    expect(first.socket!.closedBy).toBeNull()
    expect(second.socket!.closedBy).toBeNull()
    first.socket!.close(1000, '')
    expect((await browserLive(entries)).status).toBe(101)
  })

  it('needs an upgrade like the header path', async () => {
    const owner = await BearerOwner.create()
    const notUpgrade = {
      origin: TEST_WEB_ORIGIN,
      'sec-websocket-protocol': (await offer(owner)).join(', '),
    }
    expect(await h.live(notUpgrade)).toMatchObject({
      status: 426,
      body: relayError('upgrade_required'),
    })
  })

  it('leaves header-path sockets as they were: no subprotocol, no expiry', async () => {
    const seen = forwarded()
    const owner = await BearerOwner.create()
    const live = await owner.connect({
      ...owner.auth,
      'x-buddies-session-expires-at': String(Date.now() + MINUTE_MS),
      'x-ww-live-ticket': 'A'.repeat(43),
    })
    expect(live.status).toBe(101)
    expect(live.protocol).toBeNull()
    expect(seen[0].headers.get('x-buddies-session-expires-at')).toBeNull()
    expect(seen[0].headers.get('x-ww-live-ticket')).toBeNull()
    const legacy = await Owner.create(h)
    const signed = await legacy.connect()
    expect(signed.status).toBe(101)
    expect(signed.protocol).toBeNull()
    // The inbox's own deadline (180 days of inactivity), not a token's.
    expect(h.inboxes.storage(owner.inboxId).alarm()).toBeGreaterThan(
      Date.now() + DAY_MS
    )
  })

  it('closes with 4004 expired once the token expires; header sockets stay', async () => {
    const owner = await BearerOwner.create()
    const storage = h.inboxes.storage(owner.inboxId)
    const inactivity = storage.alarm()!
    expect(inactivity).toBeGreaterThan(Date.now() + DAY_MS)

    const browser = await browserLive(await offer(owner))
    const native = await owner.connect()
    expect(storage.alarm()).toBe(owner.session.accessExpiresAt)

    advance(owner.session.accessExpiresAt - Date.now())
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(browser.socket!.closedBy).toEqual({ code: 4004, reason: 'expired' })
    expect(native.socket!.closedBy).toBeNull()
    // The inbox's own duties keep their deadline, and the inbox its data.
    expect(storage.alarm()).toBe(inactivity)
    expect(storage.query('SELECT inbox_id FROM meta')).toHaveLength(1)
  })

  it('runs no retention duty early when woken only for a socket’s expiry', async () => {
    const owner = await BearerOwner.create()
    const storage = h.inboxes.storage(owner.inboxId)
    // An R2 delete that failed and backs off for six hours.
    const retryAt = Date.now() + 6 * 60 * MINUTE_MS
    storage.query(
      'INSERT INTO pending_blob_delete (object_key) VALUES (?)',
      'v1/x/y'
    )
    storage.query(
      'INSERT OR REPLACE INTO blob_delete_backoff (singleton, failures, retry_at) VALUES (1, 9, ?)',
      retryAt
    )
    const browser = await browserLive(await offer(owner))
    expect(storage.alarm()).toBe(owner.session.accessExpiresAt)
    const deletes = () =>
      h.r2.calls.filter((call) => call.startsWith('delete')).length
    const before = deletes()

    advance(owner.session.accessExpiresAt - Date.now())
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(browser.socket!.closedBy).toEqual({ code: 4004, reason: 'expired' })
    expect(deletes()).toBe(before)
    expect(storage.query('SELECT object_key AS key FROM pending_blob_delete')).toEqual([
      { key: 'v1/x/y' },
    ])
    expect(storage.alarm()).toBe(retryAt)
  })

  it('schedules the earliest of the inbox’s deadlines and the sockets’ expiries', async () => {
    const owner = await BearerOwner.create()
    const storage = h.inboxes.storage(owner.inboxId)
    const first = await browserLive(await offer(owner))
    advance(5 * MINUTE_MS)
    const later = await openTestSession(accountsApp, h.env, owner.session.key)
    const second = await browserLive(await offer(owner, later))
    expect(storage.alarm()).toBe(owner.session.accessExpiresAt)

    advance(owner.session.accessExpiresAt - Date.now())
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(first.socket!.closedBy).toEqual({ code: 4004, reason: 'expired' })
    expect(second.socket!.closedBy).toBeNull()
    expect(storage.alarm()).toBe(later.accessExpiresAt)

    advance(later.accessExpiresAt - Date.now())
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(second.socket!.closedBy).toEqual({ code: 4004, reason: 'expired' })
  })

  it('counts browser sockets in the inbox’s socket cap', async () => {
    const owner = await BearerOwner.create()
    const browser = await browserLive(await offer(owner))
    expect(browser.status).toBe(101)
    advance(1)
    for (let i = 0; i < BUDDIES_LIMITS.liveSockets; i++) {
      expect((await owner.connect()).status).toBe(101)
      advance(1)
    }
    expect(browser.socket!.closedBy).toEqual({ code: 4002, reason: 'replaced' })
  })

  it('never logs the token or the inbox id', async () => {
    const logs: unknown[] = []
    for (const level of ['log', 'warn', 'error', 'info'] as const)
      vi.spyOn(console, level).mockImplementation((...args) => logs.push(args))
    const owner = await BearerOwner.create()
    const entries = await offer(owner)
    await browserLive(entries)
    await browserLive(entries, { origin: 'https://evil.example' })
    advance(owner.session.accessExpiresAt - Date.now())
    await h.inboxes.fireAlarm(owner.inboxId)
    const text = JSON.stringify(logs)
    for (const secret of [
      owner.inboxId,
      owner.session.accountId,
      owner.session.accessToken,
      entries[1].slice(7),
    ])
      expect(text).not.toContain(secret)
  })
})

describe('the legacy switch', () => {
  it('off: every legacy request is 426, leaving included, while bearer requests work', async () => {
    const owner = await BearerOwner.create()
    const legacy = await Owner.create(h)
    const writer = await owner.addWriter()
    await legacyOff()

    for (const op of BUDDIES_OPS) {
      const response = await h.request(`/${op}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': IP },
        body: '{}',
      })
      expect(response.status, op).toBe(426)
      expect(response.headers.get('retry-after'), op).toBeNull()
      expect(await response.json()).toEqual(relayError('upgrade_required'))
    }
    expect((await legacy.sync()).status).toBe(426)
    expect((await legacy.send('inbox/delete')).status).toBe(426)
    expect((await legacy.connect()).status).toBe(426)
    expect((await legacy.putBlob(await photoBlob())).status).toBe(426)
    expect((await legacy.getBlob(await photoBlob())).status).toBe(426)
    expect((await writer.putCard()).status).toBe(426)

    expect((await owner.sync()).status).toBe(200)
    expect((await owner.connect()).status).toBe(101)
    expect(
      (await writerSend(writer, 'card/put', { blob: blobOfSize(64) }, owner.auth))
        .status
    ).toBe(200)
    expect((await owner.op('inbox/delete')).status).toBe(200)
  })

  it('off: a legacy register is 426, a bearer one works', async () => {
    await legacyOff()
    const legacy = await Owner.create(h, false)
    expect(
      (await legacy.send('inbox/register', { ownerPub: legacy.key.publicKey }))
        .status
    ).toBe(426)
    expect((await BearerOwner.create(false).then((o) => o.register())).status).toBe(
      200
    )
  })
})

describe('the Notification Service Extension’s sync', () => {
  const EXTENSION = { [BUDDIES_CLIENT_HEADER]: 'notification-service' }

  /** The extension's fetch: an owner-signed `inbox/sync`, no token. */
  const extensionSync = async (
    owner: { inboxId: string; key: SigningKey },
    headers: Record<string, string> = EXTENSION,
    fields: Record<string, unknown> = {},
    op: BuddiesSignedOp = 'inbox/sync'
  ) =>
    h.post(
      `/${op}`,
      await envelope(
        op,
        {
          inboxId: owner.inboxId,
          since: 0,
          ts: Date.now(),
          nonce: randomId(),
          ...fields,
        },
        owner.key
      ),
      headers
    )

  it('off: serves a confirmed inbox’s signed sync, with every check it had', async () => {
    const owner = await BearerOwner.create()
    const writer = await owner.addWriter()
    expect((await writer.putEvent()).status).toBe(200)
    await legacyOff()
    const nonces = nonceRows(owner.inboxId)

    const served = await extensionSync(owner)
    expect(served.status).toBe(200)
    expect(served.body.events).toHaveLength(1)
    expect(served.body).toEqual((await owner.sync()).body)
    // Signed as ever: the nonce is recorded and can't be replayed.
    expect(nonceRows(owner.inboxId)).toBe(nonces + 1)
    const nonce = randomId()
    expect((await extensionSync(owner, EXTENSION, { nonce })).status).toBe(200)
    expect(await extensionSync(owner, EXTENSION, { nonce })).toEqual({
      status: 409,
      body: relayError('replay'),
    })
    expect(
      await extensionSync(owner, EXTENSION, { ts: Date.now() - 6 * 60_000 })
    ).toMatchObject({ status: 401, body: { code: 'stale' } })
    const stranger = { inboxId: owner.inboxId, key: await SigningKey.generate() }
    expect(await extensionSync(stranger)).toEqual({
      status: 401,
      body: relayError('bad_signature'),
    })
    expect(await extensionSync({ ...owner, inboxId: randomId() })).toEqual({
      status: 404,
      body: relayError('not_found'),
    })

    await setStatus(owner.session.accountId, 'suspended')
    expect(await extensionSync(owner)).toEqual({
      status: 403,
      body: relayError('suspended'),
    })
    await setStatus(owner.session.accountId, 'active')
    expect((await extensionSync(owner)).status).toBe(200)
  })

  it('off: still 426 for an inbox without a confirmed link', async () => {
    // Registered before accounts: no link at all.
    const unlinked = await Owner.create(h)
    // Linked in the inbox, but the accounts database never wrote it.
    const unconfirmed = await BearerOwner.create(false)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const failing = failInboxLinks()
    expect((await unconfirmed.register()).status).toBe(500)
    failing.mockRestore()
    // A row from before confirmation.
    const old = await BearerOwner.create()
    h.inboxes
      .storage(old.inboxId)
      .query('ALTER TABLE owner_account DROP COLUMN confirmed')
    h.inboxes.restart(old.inboxId)
    await legacyOff()

    for (const owner of [unlinked, unconfirmed, old]) {
      const nonces = nonceRows(owner.inboxId)
      expect(await extensionSync(owner)).toEqual({
        status: 426,
        body: relayError('upgrade_required'),
      })
      expect(nonceRows(owner.inboxId)).toBe(nonces)
    }
    // The signature comes first, so a stranger learns nothing about links.
    const stranger = { inboxId: old.inboxId, key: await SigningKey.generate() }
    expect((await extensionSync(stranger)).status).toBe(401)

    // Relinking confirms it, and the extension's fetch works again.
    expect((await old.register()).status).toBe(200)
    expect((await extensionSync(old)).status).toBe(200)
  })

  it('off: 426 for every other legacy request, header or not', async () => {
    const owner = await BearerOwner.create()
    const writer = await owner.addWriter()
    await legacyOff()
    const nonces = nonceRows(owner.inboxId)

    expect((await extensionSync(owner, {})).status).toBe(426)
    for (const value of ['Notification-Service', 'notification-services', 'app']) {
      expect(
        (await extensionSync(owner, { [BUDDIES_CLIENT_HEADER]: value })).status,
        value
      ).toBe(426)
    }
    for (const op of BUDDIES_OPS) {
      if (op === 'inbox/sync') continue
      const response = await h.post(`/${op}`, '{}', EXTENSION)
      expect(response, op).toEqual({
        status: 426,
        body: relayError('upgrade_required'),
      })
    }
    expect(
      (await extensionSync(owner, EXTENSION, {}, 'inbox/delete')).status
    ).toBe(426)
    expect(
      (
        await h.post(
          '/event/put',
          await envelope(
            'event/put',
            {
              inboxId: writer.inboxId,
              slotId: writer.slotId,
              eventId: randomId(),
              kind: 'plan.joined',
              blob: blobOfSize(48),
              push: false,
              ts: Date.now(),
              nonce: randomId(),
            },
            writer.key
          ),
          EXTENSION
        )
      ).status
    ).toBe(426)
    const legacy = await Owner.create(h, false)
    Object.assign(legacy, { inboxId: owner.inboxId, key: owner.key })
    expect(
      (
        await h.live({
          ...(await liveHeaders(
            { inboxId: owner.inboxId, ts: Date.now(), nonce: randomId() },
            owner.key
          )),
          ...EXTENSION,
        })
      ).status
    ).toBe(426)
    expect(
      (await legacy.putBlob(await photoBlob(), {}, { headers: EXTENSION }))
        .status
    ).toBe(426)
    expect(nonceRows(owner.inboxId)).toBe(nonces)
  })

  it('on: the header changes nothing, legacy or bearer', async () => {
    const unlinked = await Owner.create(h)
    expect((await extensionSync(unlinked)).status).toBe(200)
    expect((await extensionSync(unlinked, {})).status).toBe(200)

    const owner = await BearerOwner.create()
    expect((await extensionSync(owner)).status).toBe(200)
    expect((await owner.sync({ ...owner.auth, ...EXTENSION })).status).toBe(200)
    await legacyOff()
    expect((await owner.sync({ ...owner.auth, ...EXTENSION })).status).toBe(200)
  })
})

describe('per-account limits', () => {
  it('keys bearer requests on a hash of the account, not the client IP', async () => {
    await setUp({ unsignedLimit: 2 })
    const first = await session()
    const second = await session()
    const fetch = (headers: Record<string, string>, ip = IP) =>
      h.post('/invite/fetch', unsignedEnvelope({ inviteId: randomId() }), {
        'cf-connecting-ip': ip,
        ...headers,
      })

    expect((await fetch(bearer(first.accessToken))).status).toBe(404)
    expect((await fetch(bearer(first.accessToken), '198.51.100.9')).status).toBe(
      404
    )
    // The account's budget is spent, from any address.
    expect(await fetch(bearer(first.accessToken))).toEqual({
      status: 429,
      body: relayError('rate_limited'),
    })
    // Another account behind the same address has its own.
    expect((await fetch(bearer(second.accessToken))).status).toBe(404)
    // So does a legacy request from that address.
    expect((await fetch({})).status).toBe(404)

    const accountKeys = h.rateLimitKeys.filter((key) => key.startsWith('account:'))
    expect(new Set(accountKeys).size).toBe(2)
    for (const key of h.rateLimitKeys) {
      expect(key).not.toContain(first.accountId)
      expect(key).not.toContain(second.accountId)
    }
  })

  it('counts bearer registrations against the account’s daily quota', async () => {
    const owner = await BearerOwner.create(false)
    const names = vi.spyOn(h.env.BUDDY_REGISTRATION_QUOTA, 'idFromName')
    expect(
      (await owner.register({}, { ...owner.auth, 'cf-connecting-ip': '198.51.100.1' }))
        .status
    ).toBe(200)
    expect(
      (await owner.register({}, { ...owner.auth, 'cf-connecting-ip': '198.51.100.2' }))
        .status
    ).toBe(200)
    await Owner.create(h)
    const [bearerA, bearerB, legacy] = names.mock.calls.map(([name]) => name)
    expect(bearerA).toBe(bearerB)
    expect(legacy).not.toBe(bearerA)
    expect(bearerA).not.toContain(owner.session.accountId)
  })
})

describe('the account activity log (witness-work ADR 0028)', () => {
  const activityOf = async (s: TestSession) => {
    const response = await accountsApp.request(
      '/activity?limit=100',
      { headers: bearer(s.accessToken) },
      h.env
    )
    expect(response.status).toBe(200)
    return ((await response.json()) as {
      activity: { kind: string; session?: { sessionId: string } }[]
    }).activity
  }
  const buddiesEntries = async (s: TestSession) =>
    (await activityOf(s)).filter((entry) => entry.kind.startsWith('buddies.'))

  it('logs linking an inbox and deleting Buddies once each, with the session', async () => {
    const owner = await BearerOwner.create()
    expect((await owner.register()).status).toBe(200)
    expect((await owner.op('inbox/delete')).status).toBe(200)
    expect((await owner.op('inbox/delete')).status).not.toBe(200)

    expect(await buddiesEntries(owner.session)).toEqual([
      expect.objectContaining({
        kind: 'buddies.deleted',
        session: expect.objectContaining({ sessionId: owner.session.sessionId }),
      }),
      expect.objectContaining({
        kind: 'buddies.inbox_linked',
        session: expect.objectContaining({ sessionId: owner.session.sessionId }),
      }),
    ])
  })

  it('logs a legacy delete of a linked inbox on its account, without a session', async () => {
    const legacy = await Owner.create(h)
    const owner = await BearerOwner.create(false)
    Object.assign(owner, { inboxId: legacy.inboxId, key: legacy.key })
    expect((await owner.register()).status).toBe(200)
    expect((await legacy.send('inbox/delete')).status).toBe(200)

    const [deleted] = await buddiesEntries(owner.session)
    expect(deleted).toEqual(expect.objectContaining({ kind: 'buddies.deleted' }))
    expect(deleted.session).toBeUndefined()
  })

  it('logs nothing for writer ops, on either account', async () => {
    const owner = await BearerOwner.create()
    const buddy = await session()
    const writer = await owner.addWriter()
    for (const [op, fields] of [
      ['event/put', { eventId: randomId(), kind: 'plan.joined', blob: blobOfSize(48), push: false }],
      ['card/put', { blob: blobOfSize(64) }],
      ['slot/leave', {}],
    ] as const)
      expect(
        (await writerSend(writer, op, fields, bearer(buddy.accessToken))).status
      ).toBe(200)

    expect((await activityOf(buddy)).map((entry) => entry.kind)).toEqual([
      'session.opened',
      'account.created',
    ])
    expect((await buddiesEntries(owner.session)).map((entry) => entry.kind)).toEqual([
      'buddies.inbox_linked',
    ])
  })
})
