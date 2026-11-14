import { afterAll, describe, expect, it } from 'vitest'
import {
  SigningKey,
  b64u,
  blobOfSize,
  envelope,
  randomBytes,
  randomId,
  relayError,
} from '../test/buddiesClient'
import { accountSignedMessage, rekeyNewKeyMessage } from '../accounts/contracts'
import {
  BearerRelayOwner,
  DEV_BYPASS_TOKEN,
  LOCAL_LAUNCHER,
  bearerHeaders,
  http,
  openSession,
  sendWriter,
  writeTranscript,
  type E2ESession,
  type RelayWriter,
} from '../test/e2e'
import type { BuddiesSignedOp } from '../buddies/contracts'

/**
 * A buddies writer seals its slot (witness-work ADR 0039 §5), over real HTTP.
 * The User's writer keys into each buddy's inbox derive from the account
 * key, and writer ops are authorized by the writer signature alone: a bearer
 * token's account is never compared with the slot, and a legacy request has
 * none. So after a key change, whoever holds the old key keeps writing into
 * the buddy's inbox as the User, with a session on an account of their own
 * or no token at all while `auth:legacy` is on, until the User's device
 * leaves the slot. Once the User's device seals it (`slot/seal`), every
 * writer op from it but `slot/leave` is 403 `sealed`, bearer or legacy;
 * the buddy still reads what's there and can remove it. Writes
 * `.verify/artifacts/e2e-slot-seal-*.json`.
 */

afterAll(() => {
  writeTranscript('slot-seal')
})

const encoder = new TextEncoder()
const SEALED = relayError('sealed')

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

/** A writer op with no `Authorization` header: the legacy form. */
const legacyWriter = async (
  writer: RelayWriter,
  op: BuddiesSignedOp,
  fields: Record<string, unknown> = {}
) =>
  http('POST', `/buddies/v1/${op}`, {
    body: await envelope(
      op,
      {
        inboxId: writer.inboxId,
        slotId: writer.slotId,
        ts: Date.now(),
        nonce: randomId(),
        ...fields,
      },
      writer.key
    ),
  })

const eventFields = () => ({
  eventId: randomId(),
  kind: 'note.shared',
  blob: blobOfSize(64),
  push: false,
})

/**
 * Account A's User and their buddy B, paired: B's inbox has a slot whose
 * writer key A's device holds (derived from A's account key, K1). The thief
 * holds K1, so the same writer key, and a session on an account C of their
 * own. A then changes the account key.
 */
const pairThenRekey = async () => {
  const a = await openSession()
  const b = await BearerRelayOwner.create()
  const writer = await b.addWriter()
  expect((await sendWriter(writer, 'card/put', { blob: blobOfSize(64) }, bearerHeaders(a))).status).toBe(200)
  const a2 = await rekey(a)
  // A's old sessions are over (ww-api #73).
  const ended = await http('GET', '/accounts/v1/account', { headers: bearerHeaders(a) })
  expect(ended.status).toBe(401)
  const c = await openSession()
  return { a2, b, writer, c }
}

const eventIds = async (b: BearerRelayOwner): Promise<string[]> => {
  const sync = await b.sync()
  expect(sync.status).toBe(200)
  return sync.body.events.map((event: { eventId: string }) => event.eventId)
}

