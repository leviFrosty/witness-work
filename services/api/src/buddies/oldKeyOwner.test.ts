import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DAY_MS,
  SigningKey,
  b64u,
  blobOfSize,
  blobPutHeaders,
  createHarness,
  envelope,
  inviteSecrets,
  liveHeaders,
  photoBlob,
  randomBytes,
  randomId,
  relayError,
  type Harness,
} from '../test/buddies'
import {
  bearer,
  openTestSession,
  requestJson,
  type TestSession,
} from '../test/accounts'
import {
  accountSignedMessage,
  inboxLinkMessage,
  rekeyNewKeyMessage,
} from '../accounts/contracts'
import { createAccountsRoutes } from '../accounts/route'
import { resetAccountStatusCache } from '../accounts/auth'
import {
  BUDDIES_CLIENT_HEADER,
  BUDDIES_OWNER_OPS,
  type BuddiesOwnerOp,
} from './contracts'

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
 * After an account key change (witness-work ADR 0039), an inbox first
 * linked before the change refuses owner-signed (legacy) requests with 401
 * `unauthorized`, `reason: "key_changed"`, for good: its owner key comes from
 * the old account key, so whoever holds that could otherwise keep reading the
 * old inbox until the User's device deletes it.
 */

const START = Date.UTC(2026, 9, 30, 12)
const encoder = new TextEncoder()
const accountsApp = createAccountsRoutes() as never
const EXTENSION = { [BUDDIES_CLIENT_HEADER]: 'notification-service' }
const KEY_CHANGED = {
  status: 401,
  body: relayError('unauthorized', { reason: 'key_changed' }),
}

let h: Harness

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  resetAccountStatusCache()
  h = await createHarness()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

type Holder = Pick<TestSession, 'accountId' | 'accessToken' | 'key'>

interface Inbox {
  inboxId: string
  owner: SigningKey
}

const sql = (query: string, ...params: (string | number | null)[]) =>
  h.accountsDb!.db.prepare(query).all(...params) as Record<string, unknown>[]

const phone = () => openTestSession(accountsApp, h.env)

const legacyOff = () => h.kv.put('auth:legacy', 'off')

const nonceRows = (inboxId: string): number =>
  Number(
    h.inboxes.storage(inboxId).query('SELECT COUNT(*) AS n FROM nonce')[0].n
  )

const linkEpoch = (inboxId: string) =>
  sql('SELECT key_epoch FROM account_inboxes WHERE inbox_id = ?', inboxId)[0]
    ?.key_epoch

const firstLinkEpoch = (inboxId: string) =>
  sql(
    'SELECT first_key_epoch FROM account_inboxes WHERE inbox_id = ?',
    inboxId
  )[0]?.first_key_epoch

/** `inbox/register` with the holder's proof, as a bearer or legacy request. */
const register = async (
  inbox: Inbox,
  holder: Holder | null,
  headers: Record<string, string> = {}
) =>
  h.post(
    '/inbox/register',
    await envelope(
      'inbox/register',
      {
        inboxId: inbox.inboxId,
        ownerPub: inbox.owner.publicKey,
        ...(holder && {
          account: {
            accountId: holder.accountId,
            signature: b64u(
              await holder.key.sign(
                inboxLinkMessage(
                  holder.accountId,
                  inbox.inboxId,
                  inbox.owner.publicKey
                )
              )
            ),
          },
        }),
        ts: Date.now(),
        nonce: randomId(),
      },
      inbox.owner
    ),
    headers
  )

const linked = async (holder: Holder): Promise<Inbox> => {
  const inbox = { inboxId: randomId(), owner: await SigningKey.generate() }
  const response = await register(inbox, holder, bearer(holder.accessToken))
  expect(response).toEqual({
    status: 200,
    body: { ok: true, accountId: holder.accountId },
  })
  return inbox
}

/** An owner-signed (legacy) request, as the old key's holder sends it. */
const signed = async (
  inbox: Inbox,
  op: BuddiesOwnerOp,
  fields: Record<string, unknown> = {},
  headers: Record<string, string> = {}
) =>
  h.post(
    `/${op}`,
    await envelope(
      op,
      { inboxId: inbox.inboxId, ts: Date.now(), nonce: randomId(), ...fields },
      inbox.owner
    ),
    headers
  )

