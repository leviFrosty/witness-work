import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Hono } from 'hono'
import {
  Owner,
  SigningKey,
  b64u,
  blobOfSize,
  createHarness,
  inviteSecrets,
  randomId,
  type Harness,
} from '../test/buddies'
import { signedMessage } from '../buddies/envelope'
import {
  type AccountsOp,
  accountSignedMessage,
  inboxLinkMessage,
} from './contracts'
import { createAccountsRoutes } from './route'
import { createAccountsAdminRoutes } from './admin'

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

const ADMIN_TOKEN = 'admin-secret-for-tests'
const START = Date.UTC(2026, 9, 12, 12)
const encoder = new TextEncoder()

let h: Harness
const accountsApp = createAccountsRoutes()
const adminApp = createAccountsAdminRoutes()

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  h = await createHarness()
  h.env.ADMIN_API_TOKEN = ADMIN_TOKEN
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const post = async (
  app: Hono<never>,
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
) => {
  const response = await app.request(
    path,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '203.0.113.7',
        ...headers,
      },
      body: JSON.stringify(body),
    },
    h.env
  )
  return { status: response.status, body: await response.json() }
}

const accountEnvelope = async (
  payload: Record<string, unknown>,
  key: SigningKey,
  message = accountSignedMessage,
  op: AccountsOp = 'account/register'
) => {
  const bytes = encoder.encode(JSON.stringify(payload))
  return {
    payload: b64u(bytes),
    signature: b64u(await key.sign(message(op, bytes))),
  }
}

const registerAccount = async (
  key: SigningKey,
  payload: Record<string, unknown> = {}
) =>
  post(
    accountsApp as never,
    '/account/register',
    await accountEnvelope(
      { accountPub: key.publicKey, ts: Date.now(), nonce: randomId(), ...payload },
      key
    )
  )

/** An account key and its registered account id. */
const newAccount = async () => {
  const key = await SigningKey.generate()
  const response = await registerAccount(key)
  expect(response.status).toBe(200)
  return { key, accountId: response.body.accountId as string }
}

const linkProof = async (
  account: { key: SigningKey; accountId: string },
  owner: Owner
) => ({
  accountId: account.accountId,
  signature: b64u(
    await account.key.sign(
      inboxLinkMessage(account.accountId, owner.inboxId, owner.key.publicKey)
    )
  ),
})

const registerInbox = async (
  owner: Owner,
  account?: Record<string, unknown>
) =>
  owner.send('inbox/register', {
    ownerPub: owner.key.publicKey,
    ...(account ? { account } : {}),
  })

const admin = (
  path: string,
  body: unknown,
  token: string | null = ADMIN_TOKEN
) =>
  post(
    adminApp as never,
    path,
    body,
    token == null ? {} : { 'x-ww-admin-token': token }
  )

const setStatus = (accountId: string, status: string, reason = 'report') =>
  admin('/status', { accountId, status, reason })

/** An owner whose inbox is registered and linked to a new account. */
const linkedOwner = async () => {
  const account = await newAccount()
  const owner = await Owner.create(h, false)
  const response = await registerInbox(owner, await linkProof(account, owner))
  expect(response).toEqual({
    status: 200,
    body: { ok: true, accountId: account.accountId },
  })
  return { account, owner }
}

describe('account/register', () => {
  it('creates an account once per key', async () => {
    const key = await SigningKey.generate()
    const first = await registerAccount(key)
    expect(first.status).toBe(200)
    expect(first.body).toEqual({
      ok: true,
      accountId: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
      status: 'active',
    })
    const again = await registerAccount(key)
    expect(again.body.accountId).toBe(first.body.accountId)
    const other = await registerAccount(await SigningKey.generate())
    expect(other.body.accountId).not.toBe(first.body.accountId)
  })

  it('refuses a signature by another key', async () => {
    const key = await SigningKey.generate()
    const response = await post(
      accountsApp as never,
      '/account/register',
      await accountEnvelope(
        { accountPub: key.publicKey, ts: Date.now(), nonce: randomId() },
        await SigningKey.generate()
      )
    )
    expect(response).toMatchObject({
      status: 401,
      body: { code: 'bad_signature' },
    })
  })

  it('refuses a Buddies signature over the same payload', async () => {
    const key = await SigningKey.generate()
    const response = await post(
      accountsApp as never,
      '/account/register',
      await accountEnvelope(
        { accountPub: key.publicKey, ts: Date.now(), nonce: randomId() },
        key,
        (_op, bytes) => signedMessage('inbox/register', bytes)
      )
    )
    expect(response.body.code).toBe('bad_signature')
  })

  it('refuses a stale timestamp and a malformed payload', async () => {
    const key = await SigningKey.generate()
    const stale = await registerAccount(key, { ts: Date.now() - 10 * 60_000 })
    expect(stale).toMatchObject({ status: 401, body: { code: 'stale' } })
    const malformed = await registerAccount(key, { accountPub: 'nope' })
    expect(malformed).toMatchObject({
      status: 400,
      body: { code: 'bad_request' },
    })
  })

  it('is off without the accounts database', async () => {
    h = await createHarness({ accountsDb: false })
    const response = await registerAccount(await SigningKey.generate())
    expect(response).toMatchObject({ status: 503, body: { code: 'disabled' } })
  })
})

