import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createLiveInbox,
  type LiveEvent,
} from '@/features/buddies/lib/liveInbox'
import type { LiveSocket } from '@/features/buddies/lib/relay'

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

function setup(syncedSeq = 5) {
  const sockets: FakeSocket[] = []
  const onChange = vi.fn()
  const events: LiveEvent[] = []
  let fail = false
  const live = createLiveInbox({
    open: async () => {
      if (fail) throw new Error('offline')
      const socket = fakeSocket()
      sockets.push(socket)
      return socket
    },
    syncedSeq: () => syncedSeq,
    onChange,
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

  it('syncs once for a burst of changes', async () => {
    const { live, sockets, onChange, message } = setup()
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    message(sockets[0], { type: 'changed', seq: 6 })
    message(sockets[0], { type: 'changed', seq: 7 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(onChange).toHaveBeenCalledTimes(1)
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

    // The second ping goes unanswered.
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

  it('opens one connection when restarted while connecting', async () => {
    const { live, sockets } = setup()
    live.start()
    live.stop()
    live.start()
    await vi.advanceTimersByTimeAsync(5000)
    expect(sockets.filter((socket) => !socket.closed)).toHaveLength(1)
  })
})
