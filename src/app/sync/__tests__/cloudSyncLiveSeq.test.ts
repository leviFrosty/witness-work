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

// Cloud Sync's live socket (ADR 0030 §8) against the transport's `lastSeq`:
// on (re)connecting, `hello {seq}` past what this device pulled pulls at once.

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

/** Device A's live socket; resolves to the `onChange` mock after `hello`. */
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
    // While A's socket is reconnecting: B puts, then A pushes.
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
