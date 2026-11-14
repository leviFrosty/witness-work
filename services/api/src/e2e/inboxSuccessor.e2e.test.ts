import { afterAll, describe, expect, it } from 'vitest'
import { SigningKey, b64u, randomBytes, randomId } from '../test/buddiesClient'
import { accountSignedMessage, rekeyNewKeyMessage } from '../accounts/contracts'
import {
  BearerRelayOwner,
  DEV_BYPASS_TOKEN,
  bearerHeaders,
  http,
  openSession,
  writeTranscript,
  type E2ESession,
} from '../test/e2e'

/**
 * A Buddies inbox's successor (witness-work ADR 0039 §5) over real HTTP: a
 * thief holding the old account key links its own inbox before the User
 * changes the key; afterwards it can't be named as the old inbox's
 * successor, its session can't record one, and its key opens no session,
 * while the inbox the User links under the new key is recorded and read back
 * by another account. Writes `.verify/artifacts/e2e-inbox-successor-*.json`.
 */

afterAll(() => {
  writeTranscript('inbox-successor')
})

const encoder = new TextEncoder()

const rekey = async (session: E2ESession): Promise<E2ESession> => {
  const newKey = await SigningKey.generate()
  const account = await http('GET', '/accounts/v1/account', {
    headers: bearerHeaders(session),
  })
  const bytes = encoder.encode(
    JSON.stringify({
      accountPub: session.key.publicKey,
      ts: Date.now(),
      nonce: randomId(),
      newAccountPub: newKey.publicKey,
      keyEpoch: account.body.keyEpoch,
      history: b64u(randomBytes(300)),
    })
  )
  const response = await http('POST', '/accounts/v1/account/rekey', {
    headers: bearerHeaders(session),
    body: {
      payload: b64u(bytes),
      signature: b64u(await session.key.sign(accountSignedMessage('account/rekey', bytes))),
      newSignature: b64u(await newKey.sign(rekeyNewKeyMessage(bytes))),
    },
  })
  expect(response.status).toBe(200)
  expect(response.body.keyEpoch).toBe(account.body.keyEpoch + 1)
  return { ...session, key: newKey, accessToken: response.body.accessToken }
}

const remove = (inbox: BearerRelayOwner, session: E2ESession, successor?: string) =>
  http('POST', '/buddies/v1/inbox/delete', {
    headers: bearerHeaders(session),
    body: { inboxId: inbox.inboxId, ...(successor ? { successor } : {}) },
  })

const successorOf = (inboxId: string, headers: Record<string, string>) =>
  http('POST', '/buddies/v1/inbox/successor', { headers, body: { inboxId } })

const alive = async (inbox: BearerRelayOwner, session: E2ESession) =>
  (await inbox.sync(0, bearerHeaders(session))).status === 200

