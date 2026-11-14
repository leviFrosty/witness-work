import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DAY_MS,
  Owner,
  SigningKey,
  blobOfSize,
  createHarness,
  envelope,
  inviteSecrets,
  liveHeaders,
  randomId,
  unsignedEnvelope,
  relayError,
  type Harness,
} from '../test/buddies'

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
 * `GET inbox/live`: the owner's hibernatable socket. It carries only `hello`
 * and `changed` signals with the inbox `seq`; the app then runs `inbox/sync`.
 */

const START = Date.UTC(2026, 8, 23, 12)
const MINUTE_MS = 60_000
const OPEN = 1
const CLOSED = 3

const advance = (ms: number) => vi.setSystemTime(Date.now() + ms)

let h: Harness

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  h = await createHarness()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const error = (status: number, code: string) => ({
  status,
  body: relayError(code),
  socket: null,
  protocol: null,
})

/** Opens a socket and returns its client end. */
const connect = async (owner: Owner) => {
  const live = await owner.connect()
  expect(live.status).toBe(101)
  return live.socket!
}

/** Signals after the `hello`. */
const signals = (socket: { messages(): unknown[] }) =>
  socket.messages().slice(1)

const changed = (seq: number) => ({ type: 'changed', seq })

const createInvite = async (owner: Owner) => {
  const secrets = await inviteSecrets()
  await owner.send('invite/create', {
    inviteId: secrets.inviteId,
    claimVerifier: secrets.claimVerifier,
    blob: blobOfSize(64),
    expiresAt: Date.now() + DAY_MS,
  })
  return secrets
}

describe('opening a live socket', () => {
  it('accepts the owner and says hello with the inbox seq', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    await buddy.putCard()
    await buddy.putEvent()

    const socket = await connect(owner)

    expect(socket.messages()).toEqual([{ type: 'hello', seq: 2 }])
    expect((await owner.sync()).body.seq).toBe(2)
  })

  it('rejects bad auth with the usual error codes and never upgrades', async () => {
    const owner = await Owner.create(h)
    const stranger = await SigningKey.generate()
    const fields = (extra: Record<string, unknown> = {}) => ({
      inboxId: owner.inboxId,
      ts: Date.now(),
      nonce: randomId(),
      ...extra,
    })

    expect(await h.live(await liveHeaders(fields(), stranger))).toEqual(
      error(401, 'bad_signature')
    )
    expect(await owner.connect({ ts: Date.now() - 6 * MINUTE_MS })).toEqual(
      error(401, 'stale')
    )
    expect(await owner.connect({ ts: Date.now() + 6 * MINUTE_MS })).toEqual(
      error(401, 'stale')
    )

    const headers = await liveHeaders(fields(), owner.key)
    expect((await h.live(headers)).status).toBe(101)
    expect(await h.live(headers)).toEqual(error(409, 'replay'))

    const unknown = randomId()
    expect(
      await h.live(await liveHeaders(fields({ inboxId: unknown }), stranger))
    ).toEqual(error(404, 'not_found'))
    expect(h.inboxes.storage(unknown).tables()).toEqual([])

    // A signature over the same payload for another op doesn't open a socket.
    const sync = await envelope('inbox/sync', fields(), owner.key)
    expect(
      await h.live({
        upgrade: 'websocket',
        'x-buddies-payload': sync.payload,
        'x-buddies-signature': sync.signature!,
      })
    ).toEqual(error(401, 'bad_signature'))

    const fresh = await liveHeaders(fields(), owner.key)
    const { 'x-buddies-signature': _signature, ...unsigned } = fresh
    expect(await h.live(unsigned)).toEqual(error(401, 'bad_signature'))
    expect(await h.live({ ...fresh, 'x-buddies-signature': 'x' })).toEqual(
      error(401, 'bad_signature')
    )
    expect(await h.live({ upgrade: 'websocket' })).toEqual(
      error(400, 'bad_request')
    )
    expect(await h.live({ ...fresh, 'x-buddies-payload': '!!' })).toEqual(
      error(400, 'bad_request')
    )
    expect(await owner.connect({ inboxId: 'short' })).toEqual(
      error(400, 'bad_request')
    )

    // Older builds send the short header names; they still open a socket.
    const legacy = await envelope('inbox/live', fields(), owner.key)
    expect(
      (
        await h.live({
          upgrade: 'websocket',
          'x-buddies-p': legacy.payload,
          'x-buddies-s': legacy.signature!,
        })
      ).status
    ).toBe(101)

    // Only the two good attempts got a socket.
    expect(h.inboxes.storage(owner.inboxId).sockets()).toHaveLength(2)
  })

  it('needs a GET WebSocket upgrade', async () => {
    const owner = await Owner.create(h)
    const headers = await liveHeaders(
      { inboxId: owner.inboxId, ts: Date.now(), nonce: randomId() },
      owner.key
    )
    const { upgrade: _upgrade, ...plain } = headers

    expect(await h.live(plain)).toEqual(error(426, 'upgrade_required'))
    expect(await h.live({ ...plain, upgrade: 'h2c' })).toEqual(
      error(426, 'upgrade_required')
    )
    // Not a POST op.
    expect((await h.live(headers, 'POST')).status).toBe(404)
    // Refused before reaching the inbox, so the nonce is still unused.
    expect((await h.live(headers)).status).toBe(101)
  })

  it('is off with the kill switch', async () => {
    const owner = await Owner.create(h)
    const headers = await liveHeaders(
      { inboxId: owner.inboxId, ts: Date.now(), nonce: randomId() },
      owner.key
    )

    await h.kv.put('buddies:enabled', 'false')
    expect(await h.live(headers)).toEqual(error(503, 'disabled'))
    const { upgrade: _upgrade, ...plain } = headers
    expect(await h.live(plain)).toEqual(error(503, 'disabled'))

    await h.kv.delete('buddies:enabled')
    expect((await h.live(headers)).status).toBe(101)
  })

  it('is not owner activity for the 180-day retention', async () => {
    const owner = await Owner.create(h)
    advance(DAY_MS)
    await connect(owner)
    expect(
      h.inboxes
        .storage(owner.inboxId)
        .query('SELECT last_active_at AS at FROM meta')
    ).toEqual([{ at: START }])
  })
})