const accountInfo = async (
  key: SigningKey,
  payload: Record<string, unknown> = {},
  op: AccountsOp = 'account/info'
) =>
  post(
    accountsApp as never,
    '/account/info',
    await accountEnvelope(
      { accountPub: key.publicKey, ts: Date.now(), nonce: randomId(), ...payload },
      key,
      accountSignedMessage,
      op
    )
  )

describe('account/info', () => {
  it('shows the account, its inboxes, and its status changes', async () => {
    const { account, owner } = await linkedOwner()
    vi.setSystemTime(START + 60_000)
    await setStatus(account.accountId, 'suspended')
    vi.setSystemTime(START + 120_000)
    await setStatus(account.accountId, 'active', 'appeal')
    expect(await accountInfo(account.key)).toEqual({
      status: 200,
      body: {
        ok: true,
        accountId: account.accountId,
        accountPub: account.key.publicKey,
        status: 'active',
        createdAt: START,
        keyEpoch: 0,
        inboxIds: [owner.inboxId],
        statusChanges: [
          { status: 'suspended', createdAt: START + 60_000 },
          { status: 'active', createdAt: START + 120_000 },
        ],
      },
    })
  })

  it('never creates an account', async () => {
    const key = await SigningKey.generate()
    expect(await accountInfo(key)).toMatchObject({
      status: 404,
      body: { code: 'unknown_account' },
    })
    expect((await registerAccount(key)).status).toBe(200)
    expect((await accountInfo(key)).body.inboxIds).toEqual([])
  })

  it('needs the account key’s signature for account/info', async () => {
    const { key } = await newAccount()
    const other = await SigningKey.generate()
    const forged = await post(
      accountsApp as never,
      '/account/info',
      await accountEnvelope(
        { accountPub: key.publicKey, ts: Date.now(), nonce: randomId() },
        other,
        accountSignedMessage,
        'account/info'
      )
    )
    expect(forged.body.code).toBe('bad_signature')
    // A register signature can't be replayed as a read.
    const crossOp = await accountInfo(key, {}, 'account/register')
    expect(crossOp.body.code).toBe('bad_signature')
  })

  it('refuses a stale timestamp, and is off without the database', async () => {
    const { key } = await newAccount()
    const stale = await accountInfo(key, { ts: Date.now() - 10 * 60_000 })
    expect(stale).toMatchObject({ status: 401, body: { code: 'stale' } })
    h = await createHarness({ accountsDb: false })
    expect(await accountInfo(key)).toMatchObject({
      status: 503,
      body: { code: 'disabled' },
    })
  })
})

describe('linking an inbox', () => {
  it('links on inbox/register with a proof, and says so later without one', async () => {
    const { account, owner } = await linkedOwner()
    expect(await admin('/lookup', { inboxId: owner.inboxId })).toEqual({
      status: 200,
      body: {
        ok: true,
        account: {
          id: account.accountId,
          status: 'active',
          inboxIds: [owner.inboxId],
        },
      },
    })
    // Builds before accounts register without a proof; the link stands.
    expect((await registerInbox(owner)).body).toEqual({
      ok: true,
      accountId: account.accountId,
    })
  })

  it('registers unlinked without a proof', async () => {
    const owner = await Owner.create(h, false)
    expect((await registerInbox(owner)).body).toEqual({ ok: true })
    expect(await admin('/lookup', { inboxId: owner.inboxId })).toMatchObject({
      status: 404,
      body: { code: 'unknown_account' },
    })
  })

  it('refuses an unknown account and a proof the account key did not sign', async () => {
    const account = await newAccount()
    const owner = await Owner.create(h, false)
    const unknown = await registerInbox(owner, {
      ...(await linkProof(account, owner)),
      accountId: randomId(),
    })
    expect(unknown).toMatchObject({
      status: 404,
      body: { code: 'unknown_account' },
    })
    const forged = await registerInbox(
      owner,
      await linkProof(
        { key: await SigningKey.generate(), accountId: account.accountId },
        owner
      )
    )
    expect(forged).toMatchObject({
      status: 401,
      body: { code: 'bad_signature' },
    })
  })

  it("can't claim someone else's inbox", async () => {
    const victim = await Owner.create(h)
    const attacker = await newAccount()
    // The attacker's own owner key, aimed at the victim's inbox id.
    const impostor = await Owner.create(h, false)
    Object.defineProperty(impostor, 'inboxId', { value: victim.inboxId })
    const response = await registerInbox(
      impostor,
      await linkProof(attacker, impostor)
    )
    expect(response).toMatchObject({ status: 409, body: { code: 'conflict' } })
    expect(
      (await admin('/lookup', { inboxId: victim.inboxId })).status
    ).toBe(404)
  })

  it('refuses a second account for a linked inbox', async () => {
    const { owner } = await linkedOwner()
    const other = await newAccount()
    const response = await registerInbox(owner, await linkProof(other, owner))
    expect(response).toMatchObject({ status: 409, body: { code: 'conflict' } })
  })

  it('registers unlinked while the accounts database fails', async () => {
    const account = await newAccount()
    const owner = await Owner.create(h, false)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(h.accountsDb!, 'prepare').mockImplementation(() => {
      throw new Error('D1 down')
    })
    const response = await registerInbox(owner, await linkProof(account, owner))
    expect(response).toEqual({ status: 200, body: { ok: true } })
  })
})

