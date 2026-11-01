import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createLiveInbox,
  type LiveEvent,
} from '@/features/buddies/lib/liveInbox'
import {
  createRelayClient,
  type LiveSocket,
} from '@/features/buddies/lib/relay'
import {
  ownerAuthFor,
  random,
  RELAY_URL,
  setup as relaySetup,
} from '@/features/buddies/lib/testing/engineHarness'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

type FakeSocket = LiveSocket & { sent: string[]; closed: boolean }

function fakeSocket(): FakeSocket {
  const socket: FakeSocket = {
    sent: [],
    closed: false,
    send: (data) => socket.sent.push(data),
    close: () => {
      if (socket.closed) return
      socket.closed = true
      socket.onclose?.({ code: 1000 })
    },
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
  }
  return socket
}

type AndroidSocket = FakeSocket & { open: boolean; closeCalls: number }

function androidSocket(): AndroidSocket {
  const socket: AndroidSocket = {
    ...fakeSocket(),
    open: false,
    closeCalls: 0,
  }
  socket.send = (data) => socket.sent.push(data)
  socket.close = () => {
    socket.closeCalls += 1
    if (!socket.open || socket.closed) return
    socket.closed = true
    socket.onclose?.({ code: 1000 })
  }
  return socket
}

const accept = (socket: AndroidSocket) => {
  socket.open = true
  socket.onopen?.()
}

const refuse = (socket: FakeSocket) => {
  socket.onerror?.({ message: "Expected HTTP 101 response but was '401'" })
  socket.onclose?.({ code: 1006, reason: 'refused' })
}

function setup<Socket extends FakeSocket = FakeSocket>(
  syncedSeq = 5,
  verify?: () => Promise<unknown>,
  makeSocket: () => Socket = fakeSocket as () => Socket
) {
  const sockets: Socket[] = []
  const onChange = vi.fn()
  const events: LiveEvent[] = []
  let fail = false
  const live = createLiveInbox({
    open: async () => {
      if (fail) throw new Error('offline')
      const socket = makeSocket()
      sockets.push(socket)
      return socket
    },
    syncedSeq: () => syncedSeq,
    onChange,
    verify,
    onEvent: (event) => events.push(event),
    now: Date.now,
  })
  const message = (socket: FakeSocket, data: unknown) =>
    socket.onmessage?.({ data: JSON.stringify(data) })
  return {
    live,
    sockets,
    onChange,
    events,
    message,
    setFail: (value: boolean) => {
      fail = value
    },
  }
}

