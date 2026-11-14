import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SigningKey,
  b64u,
  createHarness,
  envelope,
  randomBytes,
  randomId,
  type ApiResponse,
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
import { accountsDb, setAccountStatus } from '../accounts/store'
import { BuddyInbox } from './inboxDO'
import { pruneInboxSuccessors } from '../accounts/inboxSuccessors'

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
 * A Buddies inbox's successor (witness-work ADR 0039 §5): after an account
 * key change, `inbox/delete` with `successor` records the new inbox for the
 * old one, and `inbox/successor` reads it, so a buddy can check a
 * `pair.reconnect` written with the old key's pairing keys.
 */

const START = Date.UTC(2026, 9, 30, 12)
const DAY = 24 * 60 * 60 * 1_000
const encoder = new TextEncoder()
const accountsApp = createAccountsRoutes() as never

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

/** Who holds an account: its current key and a session's token. */
type Holder = Pick<TestSession, 'accountId' | 'accessToken' | 'key'>

/** A Buddies inbox: its id and owner key. */
interface Inbox {
  inboxId: string
  owner: SigningKey
}

const sql = (query: string, ...params: (string | number | null)[]) =>
  h.accountsDb!.db.prepare(query).all(...params) as Record<string, unknown>[]

const phone = (key?: SigningKey) => openTestSession(accountsApp, h.env, key)

const newInbox = async (): Promise<Inbox> => ({
  inboxId: randomId(),
  owner: await SigningKey.generate(),
})

/** The `account` proof, signed by `signer` (the holder's key by default). */
const proof = async (inbox: Inbox, holder: Holder, signer = holder.key) => ({
  accountId: holder.accountId,
  signature: b64u(
    await signer.sign(
      inboxLinkMessage(holder.accountId, inbox.inboxId, inbox.owner.publicKey)
    )
  ),
})

const registerPayload = async (
  inbox: Inbox,
  holder: Holder,
  signer?: SigningKey
) =>
  envelope(
    'inbox/register',
    {
      inboxId: inbox.inboxId,
      ownerPub: inbox.owner.publicKey,
      account: await proof(inbox, holder, signer),
      ts: Date.now(),
      nonce: randomId(),
    },
    inbox.owner
  )

/** A bearer `inbox/register` linking `inbox` to the holder's account. */
const link = async (inbox: Inbox, holder: Holder) =>
  h.post(
    '/inbox/register',
    await registerPayload(inbox, holder),
    bearer(holder.accessToken)
  )

const linked = async (holder: Holder): Promise<Inbox> => {
  const inbox = await newInbox()
  const response = await link(inbox, holder)
  expect(response.status).toBe(200)
  expect(response.body).toEqual({ ok: true, accountId: holder.accountId })
  return inbox
}

const remove = (
  inbox: Inbox,
  holder: Pick<Holder, 'accessToken'>,
  successor?: string,
  fields: Record<string, unknown> = {}
) =>
  h.post(
    '/inbox/delete',
    { inboxId: inbox.inboxId, ...(successor ? { successor } : {}), ...fields },
    bearer(holder.accessToken)
  )

const successorOf = (
  inboxId: string,
  headers: Record<string, string>
): Promise<ApiResponse> => h.post('/inbox/successor', { inboxId }, headers)

/** Whether the inbox still answers its owner (it wasn't deleted). */
const alive = async (inbox: Inbox, holder: Pick<Holder, 'accessToken'>) =>
  (
    await h.post(
      '/inbox/sync',
      { inboxId: inbox.inboxId, since: 0 },
      bearer(holder.accessToken)
    )
  ).status === 200

const linkEpoch = (inboxId: string) =>
  sql('SELECT key_epoch FROM account_inboxes WHERE inbox_id = ?', inboxId)[0]
    ?.key_epoch

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