describe('suspension', () => {
  it('refuses owner ops until reinstated, but lets the owner leave', async () => {
    const { account, owner } = await linkedOwner()
    const buddy = await Owner.create(h)
    const slotId = randomId()
    const writer = await SigningKey.generate()
    expect(
      (await owner.send('slot/add', { slotId, writerPub: writer.publicKey }))
        .status
    ).toBe(200)

    const suspended = await setStatus(account.accountId, 'suspended')
    expect(suspended.body).toMatchObject({
      ok: true,
      account: { status: 'suspended' },
      inboxesUpdated: 1,
      inboxesFailed: 0,
    })

    const refused = { status: 403, body: { code: 'suspended' } }
    expect(await owner.sync()).toMatchObject(refused)
    const invite = await inviteSecrets()
    expect(
      await owner.send('invite/create', {
        inviteId: invite.inviteId,
        claimVerifier: invite.claimVerifier,
        blob: blobOfSize(200),
        expiresAt: Date.now() + 86_400_000,
      })
    ).toMatchObject(refused)
    expect(await registerInbox(owner)).toMatchObject(refused)
    expect((await owner.connect()).status).toBe(403)
    // Leaving still works.
    expect((await owner.send('slot/remove', { slotId })).status).toBe(200)
    // Other inboxes are untouched.
    expect((await buddy.sync()).status).toBe(200)

    await setStatus(account.accountId, 'active', 'appeal')
    expect((await owner.sync()).status).toBe(200)
  })

  it('outlives deleting and registering the inbox again', async () => {
    const { account, owner } = await linkedOwner()
    await setStatus(account.accountId, 'suspended')
    expect((await owner.send('inbox/delete')).status).toBe(200)
    expect(await registerInbox(owner)).toMatchObject({
      status: 403,
      body: { code: 'suspended' },
    })
  })

  it("closes the owner's live sockets", async () => {
    const { account, owner } = await linkedOwner()
    const live = await owner.connect()
    expect(live.status).toBe(101)
    await setStatus(account.accountId, 'suspended')
    expect(live.socket?.closedBy).toEqual({ code: 4003, reason: 'suspended' })
  })

  it('refuses new inboxes for a suspended account', async () => {
    const { account } = await linkedOwner()
    await setStatus(account.accountId, 'suspended')
    const second = await Owner.create(h, false)
    expect(
      await registerInbox(second, await linkProof(account, second))
    ).toMatchObject({ status: 403, body: { code: 'suspended' } })
    // A refused registration doesn't link.
    expect(
      (await admin('/lookup', { accountId: account.accountId })).body.account
        .inboxIds
    ).toHaveLength(1)
  })
})

describe('admin', () => {
  it('answers 404 without the right token or the database', async () => {
    const { account } = await linkedOwner()
    for (const token of [null, '', 'wrong']) {
      expect(
        (await admin('/lookup', { accountId: account.accountId }, token))
          .status
      ).toBe(404)
    }
    h.env.ACCOUNTS_DB = undefined
    expect(
      (await admin('/status', { accountId: account.accountId })).status
    ).toBe(404)
  })

  it('validates status changes', async () => {
    const { account } = await linkedOwner()
    expect(
      (await setStatus(account.accountId, 'banned')).body.error
    ).toBe('Invalid status')
    expect(
      (await setStatus(account.accountId, 'suspended', 'because')).body.error
    ).toBe('Invalid reason')
    expect((await setStatus(randomId(), 'suspended')).status).toBe(404)
  })

  it('records every status change', async () => {
    const { account } = await linkedOwner()
    await setStatus(account.accountId, 'suspended', 'report')
    await setStatus(account.accountId, 'active', 'appeal')
    const rows = h
      .accountsDb!.db.prepare(
        'SELECT status, reason FROM account_status_events WHERE account_id = ? ORDER BY id'
      )
      .all(account.accountId)
    expect(rows).toEqual([
      { status: 'suspended', reason: 'report' },
      { status: 'active', reason: 'appeal' },
    ])
  })
})
