import { describe, expect, it, vi } from 'vitest'
import { envelope, MAPS_FRAME_VERSION } from '@/lib/mapsFrame/protocol'
import type { MapKitTokenResult } from '@/vendor/web/maps/mapkitTokens'
import {
  createFrameClient,
  READY_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
} from '@/vendor/web/maps/frameClient'

const ORIGIN = 'https://maps-dev.witnesswork.app'
const TOKEN = 'eyJhbGciOiJFUzI1NiJ9.eyJpc3MiOiJ0ZWFtIn0.c2lnbmF0dXJl'
const options = {
  colorScheme: 'light',
  layer: 'standard',
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  interactive: true,
  showsPointsOfInterest: true,
} as const

function setup(
  tokenResult: MapKitTokenResult = { ok: true, token: TOKEN, expiresAt: 1 }
) {
  const frame = { postMessage: vi.fn() }
  const timers = new Map<number, { run: () => void; ms: number }>()
  let nextTimer = 1
  const statuses: unknown[] = []
  const events: unknown[] = []
  const problems: unknown[] = []
  const token = vi.fn(async () => tokenResult)
  const resetToken = vi.fn()
  const client = createFrameClient({
    origin: ORIGIN,
    target: () => frame,
    token,
    resetToken,
    onEvent: (event) => events.push(event),
    onStatus: (status) => statuses.push(status),
    onProblem: (code) => problems.push(code),
    setTimer: (run, ms) => {
      const id = nextTimer++
      timers.set(id, { run, ms })
      return id
    },
    clearTimer: (id) => timers.delete(id as number),
  })
  const fromFrame = (data: object, from = ORIGIN, source: unknown = frame) =>
    client.receive({ origin: from, source, data })
  const sent = () =>
    frame.postMessage.mock.calls.map(([message, target]) => {
      expect(target).toBe(ORIGIN)
      return message as { type: string }
    })
  const fire = (ms: number) => {
    for (const [id, timer] of timers)
      if (timer.ms === ms) {
        timers.delete(id)
        timer.run()
      }
  }
  return {
    client,
    frame,
    fromFrame,
    sent,
    statuses,
    events,
    problems,
    token,
    resetToken,
    fire,
  }
}

const flushPromises = () => new Promise((resolve) => setTimeout(resolve))