describe('linking records the key epoch', () => {
  it('records the account’s epoch when an inbox is linked', async () => {
    const a = await phone()
    const x = await linked(a)
    expect(linkEpoch(x.inboxId)).toBe(0)
    const a2 = await rekey(a)
    const n = await linked(a2)
    expect(linkEpoch(n.inboxId)).toBe(1)
    expect(linkEpoch(x.inboxId)).toBe(0)
  })

  it('moves a link to the current epoch when the current key confirms it', async () => {
    const a = await phone()
    const x = await linked(a)
    const a2 = await rekey(a)
    // Registering again with a proof from K2 confirms the link at epoch 1.
    expect((await link(x, a2)).status).toBe(200)
    expect(linkEpoch(x.inboxId)).toBe(1)
  })

  it('never moves a link back', async () => {
    const a = await phone()
    const a2 = await rekey(a)
    const n = await linked(a2)
    expect((await link(n, a2)).status).toBe(200)
    expect(linkEpoch(n.inboxId)).toBe(1)
  })
})

describe('the migration', () => {
  it('backfills each link with the epoch its account had when it was linked', () => {
    const dir = new URL('../../migrations/accounts/', import.meta.url)
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    const last = files.indexOf('0008_inbox-successor.sql')
    expect(last).toBeGreaterThan(0)
    const db = new DatabaseSync(':memory:')
    for (const file of files.slice(0, last))
      db.exec(readFileSync(new URL(file, dir), 'utf8'))
    const at = (day: number) => START + day * DAY
    // `never` never changed its key; `twice` changed it on days 10 and 20.
    db.exec(`INSERT INTO accounts (id, account_pub, key_epoch, created_at)
      VALUES ('never', 'p0', 0, ${at(0)}), ('twice', 'p2', 2, ${at(0)})`)
    db.exec(`INSERT INTO retired_account_keys (account_pub, account_id, key_epoch, retired_at)
      VALUES ('p0-old', 'twice', 0, ${at(10)}), ('p1-old', 'twice', 1, ${at(20)})`)
    db.exec(`INSERT INTO account_inboxes (inbox_id, account_id, created_at) VALUES
      ('n', 'never', ${at(30)}),
      ('t0', 'twice', ${at(5)}),
      ('t-at-change', 'twice', ${at(10)}),
      ('t-just-after', 'twice', ${at(10) + 999}),
      ('t-a-second-after', 'twice', ${at(10) + 1_000}),
      ('t1', 'twice', ${at(15)}),
      ('t2', 'twice', ${at(25)})`)
    db.exec(readFileSync(new URL(files[last], dir), 'utf8'))
    expect(
      db.prepare('SELECT inbox_id, key_epoch FROM account_inboxes ORDER BY inbox_id').all()
    ).toEqual([
      { inbox_id: 'n', key_epoch: 0 },
      { inbox_id: 't-a-second-after', key_epoch: 1 },
      { inbox_id: 't-at-change', key_epoch: 0 },
      { inbox_id: 't-just-after', key_epoch: 0 },
      { inbox_id: 't0', key_epoch: 0 },
      { inbox_id: 't1', key_epoch: 1 },
      { inbox_id: 't2', key_epoch: 2 },
    ])
  })
})