describe('changed signals', () => {
  it('follow every write that changes what inbox/sync returns', async () => {
    const owner = await Owner.create(h)
    const socket = await connect(owner)
    const second = await connect(owner)

    const buddy = await owner.addWriter()
    await buddy.putCard()
    await buddy.putEvent()
    await owner.send('roster/put', { blob: blobOfSize(100) })
    const invite = await createInvite(owner)
    await h.post(
      '/invite/claim',
      unsignedEnvelope({
        inviteId: invite.inviteId,
        claimSecret: invite.claimSecret,
        blob: blobOfSize(64),
      })
    )
    await owner.send('slot/remove', { slotId: buddy.slotId })
    const leaver = await owner.addWriter()
    await leaver.send('slot/leave')

    const expected = [
      changed(0), // slot/add
      changed(1), // card/put
      changed(2), // event/put
      changed(3), // roster/put
      changed(4), // invite.claimed
      changed(4), // slot/remove (slots don't advance seq)
      changed(4), // slot/add
      changed(4), // slot/leave
    ]
    expect(signals(socket)).toEqual(expected)
    expect(signals(second)).toEqual(expected)
    expect((await owner.sync()).body.seq).toBe(4)
  })

  it('stay quiet for writes that change nothing inbox/sync returns', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    const eventId = randomId()
    await buddy.putEvent({ eventId })
    const socket = await connect(owner)

    await buddy.putEvent({ eventId }) // deduped
    await owner.sync()
    const deviceId = randomId()
    await owner.registerDevice(deviceId)
    await owner.send('device/unregister', { deviceId })
    const invite = await createInvite(owner)
    await owner.send('invite/delete', { inviteId: invite.inviteId })
    await owner.send('slot/remove', { slotId: randomId() })
    await owner.send('slot/add', {
      slotId: buddy.slotId,
      writerPub: buddy.key.publicKey,
    })
    // Rejected writes.
    const stranger = await SigningKey.generate()
    await h.send('card/put', stranger, {
      inboxId: owner.inboxId,
      slotId: buddy.slotId,
      blob: blobOfSize(10),
    })
    await h.send('roster/put', stranger, {
      inboxId: owner.inboxId,
      blob: blobOfSize(10),
    })
    await connect(owner)

    expect(signals(socket)).toEqual([])
  })

  it('never fail the write when a socket cannot send', async () => {
    const owner = await Owner.create(h)
    const first = await connect(owner)
    const second = await connect(owner)
    const [broken] = h.inboxes.storage(owner.inboxId).sockets()
    broken.send = () => {
      throw new Error('socket gone')
    }

    const buddy = await owner.addWriter()
    expect((await buddy.putCard()).body).toEqual({ ok: true, seq: 1 })

    expect(signals(first)).toEqual([])
    expect(signals(second)).toEqual([changed(0), changed(1)])
  })
})

