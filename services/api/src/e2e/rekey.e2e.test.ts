import { afterAll, describe, expect, it } from 'vitest'
import { SigningKey, b64u, randomBytes, randomId, sha256B64u } from '../test/buddiesClient'
import { accountSignedMessage, rekeyNewKeyMessage } from '../accounts/contracts'
import {
  DEV_BYPASS_TOKEN,
  bearerHeaders,
  http,
  httpBytes,
  openLive,
  openSession,
  writeTranscript,
  type E2ESession,
} from '../test/e2e'

/**
 * Changing the account key (witness-work ADR 0039) over real HTTP: a phone
 * (dev bypass) changes its key; another session of the account is ended,
 * can't refresh, and reopening with the old key is `key_retired`; a token
 * from before the change can't write; the account's sync socket closes with
 * `4005 "key_changed"`; and of two changes at once, exactly one wins.
 * Writes `.verify/artifacts/e2e-rekey-*.json`.
 */

afterAll(() => {
  writeTranscript('rekey')
})

const encoder = new TextEncoder()
const CURRENT_APP = { appVersion: '1.48.0', capabilities: ['sync-everyone'] }
const slot = () => randomId().slice(0, 16)

const rekeyBody = async (session: E2ESession, newKey: SigningKey, keyEpoch = 0) => {
  const bytes = encoder.encode(
    JSON.stringify({
      accountPub: session.key.publicKey,
      ts: Date.now(),
      nonce: randomId(),
      newAccountPub: newKey.publicKey,
      keyEpoch,
      history: b64u(randomBytes(300)),
    })
  )
  return {
    payload: b64u(bytes),
    signature: b64u(await session.key.sign(accountSignedMessage('account/rekey', bytes))),
    newSignature: b64u(await newKey.sign(rekeyNewKeyMessage(bytes))),
  }
}

const rekey = (session: Pick<E2ESession, 'accessToken'>, body: unknown) =>
  http('POST', '/accounts/v1/account/rekey', {
    body,
    headers: { authorization: `Bearer ${session.accessToken}` },
  })

const openWith = async (key: SigningKey, fields: Record<string, unknown> = {}) => {
  const bytes = encoder.encode(
    JSON.stringify({ accountPub: key.publicKey, ts: Date.now(), nonce: randomId(), ...fields })
  )
  return http('POST', '/accounts/v1/sessions', {
    headers: { 'x-ww-dev-bypass': DEV_BYPASS_TOKEN ?? '' },
    body: {
      payload: b64u(bytes),
      signature: b64u(await key.sign(accountSignedMessage('session/open', bytes))),
    },
  })
}

const syncPut = async (
  session: Pick<E2ESession, 'accessToken'>,
  slotId: string,
  headers: Record<string, string> = {}
) => {
  const bytes = randomBytes(256)
  return httpBytes('/accounts/v1/sync/put', {
    bytes,
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      'x-ww-slot-id': slotId,
      'x-ww-sha256': await sha256B64u(bytes),
      ...headers,
    },
  })
}