describe('inbox/delete with a successor', () => {
  it('records a successor linked to the same account at its current epoch', async () => {
    const a = await phone()
    const x = await linked(a)
    const n = await linked(a)

    const response = await remove(x, a, n.inboxId)
    expect(response).toEqual({ status: 200, body: { ok: true } })
    expect(await alive(x, a)).toBe(false)
    expect(
      sql(
        'SELECT inbox_id, successor_id, account_id, recorded_at FROM inbox_successors'
      )
    ).toEqual([
      {
        inbox_id: x.inboxId,
        successor_id: n.inboxId,
        account_id: a.accountId,
        recorded_at: START,
      },
    ])
    expect(await successorOf(x.inboxId, bearer(a.accessToken))).toEqual({
      status: 200,
      body: { ok: true, successor: n.inboxId },
    })
  })

  it('records one after a key change, for the inbox linked under the new key', async () => {
    const a = await phone()
    const x = await linked(a)
    const a2 = await rekey(a)
    const n = await linked(a2)
    expect((await remove(x, a2, n.inboxId)).status).toBe(200)
    expect(await alive(x, a2)).toBe(false)
    const b = await phone()
    expect((await successorOf(x.inboxId, bearer(b.accessToken))).body).toEqual({
      ok: true,
      successor: n.inboxId,
    })
  })

  it('refuses another account’s inbox as the successor, deleting nothing', async () => {
    const a = await phone()
    const b = await phone()
    const x = await linked(a)
    const other = await linked(b)
    const response = await remove(x, a, other.inboxId)
    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({ ok: false, code: 'conflict' })
    expect(await alive(x, a)).toBe(true)
    expect(sql('SELECT * FROM inbox_successors')).toEqual([])
  })

  it('refuses an unknown or unlinked successor', async () => {
    const a = await phone()
    const x = await linked(a)
    const response = await remove(x, a, randomId())
    expect(response.status).toBe(409)
    expect(await alive(x, a)).toBe(true)
  })

  it('refuses a successor linked before the key change', async () => {
    const a = await phone()
    const x = await linked(a)
    const old = await linked(a)
    const a2 = await rekey(a)
    const response = await remove(x, a2, old.inboxId)
    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({ code: 'conflict' })
    expect(await alive(x, a2)).toBe(true)
    expect(sql('SELECT * FROM inbox_successors')).toEqual([])
  })

  it('refuses the deleted inbox as its own successor', async () => {
    const a = await phone()
    const x = await linked(a)
    const response = await remove(x, a, x.inboxId)
    expect(response.status).toBe(409)
    expect(await alive(x, a)).toBe(true)
  })

  it('refuses a request without a bearer token (forbidden)', async () => {
    const a = await phone()
    const x = await linked(a)
    const n = await linked(a)
    const response = await h.send('inbox/delete', x.owner, {
      inboxId: x.inboxId,
      successor: n.inboxId,
    })
    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ code: 'forbidden' })
    expect(await alive(x, a)).toBe(true)
    expect(sql('SELECT * FROM inbox_successors')).toEqual([])
  })

  it('refuses another account’s token for the deleted inbox (forbidden)', async () => {
    const a = await phone()
    const b = await phone()
    const x = await linked(a)
    const n = await linked(b)
    const response = await remove(x, b, n.inboxId)
    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ code: 'forbidden' })
    expect(await alive(x, a)).toBe(true)
  })

  it('refuses a malformed successor', async () => {
    const a = await phone()
    const x = await linked(a)
    const response = await remove(x, a, undefined, { successor: 42 })
    expect(response.status).toBe(400)
    expect(await alive(x, a)).toBe(true)
  })

  it('is idempotent, logging the deletion once', async () => {
    const a = await phone()
    const x = await linked(a)
    const n = await linked(a)
    expect((await remove(x, a, n.inboxId)).status).toBe(200)
    vi.setSystemTime(START + 1_000)
    expect(await remove(x, a, n.inboxId)).toEqual({
      status: 200,
      body: { ok: true },
    })
    expect(sql('SELECT successor_id FROM inbox_successors')).toEqual([
      { successor_id: n.inboxId },
    ])
    expect(
      sql(
        "SELECT COUNT(*) AS n FROM account_activity WHERE kind = 'buddies.deleted'"
      )
    ).toEqual([{ n: 1 }])
  })

  it('keeps the first successor while it qualifies, refusing another', async () => {
    const a = await phone()
    const x = await linked(a)
    const n = await linked(a)
    const other = await linked(a)
    expect((await remove(x, a, n.inboxId)).status).toBe(200)
    const second = await remove(x, a, other.inboxId)
    expect(second.status).toBe(409)
    expect(second.body).toMatchObject({ code: 'conflict' })
    expect((await successorOf(x.inboxId, bearer(a.accessToken))).body).toEqual({
      ok: true,
      successor: n.inboxId,
    })
  })

  it('stops naming a successor recorded before a key change, and takes the one after it', async () => {
    const a = await phone()
    const x = await linked(a)
    const n0 = await linked(a)
    // Recorded at epoch 0: the read checks the link's epoch every time.
    expect((await remove(x, a, n0.inboxId)).status).toBe(200)
    expect((await successorOf(x.inboxId, bearer(a.accessToken))).body).toEqual({
      ok: true,
      successor: n0.inboxId,
    })
    const a2 = await rekey(a)
    expect((await successorOf(x.inboxId, bearer(a2.accessToken))).body).toEqual({
      ok: true,
      successor: null,
    })
    // The epoch-0 record no longer qualifies, so the User's own replaces it.
    const n1 = await linked(a2)
    expect(await remove(x, a2, n1.inboxId)).toEqual({
      status: 200,
      body: { ok: true },
    })
    expect((await successorOf(x.inboxId, bearer(a2.accessToken))).body).toEqual({
      ok: true,
      successor: n1.inboxId,
    })
    expect(sql('SELECT successor_id FROM inbox_successors')).toEqual([
      { successor_id: n1.inboxId },
    ])
  })

  it('drops the record when the inbox refuses the deletion', async () => {
    const a = await phone()
    const n = await linked(a)
    // X is linked in the accounts database, but its inbox never confirmed
    // the link (registered before accounts): the inbox answers `not_linked`.
    const x = await newInbox()
    const legacy = await h.send('inbox/register', x.owner, {
      inboxId: x.inboxId,
      ownerPub: x.owner.publicKey,
    })
    expect(legacy.status).toBe(200)
    sql(
      'INSERT INTO account_inboxes (inbox_id, account_id, created_at, key_epoch) VALUES (?, ?, ?, 0)',
      x.inboxId,
      a.accountId,
      START
    )
    const response = await remove(x, a, n.inboxId)
    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({ code: 'not_linked' })
    expect(sql('SELECT * FROM inbox_successors')).toEqual([])
    expect((await successorOf(x.inboxId, bearer(a.accessToken))).body).toEqual({
      ok: true,
      successor: null,
    })
  })

  it('drops the record when the deletion throws, and a retry records it again', async () => {
    const a = await phone()
    const x = await linked(a)
    const n = await linked(a)
    const failing = vi
      .spyOn(BuddyInbox.prototype, 'deleteInbox')
      .mockRejectedValueOnce(new Error('inbox unreachable'))
    const response = await remove(x, a, n.inboxId)
    expect(response.status).toBe(500)
    expect(sql('SELECT * FROM inbox_successors')).toEqual([])
    expect(await alive(x, a)).toBe(true)
    failing.mockRestore()

    expect(await remove(x, a, n.inboxId)).toEqual({
      status: 200,
      body: { ok: true },
    })
    expect((await successorOf(x.inboxId, bearer(a.accessToken))).body).toEqual({
      ok: true,
      successor: n.inboxId,
    })
  })

  it('refuses a suspended account’s successor, and stops naming one', async () => {
    const a = await phone()
    const x = await linked(a)
    const n = await linked(a)
    const y = await linked(a)
    expect((await remove(y, a, n.inboxId)).status).toBe(200)
    const db = accountsDb(h.env.ACCOUNTS_DB!)
    await setAccountStatus(db, a.accountId, 'suspended', 'report')
    resetAccountStatusCache()

    const response = await remove(x, a, n.inboxId)
    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ code: 'suspended' })
    expect(await remove(x, a)).toEqual({ status: 200, body: { ok: true } })
    const b = await phone()
    expect((await successorOf(y.inboxId, bearer(b.accessToken))).body).toEqual({
      ok: true,
      successor: null,
    })

    await setAccountStatus(db, a.accountId, 'active', 'appeal')
    expect((await successorOf(y.inboxId, bearer(b.accessToken))).body).toEqual({
      ok: true,
      successor: n.inboxId,
    })
  })

  it('never lets a replaced inbox be registered again, and drops its link', async () => {
    const a = await phone()
    const x = await linked(a)
    const n = await linked(a)
    expect((await remove(x, a, n.inboxId)).status).toBe(200)
    expect(linkEpoch(x.inboxId)).toBeUndefined()

    // Legacy, without a proof: the owner key alone.
    const legacy = await h.send('inbox/register', x.owner, {
      inboxId: x.inboxId,
      ownerPub: x.owner.publicKey,
    })
    expect(legacy.status).toBe(409)
    expect(legacy.body).toMatchObject({ code: 'conflict' })
    // Legacy and bearer, with the current key's proof.
    const proved = await h.post('/inbox/register', await registerPayload(x, a))
    expect(proved.status).toBe(409)
    const bearerRegister = await link(x, a)
    expect(bearerRegister.status).toBe(409)
    expect(bearerRegister.body).toMatchObject({ code: 'conflict' })

    expect(await alive(x, a)).toBe(false)
    expect(linkEpoch(x.inboxId)).toBeUndefined()
    // The record still answers, and a repeat is still `ok` for its account
    // only.
    expect((await successorOf(x.inboxId, bearer(a.accessToken))).body).toEqual({
      ok: true,
      successor: n.inboxId,
    })
    expect(await remove(x, a, n.inboxId)).toEqual({
      status: 200,
      body: { ok: true },
    })
    const b = await phone()
    const theirs = await linked(b)
    expect((await remove(x, b, theirs.inboxId)).status).toBe(403)
  })

  it('refuses a successor that was deleted', async () => {
    const a = await phone()
    const x = await linked(a)
    const n = await linked(a)
    expect((await remove(n, a)).status).toBe(200)
    // N's link outlives the wipe, at the current epoch.
    expect(linkEpoch(n.inboxId)).toBe(0)
    const response = await remove(x, a, n.inboxId)
    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({ code: 'conflict' })
    expect(await alive(x, a)).toBe(true)
    expect(sql('SELECT * FROM inbox_successors')).toEqual([])
  })

  it('refuses a successor that has a successor of its own (no cycles)', async () => {
    const a = await phone()
    const x = await linked(a)
    const n = await linked(a)
    const y = await linked(a)
    expect((await remove(x, a, n.inboxId)).status).toBe(200)
    // N names X back.
    const back = await remove(n, a, x.inboxId)
    expect(back.status).toBe(409)
    expect(await alive(n, a)).toBe(true)
    // Y names X, itself replaced.
    expect((await remove(y, a, x.inboxId)).status).toBe(409)
    expect(await alive(y, a)).toBe(true)
    expect(sql('SELECT inbox_id, successor_id FROM inbox_successors')).toEqual([
      { inbox_id: x.inboxId, successor_id: n.inboxId },
    ])
  })

  it('refuses a successor whose own deletion is under way', async () => {
    const a = await phone()
    const x = await linked(a)
    const n = await linked(a)
    const m = await linked(a)
    // N's record is written before its inbox is wiped: N is still linked and
    // registered in between.
    sql(
      'INSERT INTO inbox_successors (inbox_id, successor_id, account_id, recorded_at) VALUES (?, ?, ?, ?)',
      n.inboxId,
      m.inboxId,
      a.accountId,
      START
    )
    expect(await alive(n, a)).toBe(true)
    expect((await remove(x, a, n.inboxId)).status).toBe(409)
    expect(await alive(x, a)).toBe(true)
  })

  it('leaves a deletion without a successor as before', async () => {
    const a = await phone()
    const x = await linked(a)
    expect(await remove(x, a)).toEqual({ status: 200, body: { ok: true } })
    expect(await alive(x, a)).toBe(false)
    // A repeat finds no inbox, as before.
    expect((await remove(x, a)).status).toBe(404)
    expect(sql('SELECT * FROM inbox_successors')).toEqual([])
  })
})