describe('closing', () => {
  it('closes every socket with 4001 gone when the inbox is deleted', async () => {
    const owner = await Owner.create(h)
    const sockets = [await connect(owner), await connect(owner)]

    expect((await owner.send('inbox/delete')).body).toEqual({ ok: true })

    for (const socket of sockets) {
      expect(socket.closedBy).toEqual({ code: 4001, reason: 'gone' })
      expect(socket.readyState).toBe(CLOSED)
    }
    expect(await owner.connect()).toEqual(error(404, 'not_found'))
  })

  it('closes them after the 180-day inactivity wipe too', async () => {
    const owner = await Owner.create(h)
    const socket = await connect(owner)

    advance(180 * DAY_MS)
    await h.inboxes.fireAlarm(owner.inboxId)

    expect(socket.closedBy).toEqual({ code: 4001, reason: 'gone' })
    expect(h.inboxes.storage(owner.inboxId).tables()).toEqual([
      'owner_tombstone',
    ])
  })

  it('keeps 10 sockets per inbox, replacing the oldest with 4002', async () => {
    const owner = await Owner.create(h)
    const sockets = []
    for (let i = 0; i < 12; i++) {
      sockets.push(await connect(owner))
      advance(1_000)
    }

    for (const socket of sockets.slice(0, 2)) {
      expect(socket.closedBy).toEqual({ code: 4002, reason: 'replaced' })
      expect(socket.readyState).toBe(CLOSED)
    }
    const open = sockets.slice(2)
    expect(open.every((socket) => socket.readyState === OPEN)).toBe(true)
    expect(
      h.inboxes.storage(owner.inboxId).state.getWebSockets()
    ).toHaveLength(10)

    await owner.addWriter()
    expect(sockets[0].received).toHaveLength(1)
    for (const socket of open) expect(signals(socket)).toEqual([changed(0)])
  })

  it('completes a close the client starts and stops signalling that socket', async () => {
    const owner = await Owner.create(h)
    const leaving = await connect(owner)
    const staying = await connect(owner)

    leaving.close(1000, 'background')
    expect(leaving.readyState).toBe(CLOSED)
    const [server] = h.inboxes.storage(owner.inboxId).sockets()
    expect(server.readyState).toBe(CLOSED)

    await owner.addWriter()
    expect(signals(leaving)).toEqual([])
    expect(signals(staying)).toEqual([changed(0)])
  })
})

describe('keepalive', () => {
  it('answers ping with pong without waking the inbox, and ignores other messages', async () => {
    const owner = await Owner.create(h)
    const socket = await connect(owner)
    const wake = vi.spyOn(h.inboxes.object(owner.inboxId), 'webSocketMessage')

    socket.send('ping')
    expect(socket.received.at(-1)).toBe('pong')
    expect(wake).not.toHaveBeenCalled()

    socket.send('{"type":"anything"}')
    expect(wake).toHaveBeenCalledTimes(1)
    expect(socket.received).toEqual(['{"type":"hello","seq":0}', 'pong'])
    expect(socket.readyState).toBe(OPEN)
  })
})
