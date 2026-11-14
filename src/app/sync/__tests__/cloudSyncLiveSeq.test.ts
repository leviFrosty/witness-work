import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLiveInbox } from '@/features/buddies/lib/liveInbox'
import type { LiveSocket } from '@/features/buddies/lib/relay'
import {
  createServerTransport,
  filenameForSlot,
} from '@/lib/syncTransport/server/serverTransport'
import { deriveSyncKey } from '@/lib/syncTransport/server/syncCrypto'
import { derivePhotoKeys } from '@/lib/syncTransport/server/photoCrypto'
import { createFakeSyncServer } from '@/lib/syncTransport/server/__tests__/fakeSyncServer'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const ACCOUNT_ID = 'A'.repeat(22)
const SLOT_A = 'slot-aaaaaaaa'
const SLOT_B = 'slot-bbbbbbbb'

function fleet() {
  const server = createFakeSyncServer()
  server.state.supporters.add('family')
  const device = (name: string) =>
    createServerTransport({
      access: async () => ({
        accountId: ACCOUNT_ID,
        syncKey: deriveSyncKey(new Uint8Array(32).fill(1)),
        photoKeys: derivePhotoKeys(new Uint8Array(32).fill(1)),
        options: {
          baseUrl: 'https://api.test',
          authorize: (run) => run('Bearer family'),
          fetchImpl: server.fetch,
        },
      }),
      isAvailable: () => true,
      identityToken: () => 'account:family',
      randomBytes: (length) => new Uint8Array(length).fill(7),
      deviceName: () => name,
      platform: 'ios',
      now: () => 1_000,
    })
  return { server, a: device('a'), b: device('b') }
}

async function reconnect(syncedSeq: () => number, helloSeq: number) {
  vi.useFakeTimers()
  const onChange = vi.fn()
  let socket: LiveSocket | null = null
  const live = createLiveInbox({
    open: async () => {
      socket = {
        send: () => {},
        close: () => {},
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
      }
      return socket
    },
    syncedSeq,
    onChange,
    now: Date.now,
  })
  live.start()
  await vi.advanceTimersByTimeAsync(0)
  socket!.onopen?.()
  socket!.onmessage?.({
    data: JSON.stringify({ type: 'hello', seq: helloSeq }),
  })
  await vi.advanceTimersByTimeAsync(1_000)
  live.stop()
  return onChange
}

afterEach(() => vi.useRealTimers())

describe('Cloud Sync live seq', () => {
  it('pulls another device’s put that landed just before our own', async () => {
    const { server, a, b } = fleet()
    await a.readFiles(() => true)

    await b.write(filenameForSlot(SLOT_B), '{"from":"b"}')
    await a.write(filenameForSlot(SLOT_A), '{"from":"a"}')

    const onChange = await reconnect(a.lastSeq, server.seq())
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('doesn’t pull for its own put alone', async () => {
    const { server, a, b } = fleet()
    await b.write(filenameForSlot(SLOT_B), '{"from":"b"}')
    await a.readFiles(() => true)
    await a.write(filenameForSlot(SLOT_A), '{"from":"a"}')
    await a.write(filenameForSlot(SLOT_A), '{"from":"a again"}')

    const onChange = await reconnect(a.lastSeq, server.seq())
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('the live socket’s messages', () => {
  const open = async (
    deps: Partial<Parameters<typeof createLiveInbox>[0]> = {}
  ) => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const sent: string[] = []
    let socket: LiveSocket | null = null
    const live = createLiveInbox({
      open: async () => {
        socket = {
          send: (data) => {
            sent.push(data)
          },
          close: () => {},
          onopen: null,
          onmessage: null,
          onerror: null,
          onclose: null,
        }
        return socket
      },
      syncedSeq: () => 0,
      onChange,
      now: Date.now,
      ...deps,
    })
    live.start()
    await vi.advanceTimersByTimeAsync(0)
    socket!.onopen?.()
    const receive = (data: unknown) =>
      socket!.onmessage?.({
        data: typeof data === 'string' ? data : JSON.stringify(data),
      })
    return { live, onChange, sent, receive }
  }

  it('hands every JSON message to the handler, with a way to answer', async () => {
    const onMessage = vi.fn(
      (message: Record<string, unknown>, send: (data: string) => void) => {
        if (message.type === 'hello') send('{"type":"sync","afterSequence":4}')
      }
    )
    const { live, sent, receive } = await open({ onMessage })
    receive({ type: 'hello', seq: 9 })
    receive({ type: 'change', change: { sequence: 10 } })
    receive('pong')
    receive('not json')
    receive('[1]')
    expect(onMessage.mock.calls.map(([message]) => message)).toEqual([
      { type: 'hello', seq: 9 },
      { type: 'change', change: { sequence: 10 } },
    ])
    expect(sent).toEqual(['{"type":"sync","afterSequence":4}'])
    live.stop()
  })

  it('leaves the catch-up after hello to a handler that does it', async () => {
    const { live, onChange, receive } = await open({
      catchesUpOnHello: () => true,
    })
    receive({ type: 'hello', seq: 9 })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(onChange).not.toHaveBeenCalled()

    receive({ type: 'changed', seq: 10 })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(onChange).toHaveBeenCalledTimes(1)
    live.stop()
  })

  it('still pulls after hello when nothing else catches up', async () => {
    const { live, onChange, receive } = await open({
      catchesUpOnHello: () => false,
    })
    receive({ type: 'hello', seq: 9 })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(onChange).toHaveBeenCalledTimes(1)
    live.stop()
  })
})