describe('POST /buddies/v1/inbox/successor', () => {
  it('answers null for an inbox nobody replaced', async () => {
    const a = await phone()
    const x = await linked(a)
    expect(await successorOf(x.inboxId, bearer(a.accessToken))).toEqual({
      status: 200,
      body: { ok: true, successor: null },
    })
    expect((await successorOf(randomId(), bearer(a.accessToken))).body).toEqual({
      ok: true,
      successor: null,
    })
    await remove(x, a)
    expect((await successorOf(x.inboxId, bearer(a.accessToken))).body).toEqual({
      ok: true,
      successor: null,
    })
  })

  it('needs a bearer token', async () => {
    const response = await successorOf(randomId(), {})
    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({ code: 'unauthorized' })
    const forged = await successorOf(randomId(), bearer('nope'))
    expect(forged.status).toBe(401)
  })

  it('refuses a malformed body', async () => {
    const a = await phone()
    const response = await h.post(
      '/inbox/successor',
      { inboxId: 'not an id' },
      bearer(a.accessToken)
    )
    expect(response.status).toBe(400)
    const envelopeBody = await h.post(
      '/inbox/successor',
      { payload: b64u(encoder.encode(JSON.stringify({ inboxId: randomId() }))) },
      bearer(a.accessToken)
    )
    expect(envelopeBody.status).toBe(400)
  })

  it('follows the kill switch', async () => {
    const a = await phone()
    await h.kv.put('buddies:enabled', 'false')
    const response = await successorOf(randomId(), bearer(a.accessToken))
    expect(response.status).toBe(503)
    expect(response.body).toMatchObject({ code: 'disabled' })
  })

  it('forgets a successor 90 days after it was recorded', async () => {
    const a = await phone()
    const x = await linked(a)
    const n = await linked(a)
    expect((await remove(x, a, n.inboxId)).status).toBe(200)
    const db = accountsDb(h.env.ACCOUNTS_DB!)

    await pruneInboxSuccessors(db, START + 90 * DAY - 1)
    expect((await successorOf(x.inboxId, bearer(a.accessToken))).body).toEqual({
      ok: true,
      successor: n.inboxId,
    })
    await pruneInboxSuccessors(db, START + 90 * DAY)
    expect(sql('SELECT * FROM inbox_successors')).toEqual([])
    expect((await successorOf(x.inboxId, bearer(a.accessToken))).body).toEqual({
      ok: true,
      successor: null,
    })
  })
})

