import { afterAll, describe, expect, it } from 'vitest'
import {
  SigningKey,
  b64u,
  blobOfSize,
  blobPutHeaders,
  envelope,
  liveHeaders,
  photoBlob,
  randomBytes,
  randomId,
  relayError,
} from '../test/buddiesClient'
import { accountSignedMessage, rekeyNewKeyMessage } from '../accounts/contracts'
import {
  BearerRelayOwner,
  DEV_BYPASS_TOKEN,
  LOCAL_LAUNCHER,
  RelayOwner,
  bearerHeaders,
  http,
  httpBytes,
  localKv,
  openLive,
  openSession,
  writeTranscript,
  type E2ESession,
} from '../test/e2e'
import type { BuddiesSignedOp } from '../buddies/contracts'

/**
 * After an account key change (witness-work ADR 0039), over real HTTP: the
 * old key's holder derives the old inbox's owner key and sends owner-signed
 * requests, the iOS Notification Service Extension's sync among them. An
 * inbox first linked before the change refuses them all, and legacy
 * registrations, with 401 `unauthorized`, `reason: "key_changed"`, legacy
 * switch on or off, for good: registering it again with the new key doesn't
 * lift it. The User's device replaces it with a successor over bearer;
 * unlinked inboxes and bearer requests are unchanged. Writes
 * `.verify/artifacts/e2e-old-key-owner-*.json`.
 */

afterAll(() => {
  writeTranscript('old-key-owner')
})

const encoder = new TextEncoder()
const EXTENSION = { 'x-buddies-client': 'notification-service' }
const KEY_CHANGED = relayError('unauthorized', { reason: 'key_changed' })

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
  return { ...session, key: newKey, accessToken: response.body.accessToken }
}

type Inbox = { inboxId: string; key: SigningKey }

/** An owner-signed request, as the old key's holder (or the extension) sends it. */
const signed = async (
  inbox: Inbox,
  op: BuddiesSignedOp,
  fields: Record<string, unknown> = {},
  headers: Record<string, string> = {}
) =>
  http('POST', `/buddies/v1/${op}`, {
    headers,
    body: await envelope(
      op,
      { inboxId: inbox.inboxId, ts: Date.now(), nonce: randomId(), ...fields },
      inbox.key
    ),
  })

const signedSync = (inbox: Inbox, headers: Record<string, string> = {}) =>
  signed(inbox, 'inbox/sync', { since: 0 }, headers)

const signedBlobPut = async (inbox: Inbox) => {
  const blob = await photoBlob(512)
  return httpBytes('/buddies/v1/blob/put', {
    bytes: blob.bytes,
    headers: await blobPutHeaders(
      {
        inboxId: inbox.inboxId,
        blobId: blob.blobId,
        bytes: blob.bytes.byteLength,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        readTokenHash: blob.readTokenHash,
        ts: Date.now(),
        nonce: randomId(),
      },
      inbox.key
    ),
  })
}

const signedLive = async (inbox: Inbox) => {
  const attempt = await openLive(
    await liveHeaders(
      { inboxId: inbox.inboxId, ts: Date.now(), nonce: randomId() },
      inbox.key
    )
  )
  if ('connection' in attempt) attempt.connection.end()
  return attempt
}

