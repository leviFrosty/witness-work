import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiveEvent, LiveSocket } from '@/lib/liveSignal'
import {
  createSpaceLive,
  SPACE_CLOSE_GONE,
  SPACE_CLOSE_REPLACED,
  SPACE_REPLACED_WAIT_MS,
} from '@/lib/sharedSpaces/live'

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

function setup(syncedSeq = 5) {
  const sockets: FakeSocket[] = []
  const onChange = vi.fn()
  const onGone = vi.fn()
  const events: LiveEvent[] = []
  const live = createSpaceLive({
    open: async () => {
      const socket = fakeSocket()
      sockets.push(socket)
      return socket
    },
    syncedSeq: () => syncedSeq,
    onChange,
    onGone,
    onEvent: (event) => events.push(event),
    now: Date.now,
  })
  const message = (socket: FakeSocket, data: unknown) =>
    socket.onmessage?.({ data: JSON.stringify(data) })
  return { live, sockets, onChange, onGone, events, message }
}

describe('createSpaceLive', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('syncs on hello only past this device’s cursor, and up to every change', async () => {
    const { live, sockets, onChange, message } = setup(5)
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0].onopen?.()
    message(sockets[0], { type: 'hello', seq: 5 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(onChange).not.toHaveBeenCalled()
    message(sockets[0], { type: 'hello', seq: 9 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(onChange).toHaveBeenLastCalledWith(9)

    message(sockets[0], { type: 'changed', seq: 10 })
    message(sockets[0], { type: 'changed', seq: 11 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith(11)
    live.stop()
  })

  it('answers the server’s keepalive with ping and pong', async () => {
    const { live, sockets } = setup()
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0].onopen?.()
    await vi.advanceTimersByTimeAsync(25 * 1000)
    expect(sockets[0].sent).toEqual(['ping'])
    sockets[0].onmessage?.({ data: 'pong' })
    await vi.advanceTimersByTimeAsync(10 * 1000)
    expect(sockets[0].closed).toBe(false)
    live.stop()
  })

  it('stays closed after 4001 gone, and says so', async () => {
    const { live, sockets, onGone, events } = setup()
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0].onopen?.()
    sockets[0].onclose?.({ code: SPACE_CLOSE_GONE, reason: 'gone' })
    expect(onGone).toHaveBeenCalledTimes(1)
    expect(events.some((e) => e.type === 'closed')).toBe(true)
    await vi.advanceTimersByTimeAsync(120 * 1000)
    expect(sockets).toHaveLength(1)
    live.stop()
  })

  it('waits at least a minute before coming back after 4002 replaced', async () => {
    const { live, sockets, onGone } = setup()
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0].onopen?.()
    sockets[0].onclose?.({ code: SPACE_CLOSE_REPLACED, reason: 'replaced' })
    expect(onGone).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(SPACE_REPLACED_WAIT_MS - 1)
    expect(sockets).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(SPACE_REPLACED_WAIT_MS * 0.2 + 1)
    expect(sockets).toHaveLength(2)
    live.stop()
  })

  it('rides out a storm of 4002s at most once a minute', async () => {
    const { live, sockets } = setup()
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    for (let minute = 0; minute < 10; minute++) {
      const socket = sockets.at(-1)!
      socket.onopen?.()
      socket.onclose?.({ code: SPACE_CLOSE_REPLACED, reason: 'replaced' })
      await vi.advanceTimersByTimeAsync(SPACE_REPLACED_WAIT_MS / 2)

      expect(sockets).toHaveLength(minute + 1)
      await vi.advanceTimersByTimeAsync(SPACE_REPLACED_WAIT_MS * 3)
    }

    expect(sockets.length).toBeLessThanOrEqual(11)
    live.stop()
  })

  it('comes back after 4001 only when told the car is still there', async () => {
    const { live, sockets, onGone } = setup()
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0].onopen?.()
    sockets[0].onclose?.({ code: SPACE_CLOSE_GONE, reason: 'gone' })
    expect(onGone).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60 * 1000)
    expect(sockets).toHaveLength(1)
    live.reconnect()
    await vi.advanceTimersByTimeAsync(5 * 1000)
    expect(sockets).toHaveLength(2)
    live.stop()
  })
})