describe.skipIf(!DEV_BYPASS_TOKEN)('changing the account key on the local worker', () => {
  it('changes the key, ends the other session, retires the old key, and refuses stale writes', async () => {
    // Apps that turn on everyone's Cloud Sync say so.
    const phone = await openSession(undefined, CURRENT_APP)
    const other = await openSession(phone.key, CURRENT_APP)
    const mine = slot()
    const theirs = slot()
    expect((await syncPut(phone, mine)).status).toBe(200)
    expect((await syncPut(other, theirs)).status).toBe(200)
    const socket = await openLive(
      { ...bearerHeaders(other), upgrade: 'websocket', 'x-ww-slot-id': slot() },
      '/accounts/v1/sync/live'
    )
    expect(socket.status).toBe(101)

    const newKey = await SigningKey.generate()
    const changed = await rekey(phone, await rekeyBody(phone, newKey))
    expect(changed.status).toBe(200)
    expect(changed.body).toMatchObject({ ok: true, keyEpoch: 1 })
    const caller = { accessToken: changed.body.accessToken as string }

    // The account has the new key and epoch, and the same id.
    const account = await http('GET', '/accounts/v1/account', {
      headers: { authorization: `Bearer ${caller.accessToken}` },
    })
    expect(account.body).toMatchObject({
      accountId: phone.accountId,
      accountPub: newKey.publicKey,
      keyEpoch: 1,
    })

    // The other session's socket closed, it's signed out, and can't refresh.
    if (socket.status === 101)
      expect(await socket.connection.closed).toEqual({ code: 4005, reason: 'key_changed' })
    const refused = await http('POST', '/accounts/v1/sessions/refresh', {
      body: { refreshToken: other.refreshToken },
    })
    expect(refused.status).toBe(401)
    expect(refused.body).toMatchObject({
      code: 'unauthorized',
      reason: 'key_changed',
      changedAt: expect.any(Number),
    })
    // Reopening with the old key is key_retired, and makes no account.
    const reopened = await openWith(phone.key)
    expect(reopened.status).toBe(403)
    expect(reopened.body).toMatchObject({ code: 'key_retired', changedAt: expect.any(Number) })
    // Both say when the account's key changed.
    expect(refused.body.changedAt).toBe(reopened.body.changedAt)
    // A device resolving the change opens into the account with the new key.
    const resolved = await openWith(newKey, { accountId: phone.accountId, ...CURRENT_APP })
    expect(resolved.status).toBe(201)
    expect(resolved.body.accountId).toBe(phone.accountId)
    // It keeps the capabilities it opened with: Cloud Sync works for it.
    expect((await syncPut({ accessToken: resolved.body.accessToken }, slot())).status).toBe(200)

    // The caller's token from before the change can't write; its new one can.
    const stale = await syncPut(phone, mine)
    expect(stale.status).toBe(401)
    expect(stale.body).toMatchObject({ code: 'unauthorized', reason: 'key_changed' })
    const signedOut = await syncPut(other, mine)
    expect(signedOut.status).toBe(401)
    // One put a slot every 2 seconds.
    await new Promise((resolve) => setTimeout(resolve, 2_100))
    expect((await syncPut(caller, mine)).status).toBe(200)

    // Re-sealing the signed-out device's slot needs the ETag it read, and
    // keeps the slot's time.
    const listed = await http('POST', '/accounts/v1/sync/list', {
      body: {},
      headers: { authorization: `Bearer ${caller.accessToken}` },
    })
    const before = (listed.body.slots as { slotId: string; etag: string; updatedAt: number }[])
      .find((row) => row.slotId === theirs)!
    const blind = await syncPut(caller, theirs, { 'x-ww-reseal': '1' })
    expect(blind.status).toBe(400)
    const weak = await syncPut(caller, theirs, { 'x-ww-reseal': '1', 'if-match': `W/"${before.etag}"` })
    expect(weak.status).toBe(400)
    const resealed = await syncPut(caller, theirs, {
      'x-ww-reseal': '1',
      'if-match': `"${before.etag}"`,
    })
    expect(resealed.status).toBe(200)
    expect(resealed.body).toMatchObject({ updatedAt: before.updatedAt })

    // The key history the change stored.
    const history = await http('GET', '/accounts/v1/account/key-history', {
      headers: { authorization: `Bearer ${caller.accessToken}` },
    })
    expect(history.body).toMatchObject({ ok: true, keyEpoch: 1, history: expect.any(String) })
    // Not with the ended session's leftover token.
    const endedHistory = await http('GET', '/accounts/v1/account/key-history', {
      headers: { authorization: `Bearer ${other.accessToken}` },
    })
    expect(endedHistory.status).toBe(401)
  })

  it('leaves a session signed out before the change as signed out', async () => {
    const phone = await openSession(undefined, CURRENT_APP)
    const lost = await openSession(phone.key, CURRENT_APP)
    // The lost device is signed out first, then the key changes.
    const signedOut = await http('POST', '/accounts/v1/sessions/revoke', {
      body: { sessionId: lost.sessionId },
      headers: { authorization: `Bearer ${phone.accessToken}` },
    })
    expect(signedOut.status).toBe(200)
    const changed = await rekey(phone, await rekeyBody(phone, await SigningKey.generate()))
    expect(changed.status).toBe(200)

    const refused = await http('POST', '/accounts/v1/sessions/refresh', {
      body: { refreshToken: lost.refreshToken },
    })
    expect(refused.status).toBe(401)
    expect(refused.body).toMatchObject({ code: 'unauthorized', reason: 'revoked' })
  })

  /** Two changes at epoch 0 sent at once; exactly one wins. */
  const race = async (first: E2ESession, second: E2ESession) => {
    const bodies = [
      await rekeyBody(first, await SigningKey.generate()),
      await rekeyBody(second, await SigningKey.generate()),
    ]
    const answers = await Promise.all([rekey(first, bodies[0]), rekey(second, bodies[1])])
    const winner = answers.find((answer) => answer.status === 200)
    const losers = answers.filter((answer) => answer !== winner)
    expect(winner).toBeDefined()
    expect(losers).toHaveLength(1)
    const after = await http('GET', '/accounts/v1/account', {
      headers: { authorization: `Bearer ${winner!.body.accessToken}` },
    })
    expect(after.body.keyEpoch).toBe(1)
    return losers[0]
  }

  it('lets one of two concurrent changes from the same session win', async () => {
    const phone = await openSession()
    const loser = await race(phone, phone)
    // 409 when it passed the session check before the winner committed;
    // otherwise its token is from before the change.
    if (loser.status === 409)
      expect(loser.body).toMatchObject({ code: 'conflict', keyEpoch: 1 })
    else expect(loser.body).toMatchObject({ code: 'unauthorized', reason: 'key_changed' })
  })

  it('lets one of two concurrent changes from two sessions win', async () => {
    const phone = await openSession()
    const tablet = await openSession(phone.key)
    const loser = await race(phone, tablet)
    // 409 when its batch ran first against a moved epoch; 401 once the
    // winner had ended its session.
    expect([401, 409]).toContain(loser.status)
  })
})