describe.skipIf(!DEV_BYPASS_TOKEN)('inbox successors on the local worker', () => {
  it('names only the inbox the new key linked, never the thief’s', async () => {
    const k1 = await SigningKey.generate()
    const user = await openSession(k1)
    const x = await BearerRelayOwner.create(user)
    // The thief holds K1: same account, its own session and inbox T.
    const thief = await openSession(k1)
    expect(thief.accountId).toBe(user.accountId)
    const t = await BearerRelayOwner.create(thief)

    const user2 = await rekey(user)
    const n = await BearerRelayOwner.create(user2)

    const namedThief = await remove(x, user2, t.inboxId)
    expect(namedThief.status).toBe(409)
    expect(namedThief.body).toMatchObject({ ok: false, code: 'conflict' })
    expect(await alive(x, user2)).toBe(true)

    const staleToken = await remove(x, thief, t.inboxId)
    expect(staleToken.status).toBe(401)
    expect(staleToken.body).toMatchObject({ code: 'unauthorized' })
    expect(await alive(x, user2)).toBe(true)

    const reopened = await http('POST', '/accounts/v1/sessions', {
      headers: { 'x-ww-dev-bypass': DEV_BYPASS_TOKEN ?? '' },
      body: await (async () => {
        const bytes = encoder.encode(
          JSON.stringify({ accountPub: k1.publicKey, ts: Date.now(), nonce: randomId() })
        )
        return {
          payload: b64u(bytes),
          signature: b64u(await k1.sign(accountSignedMessage('session/open', bytes))),
        }
      })(),
    })
    expect(reopened.status).toBe(403)
    expect(reopened.body).toMatchObject({ code: 'key_retired' })

    const deleted = await remove(x, user2, n.inboxId)
    expect(deleted.status).toBe(200)
    expect(deleted.body).toEqual({ ok: true })
    expect(await alive(x, user2)).toBe(false)
    // Idempotent.
    expect((await remove(x, user2, n.inboxId)).body).toEqual({ ok: true })

    const buddy = await openSession()
    const read = await successorOf(x.inboxId, bearerHeaders(buddy))
    expect(read.status).toBe(200)
    expect(read.body).toEqual({ ok: true, successor: n.inboxId })
  })

  it('stops vouching for a successor recorded before the key change', async () => {
    const k1 = await SigningKey.generate()
    const user = await openSession(k1)
    const x = await BearerRelayOwner.create(user)
    // A K1 holder deletes X naming its own T while epoch 0 is current.
    const thief = await openSession(k1)
    const t = await BearerRelayOwner.create(thief)
    expect((await remove(x, thief, t.inboxId)).status).toBe(200)
    const buddy = await openSession()
    expect((await successorOf(x.inboxId, bearerHeaders(buddy))).body).toEqual({
      ok: true,
      successor: t.inboxId,
    })

    const user2 = await rekey(user)
    expect((await successorOf(x.inboxId, bearerHeaders(buddy))).body).toEqual({
      ok: true,
      successor: null,
    })

    // The User's own successor replaces the stale record...
    const n = await BearerRelayOwner.create(user2)
    expect((await remove(x, user2, n.inboxId)).body).toEqual({ ok: true })
    expect((await successorOf(x.inboxId, bearerHeaders(buddy))).body).toEqual({
      ok: true,
      successor: n.inboxId,
    })
    // ...and, still qualifying, isn't replaced by another.
    const other = await BearerRelayOwner.create(user2)
    const second = await remove(x, user2, other.inboxId)
    expect(second.status).toBe(409)
    expect((await successorOf(x.inboxId, bearerHeaders(buddy))).body).toEqual({
      ok: true,
      successor: n.inboxId,
    })
  })

  it('never registers a replaced inbox again, and refuses a deleted or replaced successor', async () => {
    const user = await openSession()
    const x = await BearerRelayOwner.create(user)
    const n = await BearerRelayOwner.create(user)
    expect((await remove(x, user, n.inboxId)).status).toBe(200)
    const again = await x.register()
    expect(again.status).toBe(409)
    expect(again.body).toMatchObject({ code: 'conflict' })
    expect(await alive(x, user)).toBe(false)
    // A cycle: N names X back.
    expect((await remove(n, user, x.inboxId)).status).toBe(409)
    expect(await alive(n, user)).toBe(true)
    // A deleted successor.
    const y = await BearerRelayOwner.create(user)
    const gone = await BearerRelayOwner.create(user)
    expect((await remove(gone, user)).status).toBe(200)
    expect((await remove(y, user, gone.inboxId)).status).toBe(409)
    expect(await alive(y, user)).toBe(true)
  })

  it('answers null, and needs a token', async () => {
    const buddy = await openSession()
    expect((await successorOf(randomId(), bearerHeaders(buddy))).body).toEqual({
      ok: true,
      successor: null,
    })
    const anonymous = await successorOf(randomId(), {})
    expect(anonymous.status).toBe(401)
    expect(anonymous.body).toMatchObject({ code: 'unauthorized' })
    const malformed = await http('POST', '/buddies/v1/inbox/successor', {
      headers: bearerHeaders(buddy),
      body: { inboxId: 'nope' },
    })
    expect(malformed.status).toBe(400)
  })

  it('refuses another account’s inbox and the inbox itself', async () => {
    const user = await openSession()
    const other = await openSession()
    const x = await BearerRelayOwner.create(user)
    const theirs = await BearerRelayOwner.create(other)
    expect((await remove(x, user, theirs.inboxId)).status).toBe(409)
    expect((await remove(x, user, x.inboxId)).status).toBe(409)
    expect((await remove(x, other, theirs.inboxId)).status).toBe(403)
    expect(await alive(x, user)).toBe(true)
  })

  it('is documented in the OpenAPI document', async () => {
    const doc = await http('GET', '/openapi.json')
    expect(doc.status).toBe(200)
    expect(doc.body.paths['/buddies/v1/inbox/successor']).toBeDefined()
    expect(doc.text).toContain('successor')
  })
})
