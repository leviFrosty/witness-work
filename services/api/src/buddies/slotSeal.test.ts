import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DAY_MS,
  Owner,
  SigningKey,
  Writer,
  blobOfSize,
  createHarness,
  envelope,
  randomId,
  relayError,
  type Harness,
} from '../test/buddies'
import { bearer, openTestSession } from '../test/accounts'
import { createAccountsRoutes } from '../accounts/route'
import { createAccountsAdminRoutes } from '../accounts/admin'
import { resetAccountStatusCache } from '../accounts/auth'
import type { BuddiesSignedOp } from './contracts'
import { BUDDIES_ABUSE_LIMITS as ABUSE } from './limits'
import { verifyBuddiesSignature } from './envelope'

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

// Lets the race test hold one signature check open.
vi.mock('./envelope', async (original) => {
  const actual = await original<typeof import('./envelope')>()
  return {
    ...actual,
    verifyBuddiesSignature: vi.fn(actual.verifyBuddiesSignature),
  }
})

/**
 * `slot/seal` (witness-work ADR 0039 §5): a writer seals its own slot, after
 * which every writer op from it but `slot/leave` is 403 `sealed`, bearer or
 * legacy. The owner still reads and removes it; nothing unseals it.
 */

const START = Date.UTC(2026, 9, 30, 12)
const ADMIN_TOKEN = 'admin-secret-for-tests'
const accountsApp = createAccountsRoutes() as never
const adminApp = createAccountsAdminRoutes() as never

let h: Harness

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  resetAccountStatusCache()
  h = await createHarness()
  h.env.ADMIN_API_TOKEN = ADMIN_TOKEN
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const SEALED = { status: 403, body: relayError('sealed') }

/** A writer op as a bearer request: the writer-signed envelope plus a token. */
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

const eventFields = () => ({
  eventId: randomId(),
  kind: 'plan.joined',
  blob: blobOfSize(48),
  push: false,
})

const anyToken = async () =>
  bearer((await openTestSession(accountsApp, h.env)).accessToken)

const suspend = async (accountId: string) => {
  const response = await adminApp.request(
    '/status',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ww-admin-token': ADMIN_TOKEN,
      },
      body: JSON.stringify({ accountId, status: 'suspended', reason: 'report' }),
    },
    h.env
  )
  expect(response.status).toBe(200)
  resetAccountStatusCache()
}