describe('a thief holding the old key', () => {
  it('can’t make its inbox the successor after the key change', async () => {
    const k1 = await SigningKey.generate()
    const a = await phone(k1)
    const x = await linked(a)
    // The thief opens a session with K1 and links its own inbox T (epoch 0).
    const thief = await phone(k1)
    expect(thief.accountId).toBe(a.accountId)
    const t = await linked(thief)
    expect(linkEpoch(t.inboxId)).toBe(0)

    // The User changes the key (epoch 1), ending the thief's session, and
    // links the new inbox N under K2.
    const a2 = await rekey(a)
    const n = await linked(a2)

    // Naming T is refused; nothing is deleted.
    const named = await remove(x, a2, t.inboxId)
    expect(named.status).toBe(409)
    expect(named.body).toMatchObject({ code: 'conflict' })
    expect(await alive(x, a2)).toBe(true)

    // The thief's access token outlives its session for minutes, but can't
    // record a successor: the session ended.
    const stale = await remove(x, thief, t.inboxId)
    expect(stale.status).toBe(401)
    expect(stale.body).toMatchObject({ code: 'unauthorized' })
    expect(await alive(x, a2)).toBe(true)

    // N it is.
    expect(await remove(x, a2, n.inboxId)).toEqual({
      status: 200,
      body: { ok: true },
    })
    expect((await successorOf(x.inboxId, bearer(a2.accessToken))).body).toEqual({
      ok: true,
      successor: n.inboxId,
    })

    // K1 opens no session any more, so links nothing by bearer request...
    await expect(phone(k1)).rejects.toThrow(/403 .*key_retired/)
    // ...nor by a legacy one: K1's proof no longer verifies for the account.
    const t2 = await newInbox()
    const legacy = await h.post('/inbox/register', await registerPayload(t2, thief))
    expect(legacy.status).toBe(401)
    expect(legacy.body).toMatchObject({ code: 'bad_signature' })
    expect(sql('SELECT * FROM account_inboxes WHERE inbox_id = ?', t2.inboxId)).toEqual([])
  })

  it('loses a successor it recorded before the change', async () => {
    const k1 = await SigningKey.generate()
    const a = await phone(k1)
    const x = await linked(a)
    const thief = await phone(k1)
    const t = await linked(thief)
    // Before the change the thief is as good as the User: it can delete X
    // naming T.
    expect((await remove(x, thief, t.inboxId)).status).toBe(200)
    expect((await successorOf(x.inboxId, bearer(a.accessToken))).body).toEqual({
      ok: true,
      successor: t.inboxId,
    })

    // Once the key changes, T is no longer the account's current link, so
    // the relay stops naming it, before the User names N...
    const a2 = await rekey(a)
    expect((await successorOf(x.inboxId, bearer(a2.accessToken))).body).toEqual({
      ok: true,
      successor: null,
    })
    // ...and the User can name N for the already-deleted X.
    const n = await linked(a2)
    expect(await remove(x, a2, n.inboxId)).toEqual({
      status: 200,
      body: { ok: true },
    })
    expect((await successorOf(x.inboxId, bearer(a2.accessToken))).body).toEqual({
      ok: true,
      successor: n.inboxId,
    })
  })
})