describe.skipIf(!DEV_BYPASS_TOKEN || !LOCAL_LAUNCHER)(
  'owner-signed ops after a key change, on the local worker',
  () => {
    it('refuses the old inbox’s owner-signed ops for good, while bearer ops replace it', async () => {
      const user = await openSession()
      const x = await BearerRelayOwner.create(user)
      const writer = await x.addWriter()
      expect((await signedSync(x)).status).toBe(200)

      const user2 = await rekey(user)
      const sync = await signedSync(x)
      expect(sync.status).toBe(401)
      expect(sync.body).toEqual(KEY_CHANGED)

      const invite = randomId()
      for (const [op, fields] of [
        ['roster/put', { blob: blobOfSize(64) }],
        ['slot/remove', { slotId: writer.slotId }],
        ['device/unregister', { deviceId: randomId() }],
        ['invite/delete', { inviteId: invite }],
        ['blob/delete', { blobIds: [b64u(new Uint8Array(32))] }],
        ['inbox/delete', {}],
      ] as const) {
        const response = await signed(x, op, fields)
        expect({ op, status: response.status, body: response.body }).toEqual({
          op,
          status: 401,
          body: KEY_CHANGED,
        })
      }
      const put = await signedBlobPut(x)
      expect(put.status).toBe(401)
      expect(put.body).toEqual(KEY_CHANGED)
      const live = await signedLive(x)
      expect(live.status).toBe(401)
      expect('body' in live && live.body).toEqual(KEY_CHANGED)

      // Nothing changed: the bearer owner still sees the inbox, slot and all.
      const bearerSync = await x.sync(0, bearerHeaders(user2))
      expect(bearerSync.status).toBe(200)
      expect(bearerSync.body.slots).toEqual([
        expect.objectContaining({ slotId: writer.slotId }),
      ])

      // A legacy registration is refused too, proof or not, so the old key
      // can't keep the inbox from ageing out.
      const legacyRegister = await http('POST', '/buddies/v1/inbox/register', {
        body: await envelope(
          'inbox/register',
          {
            inboxId: x.inboxId,
            ownerPub: x.key.publicKey,
            ts: Date.now(),
            nonce: randomId(),
          },
          x.key
        ),
      })
      expect(legacyRegister.status).toBe(401)
      expect(legacyRegister.body).toEqual(KEY_CHANGED)

      // The User's device registers it with the new key's proof. The link
      // moves up, but X's owner key is still the old key's: still refused.
      const relinked = await x.register(
        { account: await x.proof(user2) },
        bearerHeaders(user2)
      )
      expect(relinked.status).toBe(200)
      const after = await signedSync(x)
      expect(after.status).toBe(401)
      expect(after.body).toEqual(KEY_CHANGED)

      // The User's device replaces it with a successor over bearer.
      const n = await BearerRelayOwner.create(user2)
      const deleted = await http('POST', '/buddies/v1/inbox/delete', {
        headers: bearerHeaders(user2),
        body: { inboxId: x.inboxId, successor: n.inboxId },
      })
      expect(deleted.status).toBe(200)
      const buddy = await openSession()
      const successor = await http('POST', '/buddies/v1/inbox/successor', {
        headers: bearerHeaders(buddy),
        body: { inboxId: x.inboxId },
      })
      expect(successor.body).toEqual({ ok: true, successor: n.inboxId })
    })

    it('refuses the Notification Service Extension’s sync with the legacy switch off', async () => {
      const user = await openSession()
      const x = await BearerRelayOwner.create(user)
      try {
        localKv('put', 'auth:legacy', 'off')
        expect((await signedSync(x, EXTENSION)).status).toBe(200)
        const user2 = await rekey(user)
        const refused = await signedSync(x, EXTENSION)
        expect(refused.status).toBe(401)
        expect(refused.body).toEqual(KEY_CHANGED)
        // Other legacy requests stay 426.
        expect((await signedSync(x)).status).toBe(426)
        // Bearer requests are unchanged.
        expect((await x.sync(0, bearerHeaders(user2))).status).toBe(200)
      } finally {
        // Back to the suites' default: on (see src/test/e2eGlobalSetup.ts).
        localKv('put', 'auth:legacy', 'on')
      }
    })

    it('leaves unlinked inboxes and new-key inboxes alone', async () => {
      const unlinked = await RelayOwner.register()
      await unlinked.addWriter()
      const user = await openSession()
      const user2 = await rekey(user)
      const fresh = await BearerRelayOwner.create(user2)
      await fresh.addWriter()

      for (const inbox of [unlinked, fresh]) {
        expect((await signedSync(inbox)).status).toBe(200)
        expect((await signedBlobPut(inbox)).status).toBe(200)
        expect((await signedLive(inbox)).status).toBe(101)
      }
    })
  }
)
