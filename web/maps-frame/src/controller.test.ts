import { describe, expect, it, vi } from 'vitest'
import {
  envelope,
  MAPS_FRAME_VERSION,
} from '../../../src/lib/mapsFrame/protocol'
import { createFrameController, type MapEngine } from './controller'

const APP = 'https://beta.app.witnesswork.app'
const TOKEN = 'eyJhbGciOiJFUzI1NiJ9.eyJpc3MiOiJ0ZWFtIn0.c2lnbmF0dXJl'
const options = {
  colorScheme: 'light',
  layer: 'standard',
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  interactive: true,
  showsPointsOfInterest: true,
} as const
const init = envelope({ type: 'init', token: TOKEN, language: 'en', options })

function setup() {
  const parent = { postMessage: vi.fn() }
  let emit: Parameters<MapEngine['start']>[1] = () => {}
  let start: Parameters<MapEngine['start']>[0] | undefined
  const engine = {
    start: vi.fn(async (s, e) => {
      start = s
      emit = e
    }),
    setOptions: vi.fn(),
    setCamera: vi.fn(),
    setCenter: vi.fn(),
    fit: vi.fn(),
    setPins: vi.fn(),
    setPolylines: vi.fn(),
    setUserLocation: vi.fn(),
    project: vi.fn((coordinates: unknown[]) =>
      coordinates.map((_, i) => ({ x: i, y: i }))
    ),
    unproject: vi.fn(() => []),
  } satisfies MapEngine
  const timers: (() => void)[] = []
  const controller = createFrameController({
    allowedOrigins: [APP, 'http://localhost:*'],
    parent,
    engine,
    setTimer: (run) => timers.push(run),
  })
  const send = (data: unknown, origin = APP, source: unknown = parent) =>
    controller.receive({ origin, source, data })
  return {
    parent,
    engine,
    controller,
    send,
    timers,
    emit: (...args: Parameters<typeof emit>) => emit(...args),
    start: () => start!,
    posted: () => parent.postMessage.mock.calls,
  }
}

describe('the frame controller', () => {
  it('starts the map on an init from the app, and answers only it', async () => {
    const frame = setup()
    frame.send(init)
    expect(frame.engine.start).toHaveBeenCalledOnce()
    expect(frame.controller.appOrigin()).toBe(APP)
    frame.emit({ type: 'ready' })
    expect(frame.posted()).toEqual([[envelope({ type: 'ready' }), APP]])
  })

  it('ignores messages from other origins, before and after init', () => {
    const frame = setup()
    frame.send(init, 'https://evil.test')
    frame.send(init, 'https://beta.app.witnesswork.app.evil.test')
    frame.send(init, 'null')
    expect(frame.engine.start).not.toHaveBeenCalled()
    frame.send(init)
    frame.send(envelope({ type: 'pins', pins: [] }), 'http://localhost:8081')
    frame.send(envelope({ type: 'pins', pins: [] }), 'https://evil.test')
    expect(frame.engine.setPins).not.toHaveBeenCalled()
    frame.send(envelope({ type: 'pins', pins: [] }))
    expect(frame.engine.setPins).toHaveBeenCalledOnce()
  })

  it('ignores a window other than its parent, even from the app origin', () => {
    const frame = setup()
    frame.send(init, APP, {})
    frame.send(init, APP, null)
    expect(frame.engine.start).not.toHaveBeenCalled()
  })

  it('does nothing as the top window', () => {
    const engine = { start: vi.fn() } as unknown as MapEngine
    const controller = createFrameController({
      allowedOrigins: [APP],
      parent: null,
      engine,
    })
    controller.receive({ origin: APP, source: null, data: init })
    expect(engine.start).not.toHaveBeenCalled()
  })

  it('takes nothing but init first, and init only once', () => {
    const frame = setup()
    frame.send(envelope({ type: 'pins', pins: [] }))
    expect(frame.engine.setPins).not.toHaveBeenCalled()
    expect(frame.controller.appOrigin()).toBeNull()
    frame.send(init)
    frame.send(init)
    expect(frame.engine.start).toHaveBeenCalledOnce()
  })

  it('says when the app speaks another version', () => {
    const frame = setup()
    frame.send({ ...init, v: MAPS_FRAME_VERSION + 1 })
    expect(frame.engine.start).not.toHaveBeenCalled()
    expect(frame.posted()).toEqual([
      [envelope({ type: 'error', code: 'version' }), APP],
    ])
  })

  it('reports a malformed message once the app is known', () => {
    const frame = setup()
    frame.send(init)
    frame.send(envelope({ type: 'pins', pins: [{ id: 'Jane Doe' }] }))
    expect(frame.engine.setPins).not.toHaveBeenCalled()
    expect(frame.posted()).toEqual([
      [envelope({ type: 'error', code: 'bad_message' }), APP],
    ])
  })

  it('answers projections with the request id', () => {
    const frame = setup()
    frame.send(init)
    frame.send(
      envelope({
        type: 'project',
        id: 4,
        coordinates: [
          { latitude: 1, longitude: 2 },
          { latitude: 3, longitude: 4 },
        ],
      })
    )
    expect(frame.posted()).toEqual([
      [
        envelope({
          type: 'projected',
          id: 4,
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        }),
        APP,
      ],
    ])
  })

  it("gives MapKit the init's token, then asks the app for fresh ones", async () => {
    const frame = setup()
    frame.send(init)
    await expect(frame.start().token()).resolves.toBe(TOKEN)
    const next = frame.start().token()
    expect(frame.posted()).toEqual([[envelope({ type: 'tokenRequest' }), APP]])
    const fresh = TOKEN.replace('c2ln', 'bmV3')
    frame.send(envelope({ type: 'token', token: fresh }))
    await expect(next).resolves.toBe(fresh)
  })

  it('gives up on a token the app never sends', async () => {
    const frame = setup()
    frame.send(init)
    await frame.start().token()
    const next = frame.start().token()
    frame.timers.forEach((run) => run())
    await expect(next).resolves.toBeNull()
  })

  it('says the map failed when the engine does', async () => {
    const frame = setup()
    frame.engine.start.mockRejectedValueOnce(new Error('blocked'))
    frame.send(init)
    await vi.waitFor(() =>
      expect(frame.posted()).toEqual([
        [envelope({ type: 'error', code: 'load_failed' }), APP],
      ])
    )
  })
})