describe.skipIf(!DEV_BYPASS_TOKEN || !LOCAL_LAUNCHER)(
  'a writer slot after a key change, on the local worker',
  () => {
    it('lets the old key’s holder write into a buddy’s inbox as the User until the User seals the slot', async () => {
      const { a2, b, writer, c } = await pairThenRekey()

      // The gap: with a session on their own account C, or no token while
      // the legacy switch is on, the K1 holder still writes as the User.
      const bearer = eventFields()
      const viaC = await sendWriter(writer, 'event/put', bearer, bearerHeaders(c))
      expect(viaC.status).toBe(200)
      const legacy = eventFields()
      expect((await legacyWriter(writer, 'event/put', legacy)).status).toBe(200)
      expect(await eventIds(b)).toEqual(
        expect.arrayContaining([bearer.eventId, legacy.eventId])
      )

      // The fix: once the User's device seals the slot, the same writes are
      // refused, and nothing more lands.
      expect((await sendWriter(writer, 'slot/seal', {}, bearerHeaders(a2))).status).toBe(200)
      const late = [eventFields(), eventFields()]
      const lateViaC = await sendWriter(writer, 'event/put', late[0], bearerHeaders(c))
      expect({ status: lateViaC.status, body: lateViaC.body }).toEqual({ status: 403, body: SEALED })
      const lateLegacy = await legacyWriter(writer, 'event/put', late[1])
      expect({ status: lateLegacy.status, body: lateLegacy.body }).toEqual({ status: 403, body: SEALED })
      expect(await eventIds(b)).not.toEqual(
        expect.arrayContaining([late[0].eventId])
      )
      expect(await eventIds(b)).not.toEqual(
        expect.arrayContaining([late[1].eventId])
      )
    })

    it('refuses every writer op from a sealed slot but leaving, bearer or legacy', async () => {
      const { a2, b, writer, c } = await pairThenRekey()
      const before = eventFields()
      expect((await sendWriter(writer, 'event/put', before, bearerHeaders(c))).status).toBe(200)

      // The User's device seals the slot with its new session.
      const seal = await sendWriter(writer, 'slot/seal', {}, bearerHeaders(a2))
      expect(seal.status).toBe(200)
      expect(seal.body).toEqual({ ok: true })
      // Idempotent, in either form.
      expect((await sendWriter(writer, 'slot/seal', {}, bearerHeaders(a2))).body).toEqual({ ok: true })
      expect((await legacyWriter(writer, 'slot/seal')).body).toEqual({ ok: true })

      const attempts = [
        ['event/put', eventFields()],
        ['card/put', { blob: blobOfSize(64) }],
      ] as const
      for (const [op, fields] of attempts) {
        const viaC = await sendWriter(writer, op, fields, bearerHeaders(c))
        expect({ op, form: 'bearer', status: viaC.status, body: viaC.body }).toEqual({
          op,
          form: 'bearer',
          status: 403,
          body: SEALED,
        })
        const legacy = await legacyWriter(writer, op, fields)
        expect({ op, form: 'legacy', status: legacy.status, body: legacy.body }).toEqual({
          op,
          form: 'legacy',
          status: 403,
          body: SEALED,
        })
      }

      // The buddy still reads what's there, and sees the slot sealed.
      const sync = await b.sync()
      expect(sync.status).toBe(200)
      expect(sync.body.slots).toEqual([
        { slotId: writer.slotId, createdAt: expect.any(Number), sealed: true },
      ])
      expect(sync.body.events.map((e: { eventId: string }) => e.eventId)).toContain(
        before.eventId
      )
      expect(sync.body.cards).toEqual([
        expect.objectContaining({ slotId: writer.slotId }),
      ])

      // Leaving still works, even by the thief before B has read anything,
      // but a sealed slot's events stay for B until they expire: leaving
      // first can't delete a reconnect invite. The card goes.
      expect((await legacyWriter(writer, 'slot/leave')).status).toBe(200)
      expect((await sendWriter(writer, 'slot/leave', {}, bearerHeaders(a2))).status).toBe(200)
      const left = await b.sync()
      expect(left.body.slots).toEqual([])
      expect(left.body.cards).toEqual([])
      expect(left.body.events.map((e: { eventId: string }) => e.eventId)).toContain(
        before.eventId
      )
      const gone = await sendWriter(writer, 'event/put', eventFields(), bearerHeaders(c))
      expect({ status: gone.status, body: gone.body }).toEqual({ status: 410, body: relayError('gone') })
      // B can still clear them by removing the slot id.
      expect((await b.op('slot/remove', { slotId: writer.slotId })).status).toBe(200)
      expect((await b.sync()).body.events).toEqual([])
    })

    it('seals even after the old key’s holder spent the slot’s writer budget', async () => {
      const { a2, b, writer } = await pairThenRekey()
      const repeat = eventFields()
      const statuses: Record<number, number> = {}
      for (let i = 0; i < 1_020; i += 51) {
        const batch = await Promise.all(
          Array.from({ length: 51 }, () => legacyWriter(writer, 'event/put', repeat))
        )
        for (const r of batch) statuses[r.status] = (statuses[r.status] ?? 0) + 1
      }
      // The budget (1,000 per 10 minutes) is spent; the edge limit isn't hit.
      expect(statuses[429]).toBeGreaterThan(0)
      const starved = await legacyWriter(writer, 'event/put', eventFields())
      expect({ status: starved.status, error: starved.body.error }).toEqual({
        status: 429,
        error: 'rate_limited',
      })

      const seal = await sendWriter(writer, 'slot/seal', {}, bearerHeaders(a2))
      expect({ status: seal.status, body: seal.body }).toEqual({ status: 200, body: { ok: true } })
      expect((await b.sync()).body.slots).toEqual([
        { slotId: writer.slotId, createdAt: expect.any(Number), sealed: true },
      ])
    })

    it('leaves the buddy’s own slot/remove working on a sealed slot', async () => {
      const { a2, b, writer } = await pairThenRekey()
      expect((await legacyWriter(writer, 'slot/seal')).status).toBe(200)
      expect((await b.op('slot/remove', { slotId: writer.slotId })).status).toBe(200)
      expect((await b.sync()).body.slots).toEqual([])
      // Gone now: sealing again finds no slot.
      const again = await sendWriter(writer, 'slot/seal', {}, bearerHeaders(a2))
      expect(again.status).toBe(410)
      expect(again.body).toEqual(relayError('gone'))
    })

    it('refuses a seal the slot’s writer key didn’t sign', async () => {
      const { a2, b, writer } = await pairThenRekey()
      const forged = await sendWriter(
        { ...writer, key: await SigningKey.generate() } as RelayWriter,
        'slot/seal',
        {},
        bearerHeaders(a2)
      )
      expect(forged.status).toBe(401)
      expect(forged.body).toEqual(relayError('bad_signature'))
      expect((await b.sync()).body.slots).toEqual([
        { slotId: writer.slotId, createdAt: expect.any(Number) },
      ])
      expect((await legacyWriter(writer, 'event/put', eventFields())).status).toBe(200)
    })
  }
)