const signedSync = (inbox: Inbox, headers: Record<string, string> = {}) =>
  signed(inbox, 'inbox/sync', { since: 0 }, headers)

const bearerSync = (inbox: Inbox, holder: Pick<Holder, 'accessToken'>) =>
  h.post(
    '/inbox/sync',
    { inboxId: inbox.inboxId, since: 0 },
    bearer(holder.accessToken)
  )

/** Changes the holder's account key on its session; the holder under K2. */
const rekey = async (holder: Holder): Promise<Holder> => {
  const newKey = await SigningKey.generate()
  const [{ key_epoch: keyEpoch }] = sql(
    'SELECT key_epoch FROM accounts WHERE id = ?',
    holder.accountId
  )
  const bytes = encoder.encode(
    JSON.stringify({
      accountPub: holder.key.publicKey,
      ts: Date.now(),
      nonce: randomId(),
      newAccountPub: newKey.publicKey,
      keyEpoch,
      history: b64u(randomBytes(300)),
    })
  )
  const response = await requestJson(
    accountsApp,
    h.env,
    'POST',
    '/account/rekey',
    {
      payload: b64u(bytes),
      signature: b64u(
        await holder.key.sign(accountSignedMessage('account/rekey', bytes))
      ),
      newSignature: b64u(await newKey.sign(rekeyNewKeyMessage(bytes))),
    },
    bearer(holder.accessToken)
  )
  expect(response.status).toBe(200)
  return { ...holder, key: newKey, accessToken: response.body.accessToken }
}

/** Valid fields for each owner op, so only the key change refuses it. */
const ownerOpFields = async (): Promise<
  Record<BuddiesOwnerOp, Record<string, unknown>>
> => {
  const invite = await inviteSecrets()
  return {
    'inbox/sync': { since: 0 },
    'inbox/delete': {},
    'device/register': {
      deviceId: randomId(),
      apnsToken: 'ab'.repeat(32),
      apnsEnvironment: 'sandbox',
      templates: { 'plan.joined': { title: 'Plans', body: 'Joined' } },
    },
    'device/unregister': { deviceId: randomId() },
    'slot/add': {
      slotId: randomId(),
      writerPub: (await SigningKey.generate()).publicKey,
    },
    'slot/remove': { slotId: randomId() },
    'roster/put': { blob: blobOfSize(64) },
    'invite/create': {
      inviteId: invite.inviteId,
      claimVerifier: invite.claimVerifier,
      blob: blobOfSize(100),
      expiresAt: Date.now() + DAY_MS,
    },
    'invite/delete': { inviteId: randomId() },
    'blob/delete': { blobIds: [b64u(new Uint8Array(32))] },
  }
}

const signedBlobPut = async (inbox: Inbox) => {
  const blob = await photoBlob()
  const headers = await blobPutHeaders(
    {
      inboxId: inbox.inboxId,
      blobId: blob.blobId,
      bytes: blob.bytes.byteLength,
      expiresAt: Date.now() + 30 * DAY_MS,
      readTokenHash: blob.readTokenHash,
      ts: Date.now(),
      nonce: randomId(),
    },
    inbox.owner
  )
  const response = await h.request('/blob/put', {
    method: 'POST',
    headers: {
      'cf-connecting-ip': '203.0.113.7',
      'content-length': String(blob.bytes.byteLength),
      ...headers,
    },
    body: blob.bytes,
  })
  return { status: response.status, body: await response.json() }
}

/** A buddy's slot, which an inbox needs before it takes photos. */
const addBuddy = async (inbox: Inbox) => {
  const response = await signed(inbox, 'slot/add', {
    slotId: randomId(),
    writerPub: (await SigningKey.generate()).publicKey,
  })
  expect(response.status).toBe(200)
}

const signedLive = async (inbox: Inbox) =>
  h.live(
    await liveHeaders(
      { inboxId: inbox.inboxId, ts: Date.now(), nonce: randomId() },
      inbox.owner
    )
  )