describe('createLiveInbox', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('syncs on connecting only when the inbox moved past this device', async () => {
    const { live, sockets, onChange, message } = setup(5)
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    message(sockets[0], { type: 'hello', seq: 5 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(onChange).not.toHaveBeenCalled()

    sockets[0].close()
    await vi.advanceTimersByTimeAsync(2000)
    message(sockets[1], { type: 'hello', seq: 9 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('syncs once for a burst of changes, always (slot changes keep the seq)', async () => {
    const { live, sockets, onChange, message } = setup()
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    message(sockets[0], { type: 'changed', seq: 5 })
    message(sockets[0], { type: 'changed', seq: 5 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it("passes the hello's seq, so a sync already past it needn't run", async () => {
    const { live, sockets, onChange, message } = setup(5)
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    message(sockets[0], { type: 'hello', seq: 9 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(onChange).toHaveBeenCalledWith(9)
  })

  it('reconnects with backoff and stops for good when stopped', async () => {
    const { live, sockets, setFail } = setup()
    setFail(true)
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(sockets).toHaveLength(0)
    setFail(false)
    await vi.advanceTimersByTimeAsync(1300)
    expect(sockets).toHaveLength(1)

    live.stop()
    expect(sockets[0].closed).toBe(true)
    await vi.advanceTimersByTimeAsync(120 * 1000)
    expect(sockets).toHaveLength(1)
  })

  it('replaces a connection that stops answering pings', async () => {
    const { live, sockets } = setup()
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0].onopen?.()
    await vi.advanceTimersByTimeAsync(25 * 1000)
    expect(sockets[0].sent).toEqual(['ping'])
    sockets[0].onmessage?.({ data: 'pong' })
    await vi.advanceTimersByTimeAsync(25 * 1000)
    expect(sockets[0].closed).toBe(false)

    await vi.advanceTimersByTimeAsync(10 * 1000 + 2000)
    expect(sockets[0].closed).toBe(true)
    expect(sockets).toHaveLength(2)
  })

  it('syncs when the relay closes a wiped inbox, so it is restored', async () => {
    const { live, sockets, onChange } = setup()
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0].onclose?.({ code: 4001 })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('stops reconnecting when the relay closes for a suspended account', async () => {
    const { live, sockets, onChange } = setup()
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0].onclose?.({ code: 4003 })

    expect(onChange).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(120 * 1000)
    expect(sockets).toHaveLength(1)

    live.stop()
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(sockets).toHaveLength(2)
  })

  it('reports what happens on the connection for diagnostics', async () => {
    const { live, sockets, events, message } = setup(5)
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0].onopen?.()
    message(sockets[0], { type: 'hello', seq: 7 })
    await vi.advanceTimersByTimeAsync(1000)
    message(sockets[0], { type: 'changed', seq: 8 })
    await vi.advanceTimersByTimeAsync(1000)
    sockets[0].onclose?.({ code: 4002, reason: 'replaced' })

    expect(events.map((event) => event.type)).toEqual([
      'connecting',
      'open',
      'hello',
      'sync',
      'changed',
      'sync',
      'closed',
      'reconnectScheduled',
    ])
    expect(events[2]).toEqual({ type: 'hello', seq: 7, behind: true })
    expect(events[6]).toEqual({
      type: 'closed',
      code: 4002,
      reason: 'replaced',
    })
    expect(events[7]).toMatchObject({ attempt: 1 })
  })

  it('pings on demand and reports the round trip', async () => {
    const { live, sockets, events } = setup()
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    live.ping()
    expect(sockets[0].sent).toEqual([])

    sockets[0].onopen?.()
    live.ping()
    await vi.advanceTimersByTimeAsync(40)
    sockets[0].onmessage?.({ data: 'pong' })
    expect(sockets[0].sent).toEqual(['ping'])
    expect(events.at(-1)).toEqual({ type: 'pong', rttMs: 40 })
  })

  it('reconnects on demand right away, skipping the backoff', async () => {
    const { live, sockets, events } = setup()
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    live.reconnect()
    await vi.advanceTimersByTimeAsync(0)

    expect(sockets[0].closed).toBe(true)
    expect(sockets).toHaveLength(2)
    expect(events.map((event) => event.type)).not.toContain(
      'reconnectScheduled'
    )
  })

  it('checks the session before reconnecting after a connection closed before it opened', async () => {
    const order: string[] = []
    const verify = vi.fn(async () => {
      order.push('verify')
    })
    const { live, sockets, events } = setup(5, verify)
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    refuse(sockets[0])

    await vi.advanceTimersByTimeAsync(1300)
    expect(verify).toHaveBeenCalledTimes(1)
    expect(sockets).toHaveLength(2)
    expect(events.map((event) => event.type)).toEqual([
      'connecting',
      'closed',
      'reconnectScheduled',
      'connecting',
      'verify',
    ])

    sockets[1].onopen?.()
    sockets[1].onclose?.({ code: 1012 })
    await vi.advanceTimersByTimeAsync(2500)
    expect(sockets).toHaveLength(3)
    expect(verify).toHaveBeenCalledTimes(1)
  })

  it('counts a message as opened, and checks only once per refusal', async () => {
    const verify = vi.fn(async () => undefined)
    const { live, sockets, message } = setup(5, verify)
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    message(sockets[0], { type: 'hello', seq: 5 })
    sockets[0].onclose?.({ code: 1012 })
    await vi.advanceTimersByTimeAsync(1300)
    expect(verify).not.toHaveBeenCalled()

    refuse(sockets[1])
    await vi.advanceTimersByTimeAsync(2500)
    expect(verify).toHaveBeenCalledTimes(1)
    refuse(sockets[2])
    await vi.advanceTimersByTimeAsync(6100)
    expect(verify).toHaveBeenCalledTimes(2)
    expect(sockets).toHaveLength(4)
  })

  it('connects after the check whatever it answers, still backing off', async () => {
    const verify = vi.fn(async () => {
      throw new Error('sync failed')
    })
    const { live, sockets, events } = setup(5, verify)
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    refuse(sockets[0])
    await vi.advanceTimersByTimeAsync(1300)
    expect(sockets).toHaveLength(2)
    expect(events.map((event) => event.type)).not.toContain('openFailed')

    refuse(sockets[1])
    await vi.advanceTimersByTimeAsync(1300)
    expect(sockets).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1200)
    expect(sockets).toHaveLength(3)
    expect(verify).toHaveBeenCalledTimes(2)
  })

  it('closes a dropped connection that opens late, and does nothing else with it', async () => {
    const { live, sockets, events, onChange, message } = setup(
      5,
      undefined,
      androidSocket
    )
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    live.stop()

    expect(sockets[0].closed).toBe(false)
    accept(sockets[0])
    expect(sockets[0].closed).toBe(true)

    message(sockets[0], { type: 'hello', seq: 9 })
    await vi.advanceTimersByTimeAsync(60 * 1000)
    expect(sockets[0].sent).toEqual([])
    expect(onChange).not.toHaveBeenCalled()
    expect(events.map((event) => event.type)).toEqual(['connecting', 'stopped'])
  })

  it('keeps one open connection through quick stops and starts', async () => {
    const { live, sockets, onChange, message } = setup(
      5,
      undefined,
      androidSocket
    )

    for (let i = 0; i < 3; i++) {
      live.start()
      await vi.advanceTimersByTimeAsync(0)
      live.stop()
    }
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(sockets).toHaveLength(4)
    const current = sockets[3]
    accept(current)

    for (const stale of sockets.slice(0, 3)) accept(stale)
    expect(sockets.filter((socket) => !socket.closed)).toEqual([current])

    await vi.advanceTimersByTimeAsync(25 * 1000)
    expect(current.sent).toEqual(['ping'])
    for (const stale of sockets.slice(0, 3)) {
      expect(stale.sent).toEqual([])
      message(stale, { type: 'changed', seq: 9 })
      stale.onmessage?.({ data: 'pong' })
    }
    await vi.advanceTimersByTimeAsync(1000)
    expect(onChange).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(10 * 1000)
    expect(current.closed).toBe(true)
  })

  it('closes a replaced connection that opens late, keeping the new one', async () => {
    const { live, sockets } = setup(5, undefined, androidSocket)
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    live.reconnect()
    await vi.advanceTimersByTimeAsync(0)
    accept(sockets[1])
    accept(sockets[0])
    expect(sockets[0].closed).toBe(true)
    expect(sockets[1].closed).toBe(false)

    await vi.advanceTimersByTimeAsync(25 * 1000)
    expect(sockets[1].sent).toEqual(['ping'])
    expect(sockets).toHaveLength(2)
  })

  it('closes a connection that arrives after stopping, when it opens', async () => {
    let socket: AndroidSocket | null = null
    let deliver = () => {}
    const live = createLiveInbox({
      open: () =>
        new Promise((resolve) => {
          deliver = () => resolve((socket = androidSocket()))
        }),
      syncedSeq: () => 5,
      onChange: vi.fn(),
    })
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    live.stop()
    deliver()
    await vi.advanceTimersByTimeAsync(0)
    accept(socket!)
    expect(socket!.closed).toBe(true)
    await vi.advanceTimersByTimeAsync(60 * 1000)
    expect(socket!.sent).toEqual([])
  })

  it('opens nothing when stopped while checking the session', async () => {
    let finish = () => {}
    const verify = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve))
    )
    const { live, sockets } = setup(5, verify)
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    refuse(sockets[0])
    await vi.advanceTimersByTimeAsync(1300)
    expect(verify).toHaveBeenCalledTimes(1)
    live.stop()
    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(sockets).toHaveLength(1)
  })

  it('opens one connection when restarted while connecting', async () => {
    const { live, sockets } = setup()
    live.start()
    live.stop()
    live.start()
    await vi.advanceTimersByTimeAsync(5000)
    expect(sockets.filter((socket) => !socket.closed)).toHaveLength(1)
  })
})

describe('a live connection the relay refused its token', () => {
  beforeEach(() =>
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    })
  )
  afterEach(() => vi.useRealTimers())

  it('gets a refreshed token through a sync before reconnecting', async () => {
    const h = relaySetup()
    const ann = h.user('Ann')
    await ann.engine.sync()
    const sockets: (FakeSocket & { authorization: string })[] = []
    const client = createRelayClient({
      baseUrl: RELAY_URL,
      randomBytes: random,
      authorize: (run, { signal }) => ann.sessions.withSession(run, { signal }),
      fetchImpl: h.fetchImpl,
      openSocket: (_url, headers) => {
        const socket = Object.assign(fakeSocket(), {
          authorization: headers.authorization,
        })
        sockets.push(socket)

        const accepted = h.fake.acceptsToken(
          headers.authorization.replace(/^Bearer /, '')
        )
        setTimeout(() => (accepted ? socket.onopen?.() : refuse(socket)), 0)
        return socket
      },
    })
    const events: LiveEvent[] = []
    const verify = vi.fn(() => ann.engine.sync({ automatic: true }))
    const live = createLiveInbox({
      open: () => client.openLive(ownerAuthFor(ann.seed)),
      syncedSeq: () => ann.store.getState().syncSeq,
      onChange: () => undefined,
      verify,
      onEvent: (event) => events.push(event),
    })
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(events.filter((event) => event.type === 'open')).toHaveLength(1)

    h.fake.expireAccessTokens()
    sockets[0].onclose?.({ code: 1012 })
    await vi.advanceTimersByTimeAsync(1300)
    expect(sockets).toHaveLength(2)
    expect(sockets[1].authorization).toBe(sockets[0].authorization)

    await vi.advanceTimersByTimeAsync(2500)
    expect(verify).toHaveBeenCalledTimes(1)
    expect(sockets).toHaveLength(3)
    expect(sockets[2].authorization).not.toBe(sockets[1].authorization)
    expect(events.filter((event) => event.type === 'open')).toHaveLength(2)
    expect(h.fake.sessions.size).toBe(1)
    live.stop()
  })
})