describe('the maps frame client', () => {
  it('sends init with the token once the frame has loaded', async () => {
    const map = setup()
    map.client.start({ language: 'en', options })
    await flushPromises()
    expect(map.sent()).toEqual([])
    map.client.frameLoaded()
    expect(map.sent()).toEqual([
      envelope({ type: 'init', token: TOKEN, language: 'en', options }),
    ])
  })

  it("keeps what the map shows until it's up, then sends it", async () => {
    const map = setup()
    map.client.start({ language: 'en', options })
    map.client.frameLoaded()
    await flushPromises()
    const pins = [{ id: 'p1', latitude: 1, longitude: 2, color: '#000000' }]
    map.client.setPins(pins)
    map.client.move({
      type: 'fit',
      coordinates: [{ latitude: 1, longitude: 2 }],
      padding: options.padding,
      animated: false,
    })
    expect(map.sent().map((m) => m.type)).toEqual(['init'])
    map.fromFrame(envelope({ type: 'ready' }))
    expect(map.statuses.at(-1)).toEqual({ state: 'ready' })
    expect(map.sent().map((m) => m.type)).toEqual([
      'init',
      'pins',
      'polylines',
      'fit',
    ])
    expect(map.sent()[1]).toEqual(envelope({ type: 'pins', pins }))
  })

  it('opens on the last camera asked before the map was up', async () => {
    const map = setup()
    const region = {
      latitude: 1,
      longitude: 2,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    }
    map.client.start({ language: 'en', options })
    map.client.move({ type: 'camera', region, duration: 0 })
    map.client.frameLoaded()
    await flushPromises()
    expect(map.sent()[0]).toMatchObject({ type: 'init', region })
  })

  it('hears only the frame window at the frame origin', async () => {
    const map = setup()
    map.client.start({ language: 'en', options })
    map.client.frameLoaded()
    await flushPromises()
    map.fromFrame(envelope({ type: 'ready' }), 'https://evil.test')
    map.fromFrame(envelope({ type: 'ready' }), ORIGIN, {})
    map.fromFrame({ type: 'ready' })
    map.fromFrame({ ...envelope({ type: 'ready' }), v: MAPS_FRAME_VERSION + 1 })
    expect(map.statuses).toEqual([])
    map.fromFrame(envelope({ type: 'ready' }))
    expect(map.statuses).toEqual([{ state: 'ready' }])
  })

  it('shows unavailable when there is no token, and never sends init', async () => {
    const map = setup({ ok: false, reason: 'unconfigured' })
    map.client.start({ language: 'en', options })
    map.client.frameLoaded()
    await flushPromises()
    expect(map.statuses).toEqual([
      { state: 'unavailable', reason: 'unconfigured' },
    ])
    expect(map.sent()).toEqual([])
  })

  it("shows unavailable when the map isn't up in time", async () => {
    const map = setup()
    map.client.start({ language: 'en', options })
    map.client.frameLoaded()
    await flushPromises()
    map.fire(READY_TIMEOUT_MS)
    expect(map.statuses).toEqual([{ state: 'unavailable', reason: 'failed' }])
  })

  it('shows unavailable when MapKit refuses, and forgets the token', async () => {
    const map = setup()
    map.client.start({ language: 'en', options })
    map.client.frameLoaded()
    await flushPromises()
    map.fromFrame(envelope({ type: 'ready' }))
    map.fromFrame(envelope({ type: 'error', code: 'unauthorized' }))
    expect(map.resetToken).toHaveBeenCalled()
    expect(map.statuses.at(-1)).toEqual({
      state: 'unavailable',
      reason: 'failed',
    })
  })

  it('keeps the map up through a CSP report', async () => {
    const map = setup()
    map.client.start({ language: 'en', options })
    map.client.frameLoaded()
    await flushPromises()
    map.fromFrame(envelope({ type: 'ready' }))
    map.fromFrame(envelope({ type: 'error', code: 'csp' }))
    expect(map.problems).toEqual(['csp'])
    expect(map.statuses).toEqual([{ state: 'ready' }])
  })

  it('answers a token request with a fresh token', async () => {
    const map = setup()
    map.client.start({ language: 'en', options })
    map.client.frameLoaded()
    await flushPromises()
    map.fromFrame(envelope({ type: 'tokenRequest' }))
    await flushPromises()
    expect(map.resetToken).toHaveBeenCalled()
    expect(map.sent().at(-1)).toEqual(envelope({ type: 'token', token: TOKEN }))
  })

  it('correlates projections by id, and gives up on a lost answer', async () => {
    const map = setup()
    map.client.start({ language: 'en', options })
    map.client.frameLoaded()
    await flushPromises()
    await expect(
      map.client.project([{ latitude: 1, longitude: 2 }])
    ).rejects.toThrow('not ready')
    map.fromFrame(envelope({ type: 'ready' }))
    const first = map.client.project([{ latitude: 1, longitude: 2 }])
    const second = map.client.project([{ latitude: 3, longitude: 4 }])
    const [a, b] = map
      .sent()
      .filter((m) => m.type === 'project') as unknown as { id: number }[]
    expect(a!.id).not.toBe(b!.id)
    map.fromFrame(
      envelope({ type: 'projected', id: b!.id, points: [{ x: 3, y: 4 }] })
    )
    map.fromFrame(
      envelope({ type: 'projected', id: a!.id, points: [{ x: 1, y: 2 }] })
    )
    await expect(first).resolves.toEqual([{ x: 1, y: 2 }])
    await expect(second).resolves.toEqual([{ x: 3, y: 4 }])
    const lost = map.client.project([{ latitude: 1, longitude: 2 }])
    map.fire(REQUEST_TIMEOUT_MS)
    await expect(lost).rejects.toThrow('did not answer')
  })

  it('passes on map events only once the map is up', async () => {
    const map = setup()
    map.client.start({ language: 'en', options })
    map.client.frameLoaded()
    await flushPromises()
    const press = {
      type: 'press',
      kind: 'press',
      coordinate: { latitude: 1, longitude: 2 },
    } as const
    map.fromFrame(envelope(press))
    expect(map.events).toEqual([])
    map.fromFrame(envelope({ type: 'ready' }))
    map.fromFrame(envelope(press))
    expect(map.events).toEqual([press])
  })
})