describe('owner-signed ops after a key change', () => {
  it('refuses the old inbox’s signed sync, legacy on', async () => {
    const a = await phone()
    const x = await linked(a)
    expect((await signedSync(x)).status).toBe(200)

    await rekey(a)
    const nonces = nonceRows(x.inboxId)
    expect(await signedSync(x)).toEqual(KEY_CHANGED)
    // Refused before the inbox: nothing recorded.
    expect(nonceRows(x.inboxId)).toBe(nonces)
  })

  it('refuses the Notification Service Extension’s sync, legacy off', async () => {
    const a = await phone()
    const x = await linked(a)
    await legacyOff()
    expect((await signedSync(x, EXTENSION)).status).toBe(200)

    await rekey(a)
    expect(await signedSync(x, EXTENSION)).toEqual(KEY_CHANGED)
    // Every other legacy request is still 426, as before.
    expect((await signedSync(x)).status).toBe(426)
  })

  it('refuses every other owner-signed owner op, and changes nothing', async () => {
    const a = await phone()
    const x = await linked(a)
    expect((await signed(x, 'roster/put', { blob: blobOfSize(64) })).status).toBe(
      200
    )
    const a2 = await rekey(a)
    const before = await bearerSync(x, a2)
    expect(before.status).toBe(200)

    const fields = await ownerOpFields()
    for (const op of BUDDIES_OWNER_OPS)
      expect(await signed(x, op, fields[op]), op).toEqual(KEY_CHANGED)
    expect(await signedBlobPut(x)).toEqual(KEY_CHANGED)
    const live = await signedLive(x)
    expect({ status: live.status, body: live.body }).toEqual(KEY_CHANGED)

    // The inbox is still there, untouched.
    expect(await bearerSync(x, a2)).toEqual(before)
  })

  it('keeps refusing after the new key links the inbox again', async () => {
    const a = await phone()
    const x = await linked(a)
    const a2 = await rekey(a)
    expect(await signedSync(x)).toEqual(KEY_CHANGED)

    // The User's device registers it with the new key's proof: that moves
    // the link up (successor eligibility), but X's owner key is still the
    // old key's, so owner-signed requests stay refused.
    expect(await register(x, a2, bearer(a2.accessToken))).toEqual({
      status: 200,
      body: { ok: true, accountId: a.accountId },
    })
    expect(linkEpoch(x.inboxId)).toBe(1)
    expect(firstLinkEpoch(x.inboxId)).toBe(0)
    expect(await signedSync(x)).toEqual(KEY_CHANGED)
    expect(await signedBlobPut(x)).toEqual(KEY_CHANGED)
    const live = await signedLive(x)
    expect({ status: live.status, body: live.body }).toEqual(KEY_CHANGED)
    await legacyOff()
    expect(await signedSync(x, EXTENSION)).toEqual(KEY_CHANGED)
    // Bearer owner ops still work.
    expect((await bearerSync(x, a2)).status).toBe(200)
  })

  it('refuses a legacy registration, so the old key can’t keep the inbox alive', async () => {
    const a = await phone()
    const x = await linked(a)
    await rekey(a)
    const nonces = nonceRows(x.inboxId)

    // Without a proof (all the old key can still send), and with the old
    // key's proof.
    expect(await register(x, null)).toEqual(KEY_CHANGED)
    expect(await register(x, a)).toEqual(KEY_CHANGED)
    expect(nonceRows(x.inboxId)).toBe(nonces)
    expect(linkEpoch(x.inboxId)).toBe(0)
  })

  it('still lets the User’s device replace the old inbox with a successor', async () => {
    for (const relink of [false, true]) {
      const a = await phone()
      const x = await linked(a)
      const a2 = await rekey(a)
      const n = await linked(a2)
      if (relink)
        expect(
          (await register(x, a2, bearer(a2.accessToken))).status
        ).toBe(200)

      expect(
        await h.post(
          '/inbox/delete',
          { inboxId: x.inboxId, successor: n.inboxId },
          bearer(a2.accessToken)
        )
      ).toEqual({ status: 200, body: { ok: true } })
      const buddy = await phone()
      expect(
        await h.post(
          '/inbox/successor',
          { inboxId: x.inboxId },
          bearer(buddy.accessToken)
        )
      ).toEqual({ status: 200, body: { ok: true, successor: n.inboxId } })
      expect((await bearerSync(x, a2)).status).toBe(404)
    }
  })

  it('leaves an inbox the new key linked alone', async () => {
    const a = await phone()
    const a2 = await rekey(a)
    const y = await linked(a2)
    expect(linkEpoch(y.inboxId)).toBe(1)
    expect(firstLinkEpoch(y.inboxId)).toBe(1)
    await addBuddy(y)
    expect((await signedSync(y)).status).toBe(200)
    expect((await signed(y, 'roster/put', { blob: blobOfSize(64) })).status).toBe(
      200
    )
    expect((await signedLive(y)).status).toBe(101)
    expect((await signedBlobPut(y)).status).toBe(200)
  })

  it('leaves unlinked inboxes and other accounts’ inboxes alone', async () => {
    const unlinked = { inboxId: randomId(), owner: await SigningKey.generate() }
    expect((await register(unlinked, null)).status).toBe(200)
    expect(linkEpoch(unlinked.inboxId)).toBeUndefined()
    const b = await phone()
    const other = await linked(b)
    const a = await phone()
    await rekey(a)

    for (const inbox of [unlinked, other]) {
      await addBuddy(inbox)
      expect((await signedSync(inbox)).status).toBe(200)
      expect((await signedLive(inbox)).status).toBe(101)
      expect((await signedBlobPut(inbox)).status).toBe(200)
    }
  })

  it('leaves bearer owner ops to the session rules', async () => {
    const a = await phone()
    const x = await linked(a)
    const a2 = await rekey(a)
    expect((await bearerSync(x, a2)).status).toBe(200)
    expect(
      (
        await h.post(
          '/roster/put',
          { inboxId: x.inboxId, blob: blobOfSize(64) },
          bearer(a2.accessToken)
        )
      ).status
    ).toBe(200)
  })

  it('fails closed while the accounts database fails', async () => {
    const a = await phone()
    const x = await linked(a)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const db = h.accountsDb!
    vi.spyOn(db, 'prepare').mockImplementation(() => {
      throw new Error('D1 down')
    })
    const nonces = nonceRows(x.inboxId)
    expect(await signedSync(x)).toEqual({
      status: 500,
      body: { ok: false, error: 'internal', code: 'internal' },
    })
    expect(nonceRows(x.inboxId)).toBe(nonces)
  })
})