describe('slot/seal', () => {
  it('seals the writer’s own slot, idempotently, in either form', async () => {
    const owner = await Owner.create(h)
    const writer = await owner.addWriter()
    const other = await owner.addWriter()

    expect(await writer.send('slot/seal')).toEqual({
      status: 200,
      body: { ok: true },
    })
    expect(await writer.send('slot/seal')).toEqual({
      status: 200,
      body: { ok: true },
    })
    expect(await writerSend(writer, 'slot/seal', {}, await anyToken())).toEqual({
      status: 200,
      body: { ok: true },
    })

    // Only that slot, and the owner sees which.
    const { slots } = (await owner.sync()).body
    expect(slots).toHaveLength(2)
    expect(slots).toEqual(
      expect.arrayContaining([
        { slotId: writer.slotId, createdAt: START, sealed: true },
        { slotId: other.slotId, createdAt: START },
      ])
    )
    expect((await other.putCard()).status).toBe(200)
  })

  it('refuses card/put and event/put from a sealed slot, legacy and bearer', async () => {
    const owner = await Owner.create(h)
    const writer = await owner.addWriter()
    await writer.putCard()
    const kept = eventFields()
    await writer.putEvent(kept)
    expect((await writer.send('slot/seal')).status).toBe(200)
    const token = await anyToken()

    expect(await writer.putCard()).toEqual(SEALED)
    expect(await writer.putEvent()).toEqual(SEALED)
    expect(
      await writerSend(writer, 'card/put', { blob: blobOfSize(64) }, token)
    ).toEqual(SEALED)
    expect(await writerSend(writer, 'event/put', eventFields(), token)).toEqual(
      SEALED
    )
    // A retry of an event that landed before the seal is refused too.
    expect(await writer.putEvent(kept)).toEqual(SEALED)

    // What landed before stays readable by the owner.
    const sync = (await owner.sync()).body
    expect(sync.cards).toHaveLength(1)
    expect(sync.events.map((e: { eventId: string }) => e.eventId)).toEqual([
      kept.eventId,
    ])
  })

  it('refuses a sealed slot’s writes with the kill switch off too, and seals then', async () => {
    const owner = await Owner.create(h)
    const writer = await owner.addWriter()
    await h.kv.put('buddies:enabled', 'false')
    expect((await writer.send('slot/seal')).body).toEqual({ ok: true })
    await h.kv.put('buddies:enabled', 'true')
    expect(await writer.putCard()).toEqual(SEALED)
  })

  it('lets a suspended account seal (a bearer write from it is refused anyway)', async () => {
    const owner = await Owner.create(h)
    const writer = await owner.addWriter()
    const holder = await openTestSession(accountsApp, h.env)
    await suspend(holder.accountId)
    const as = bearer(holder.accessToken)

    expect(
      await writerSend(writer, 'card/put', { blob: blobOfSize(64) }, as)
    ).toEqual({ status: 403, body: relayError('suspended') })
    expect(await writerSend(writer, 'slot/seal', {}, as)).toEqual({
      status: 200,
      body: { ok: true },
    })
    expect(await writer.putCard()).toEqual(SEALED)
  })

  it('seals a slot in an inbox from before the column', async () => {
    const owner = await Owner.create(h)
    const writer = await owner.addWriter()
    const storage = h.inboxes.storage(owner.inboxId)
    storage.query('ALTER TABLE slot DROP COLUMN sealed')
    h.inboxes.restart(owner.inboxId)

    expect((await owner.sync()).body.slots).toEqual([
      { slotId: writer.slotId, createdAt: START },
    ])
    expect((await writer.send('slot/seal')).status).toBe(200)
    expect(await writer.putEvent()).toEqual(SEALED)
    expect((await owner.sync()).body.slots).toEqual([
      { slotId: writer.slotId, createdAt: START, sealed: true },
    ])
  })

  it('still lets the writer leave, and the owner remove, a sealed slot', async () => {
    const owner = await Owner.create(h)
    const leaving = await owner.addWriter()
    const removed = await owner.addWriter()
    const kept = eventFields()
    await leaving.putEvent(kept)
    await removed.putEvent()
    for (const writer of [leaving, removed])
      expect((await writer.send('slot/seal')).status).toBe(200)

    expect(await leaving.send('slot/leave')).toEqual({
      status: 200,
      body: { ok: true },
    })
    expect(
      (await owner.send('slot/remove', { slotId: removed.slotId })).body
    ).toEqual({ ok: true })
    const sync = (await owner.sync()).body
    expect(sync.slots).toEqual([])
    // Leaving a sealed slot keeps its events; the owner's remove doesn't.
    expect(sync.events.map((e: { eventId: string }) => e.eventId)).toEqual([
      kept.eventId,
    ])

    // Nothing left to seal; a slot added again under the same id starts open.
    expect(await removed.send('slot/seal')).toEqual({
      status: 410,
      body: relayError('gone'),
    })
    const again = await owner.addWriter(removed.slotId)
    expect((await again.putCard()).status).toBe(200)
  })

  it('keeps a sealed slot’s events readable after it’s left, until they expire', async () => {
    const owner = await Owner.create(h)
    const sealedSlot = await owner.addWriter()
    const open = await owner.addWriter()
    // The reconnect invite, then whoever holds the writer key leaves at once.
    const reconnect = { ...eventFields(), kind: 'pair.reconnect' }
    await sealedSlot.putCard()
    await sealedSlot.putEvent(reconnect)
    await open.putEvent()
    expect((await sealedSlot.send('slot/seal')).status).toBe(200)
    expect((await sealedSlot.send('slot/leave')).body).toEqual({ ok: true })
    expect((await sealedSlot.send('slot/leave')).body).toEqual({ ok: true })

    // The slot is gone for writes; its card goes; its events stay.
    expect(await sealedSlot.putEvent()).toEqual({
      status: 410,
      body: relayError('gone'),
    })
    let sync = (await owner.sync()).body
    expect(sync.slots).toEqual([{ slotId: open.slotId, createdAt: START }])
    expect(sync.cards).toEqual([])
    expect(
      sync.events.filter((e: { slotId: string }) => e.slotId === sealedSlot.slotId)
    ).toEqual([
      expect.objectContaining({ eventId: reconnect.eventId, kind: 'pair.reconnect' }),
    ])
    // An unsealed slot's leave still takes its events with it.
    expect((await open.send('slot/leave')).body).toEqual({ ok: true })
    sync = (await owner.sync()).body
    expect(sync.events.map((e: { eventId: string }) => e.eventId)).toEqual([
      reconnect.eventId,
    ])

    // They expire like any event, and their usage row goes with them.
    vi.setSystemTime(START + 30 * DAY_MS + 1)
    await h.inboxes.fireAlarm(owner.inboxId)
    expect((await owner.sync()).body.events).toEqual([])
    expect(
      h.inboxes.storage(owner.inboxId).query('SELECT slot_id FROM slot_usage')
    ).toEqual([])
  })

  it('starts a slot id added again after a sealed leave open, with the kept events in it', async () => {
    const owner = await Owner.create(h)
    const first = await owner.addWriter()
    const kept = eventFields()
    await first.putEvent(kept)
    await first.send('slot/seal')
    await first.send('slot/leave')

    const again = await owner.addWriter(first.slotId)
    const fresh = eventFields()
    expect((await again.putEvent(fresh)).status).toBe(200)
    let sync = (await owner.sync()).body
    expect(sync.slots).toEqual([{ slotId: first.slotId, createdAt: START }])
    expect(sync.events.map((e: { eventId: string }) => e.eventId)).toEqual([
      kept.eventId,
      fresh.eventId,
    ])
    // The kept events count toward the slot again.
    expect(
      h.inboxes
        .storage(owner.inboxId)
        .query('SELECT events FROM slot_usage WHERE slot_id = ?', first.slotId)
    ).toEqual([{ events: 2 }])
    // Leaving it open now takes every event under the id.
    expect((await again.send('slot/leave')).body).toEqual({ ok: true })
    sync = (await owner.sync()).body
    expect(sync.events).toEqual([])
  })

  it('lets the owner clear a left sealed slot’s events with slot/remove', async () => {
    const owner = await Owner.create(h)
    const writer = await owner.addWriter()
    await writer.putEvent()
    await writer.send('slot/seal')
    await writer.send('slot/leave')
    expect((await owner.sync()).body.events).toHaveLength(1)
    expect(
      (await owner.send('slot/remove', { slotId: writer.slotId })).body
    ).toEqual({ ok: true })
    expect((await owner.sync()).body.events).toEqual([])
  })

  it('refuses a seal the slot’s writer key didn’t sign, and one for an unknown inbox', async () => {
    const owner = await Owner.create(h)
    const writer = await owner.addWriter()
    const stranger = await SigningKey.generate()

    expect(
      await writerSend(writer, 'slot/seal', {}, await anyToken(), stranger)
    ).toEqual({ status: 401, body: relayError('bad_signature') })
    expect(
      await h.send('slot/seal', stranger, {
        inboxId: owner.inboxId,
        slotId: writer.slotId,
      })
    ).toEqual({ status: 401, body: relayError('bad_signature') })
    // The owner key can't seal a buddy's slot either.
    expect(
      await h.send('slot/seal', owner.key, {
        inboxId: owner.inboxId,
        slotId: writer.slotId,
      })
    ).toEqual({ status: 401, body: relayError('bad_signature') })
    expect(
      await h.send('slot/seal', writer.key, {
        inboxId: randomId(),
        slotId: writer.slotId,
      })
    ).toEqual({ status: 404, body: relayError('not_found') })

    expect((await owner.sync()).body.slots).toEqual([
      { slotId: writer.slotId, createdAt: START },
    ])
    expect((await writer.putCard()).status).toBe(200)
  })

  it('seals an open slot even when its writer budget is spent, but not again', async () => {
    const owner = await Owner.create(h)
    const writer = await owner.addWriter()
    // Whoever holds the writer key spends the slot's budget with repeats
    // of one event (each takes effect, so each counts).
    const repeat = eventFields()
    for (let i = 0; i < ABUSE.writerRequests; i++) {
      // Past the per-caller edge limit's minute, inside the budget's window.
      if (i % 500 === 499) vi.setSystemTime(Date.now() + 61_000)
      expect((await writer.putEvent(repeat)).status).toBe(200)
    }
    expect(await writer.putEvent(repeat)).toMatchObject({
      status: 429,
      body: { error: 'rate_limited' },
    })

    expect(await writerSend(writer, 'slot/seal', {}, await anyToken())).toEqual({
      status: 200,
      body: { ok: true },
    })
    expect((await owner.sync()).body.slots).toEqual([
      { slotId: writer.slotId, createdAt: START, sealed: true },
    ])
    // Re-seals keep the budget, so the nonce table stays bounded.
    expect((await writer.send('slot/seal')).status).toBe(429)
  })

  it('refuses a replayed seal like any signed op', async () => {
    const owner = await Owner.create(h)
    const writer = await owner.addWriter()
    const signed = await envelope(
      'slot/seal',
      {
        inboxId: owner.inboxId,
        slotId: writer.slotId,
        ts: Date.now(),
        nonce: randomId(),
      },
      writer.key
    )
    expect((await h.post('/slot/seal', signed)).status).toBe(200)
    expect(await h.post('/slot/seal', signed)).toEqual({
      status: 409,
      body: relayError('replay'),
    })
  })

  it('a write racing the seal either lands before it or is refused', async () => {
    const owner = await Owner.create(h)
    const writer = await owner.addWriter()
    const verify = vi.mocked(verifyBuddiesSignature)
    const real = verify.getMockImplementation()!

    // The write's signature check is held until the seal has committed: it
    // must then be refused, though it verified.
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    let started!: () => void
    const checking = new Promise<void>((resolve) => (started = resolve))
    verify.mockImplementationOnce(async (...args) => {
      started()
      await held
      return real(...args)
    })
    const late = eventFields()
    const write = writer.putEvent(late)
    await checking
    expect((await writer.send('slot/seal')).status).toBe(200)
    release()
    expect(await write).toEqual(SEALED)

    // A write that commits first lands, and the seal after it holds.
    const other = await owner.addWriter()
    const early = eventFields()
    expect((await other.putEvent(early)).status).toBe(200)
    expect((await other.send('slot/seal')).status).toBe(200)
    expect(await other.putEvent()).toEqual(SEALED)

    const ids = (await owner.sync()).body.events.map(
      (e: { eventId: string }) => e.eventId
    )
    expect(ids).toEqual([early.eventId])
  })

  it('keeps nothing new: the slot row gains only its sealed flag', async () => {
    const owner = await Owner.create(h)
    const writer = await owner.addWriter()
    await writerSend(writer, 'slot/seal', {}, await anyToken())
    const storage = h.inboxes.storage(owner.inboxId)
    expect(
      storage.query('SELECT * FROM slot WHERE slot_id = ?', writer.slotId)
    ).toEqual([
      {
        slot_id: writer.slotId,
        writer_pub: writer.key.publicKey,
        created_at: START,
        sealed: 1,
      },
    ])
    // The inbox still knows no account but its owner's (none here).
    expect(storage.tables()).not.toContain('owner_account')
  })
})
