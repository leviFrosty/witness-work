import { describe, expect, it, vi } from 'vitest'
import { RelayError, type LiveSocket } from '@/features/buddies/lib/relay'
import { runRelayCheck } from '@/features/buddies/lib/relayCheck'

const probe = {
  since: 3,
  seq: 5,
  slots: 1,
  cards: 0,
  events: 2,
  rosterChanged: false,
}

/** A socket that answers like the relay, or as `behave` says. */
function relaySocket(behave: 'ok' | 'closeAtOnce' | 'silent' = 'ok') {
  const socket: LiveSocket & { closed: boolean } = {
    closed: false,
    send: (data) => {
      if (data === 'ping' && behave === 'ok')
        setTimeout(() => socket.onmessage?.({ data: 'pong' }), 0)
    },
    close: () => {
      socket.closed = true
    },
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
  }
  setTimeout(() => {
    if (behave === 'ok')
      socket.onmessage?.({ data: JSON.stringify({ type: 'hello', seq: 5 }) })
    if (behave === 'closeAtOnce')
      socket.onclose?.({ code: 1006, reason: 'abnormal' })
  }, 0)
  return socket
}

const okFetch = (async () =>
  new Response('{"status":"ok"}', { status: 200 })) as typeof fetch

describe('runRelayCheck', () => {
  it('passes every hop and closes its socket', async () => {
    const socket = relaySocket()
    const report = await runRelayCheck({
      baseUrl: 'https://relay.test',
      fetchImpl: okFetch,
      probeInbox: async () => probe,
      openLive: async () => socket,
    })

    expect(report.ok).toBe(true)
    expect(report.steps.map((step) => [step.name, step.ok])).toEqual([
      ['health', true],
      ['inbox', true],
      ['liveHello', true],
      ['livePing', true],
    ])
    expect(report.steps[1].detail).toContain('seq 5 (synced to 3)')
    expect(report.steps[2].detail).toBe('hello seq 5')
    expect(socket.closed).toBe(true)
  })

  it('names the relay error and skips the ping without a socket', async () => {
    const report = await runRelayCheck({
      baseUrl: 'https://relay.test',
      fetchImpl: (async () =>
        new Response('', { status: 502 })) as typeof fetch,
      probeInbox: async () => {
        throw new RelayError('disabled', 503)
      },
      openLive: async () => relaySocket('closeAtOnce'),
    })

    expect(report.ok).toBe(false)
    expect(report.steps).toMatchObject([
      { name: 'health', ok: false, detail: 'HTTP 502' },
      { name: 'inbox', ok: false, detail: 'relay disabled (HTTP 503)' },
      { name: 'liveHello', ok: false, detail: 'closed 1006 abnormal' },
      { name: 'livePing', ok: false, skipped: true },
    ])
  })

  it('times out a socket that never greets', async () => {
    vi.useFakeTimers()
    const socket = relaySocket('silent')
    const pending = runRelayCheck({
      baseUrl: 'https://relay.test',
      fetchImpl: okFetch,
      probeInbox: async () => probe,
      openLive: async () => socket,
      timeoutMs: 500,
    })
    await vi.advanceTimersByTimeAsync(600)
    const report = await pending
    vi.useRealTimers()

    expect(report.steps[2]).toMatchObject({
      name: 'liveHello',
      ok: false,
      detail: 'no answer within 500 ms',
    })
    expect(socket.closed).toBe(true)
  })
})