describe('the migration', () => {
  it('backfills each link’s first epoch with its epoch', () => {
    const dir = new URL('../../migrations/accounts/', import.meta.url)
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    const last = files.indexOf('0009_inbox-first-key-epoch.sql')
    expect(last).toBeGreaterThan(0)
    const db = new DatabaseSync(':memory:')
    for (const file of files.slice(0, last))
      db.exec(readFileSync(new URL(file, dir), 'utf8'))
    db.exec(`INSERT INTO accounts (id, account_pub, key_epoch, created_at)
      VALUES ('a', 'p', 2, ${START})`)
    db.exec(`INSERT INTO account_inboxes (inbox_id, account_id, created_at, key_epoch)
      VALUES ('x0', 'a', ${START}, 0), ('x1', 'a', ${START}, 1), ('x2', 'a', ${START}, 2)`)
    db.exec(readFileSync(new URL(files[last], dir), 'utf8'))
    expect(
      db
        .prepare(
          'SELECT inbox_id, key_epoch, first_key_epoch FROM account_inboxes ORDER BY inbox_id'
        )
        .all()
    ).toEqual([
      { inbox_id: 'x0', key_epoch: 0, first_key_epoch: 0 },
      { inbox_id: 'x1', key_epoch: 1, first_key_epoch: 1 },
      { inbox_id: 'x2', key_epoch: 2, first_key_epoch: 2 },
    ])
  })
})
