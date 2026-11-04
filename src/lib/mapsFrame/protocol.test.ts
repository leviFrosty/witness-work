import { describe, expect, it } from 'vitest'
import {
  envelope,
  isAllowedOrigin,
  isOtherVersion,
  MAPS_FRAME_VERSION,
  MAX_PINS,
  parseAppMessage,
  parseFrameMessage,
} from '@/lib/mapsFrame/protocol'

const TOKEN = 'eyJhbGciOiJFUzI1NiJ9.eyJpc3MiOiJ0ZWFtIn0.c2lnbmF0dXJl'
const options = {
  colorScheme: 'dark',
  layer: 'satellite',
  padding: { top: 10, right: 0, bottom: 80, left: 0 },
  interactive: true,
  showsPointsOfInterest: false,
} as const

describe('parseAppMessage', () => {
  it('reads an init and keeps only the fields it knows', () => {
    const message = parseAppMessage({
      ...envelope({
        type: 'init',
        token: TOKEN,
        language: 'pt-BR',
        options: { ...options, extra: 'Jane Doe' },
        region: {
          latitude: 39.1,
          longitude: -84.5,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
          name: 'Jane Doe',
        },
      }),
      note: 'Jane Doe',
    })
    expect(message).toEqual({
      type: 'init',
      token: TOKEN,
      language: 'pt-BR',
      options,
      region: {
        latitude: 39.1,
        longitude: -84.5,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      },
    })
    expect(JSON.stringify(message)).not.toContain('Jane')
  })

  it('refuses another protocol, version or shape', () => {
    const pins = { type: 'pins', pins: [] }
    expect(parseAppMessage(envelope(pins))).toEqual(pins)
    expect(parseAppMessage(pins)).toBeNull()
    expect(
      parseAppMessage({ ...envelope(pins), v: MAPS_FRAME_VERSION + 1 })
    ).toBeNull()
    expect(parseAppMessage({ ...envelope(pins), protocol: 'other' })).toBeNull()
    expect(parseAppMessage(envelope({ type: 'eval', code: '1' }))).toBeNull()
    expect(parseAppMessage('{"protocol":"ww-maps"}')).toBeNull()
    expect(parseAppMessage(null)).toBeNull()
  })

  it('refuses a token that is not a JWT, or too long', () => {
    const init = (token: unknown) =>
      parseAppMessage(
        envelope({ type: 'init', token, language: 'en', options })
      )
    expect(init(TOKEN)).not.toBeNull()
    expect(init('not a token')).toBeNull()
    expect(init(`${TOKEN}${'a'.repeat(5000)}`)).toBeNull()
    expect(init(42)).toBeNull()
  })

  it('takes pins with opaque ids and hex colors only', () => {
    const pins = (pin: object) =>
      parseAppMessage(envelope({ type: 'pins', pins: [pin] }))
    const ok = { id: 'p1', latitude: 1, longitude: 2, color: '#aabbcc' }
    expect(pins(ok)).toEqual({ type: 'pins', pins: [ok] })
    expect(pins({ ...ok, title: 'Jane Doe' })).toEqual({
      type: 'pins',
      pins: [ok],
    })
    expect(pins({ ...ok, id: 'Jane Doe' })).toBeNull()
    expect(pins({ ...ok, color: 'red; background: url(x)' })).toBeNull()
    expect(pins({ ...ok, latitude: 91 })).toBeNull()
    expect(pins({ ...ok, longitude: Number.NaN })).toBeNull()
    expect(
      parseAppMessage(
        envelope({ type: 'pins', pins: Array(MAX_PINS + 1).fill(ok) })
      )
    ).toBeNull()
  })

  it('takes polylines as flat coordinate pairs', () => {
    const line = {
      id: 'route',
      coordinates: [39.1, -84.5, 39.2, -84.4],
      color: '#0a84ff',
      width: 4,
    }
    expect(
      parseAppMessage(envelope({ type: 'polylines', polylines: [line] }))
    ).toEqual({ type: 'polylines', polylines: [line] })
    for (const coordinates of [[39.1], [39.1, -200], ['39', '-84']])
      expect(
        parseAppMessage(
          envelope({
            type: 'polylines',
            polylines: [{ ...line, coordinates }],
          })
        )
      ).toBeNull()
  })

  it('correlates projections by a positive integer id', () => {
    const project = (id: unknown) =>
      parseAppMessage(
        envelope({
          type: 'project',
          id,
          coordinates: [{ latitude: 1, longitude: 2 }],
        })
      )
    expect(project(7)).toEqual({
      type: 'project',
      id: 7,
      coordinates: [{ latitude: 1, longitude: 2 }],
    })
    expect(project(0)).toBeNull()
    expect(project(1.5)).toBeNull()
    expect(project('7')).toBeNull()
  })

  it('takes a null token when the app has none', () => {
    expect(parseAppMessage(envelope({ type: 'token', token: null }))).toEqual({
      type: 'token',
      token: null,
    })
  })
})

describe('parseFrameMessage', () => {
  it('reads a region change', () => {
    const region = {
      type: 'region',
      phase: 'end',
      region: {
        latitude: 1,
        longitude: 2,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      },
      rect: { x: 0.5, y: 0.5, width: 0.01, height: 0.01 },
      size: { width: 400, height: 300 },
      byUser: true,
    }
    expect(parseFrameMessage(envelope(region))).toEqual(region)
    expect(
      parseFrameMessage(envelope({ ...region, phase: 'during' }))
    ).toBeNull()
    expect(
      parseFrameMessage(
        envelope({ ...region, rect: { ...region.rect, width: 0 } })
      )
    ).toBeNull()
  })

  it('knows its error codes only', () => {
    expect(
      parseFrameMessage(envelope({ type: 'error', code: 'unauthorized' }))
    ).toEqual({ type: 'error', code: 'unauthorized' })
    expect(
      parseFrameMessage(envelope({ type: 'error', code: 'oops' }))
    ).toBeNull()
  })

  it('reads presses with their coordinate', () => {
    expect(
      parseFrameMessage(
        envelope({
          type: 'press',
          kind: 'longPress',
          coordinate: { latitude: 1, longitude: 2 },
        })
      )
    ).toEqual({
      type: 'press',
      kind: 'longPress',
      coordinate: { latitude: 1, longitude: 2 },
    })
    expect(
      parseFrameMessage(envelope({ type: 'pinPress', id: '<img>' }))
    ).toBeNull()
  })
})

describe('isOtherVersion', () => {
  it('tells a newer protocol message from ours', () => {
    expect(isOtherVersion(envelope({ type: 'ready' }))).toBe(false)
    expect(
      isOtherVersion({
        ...envelope({ type: 'ready' }),
        v: MAPS_FRAME_VERSION + 1,
      })
    ).toBe(true)
  })
})

describe('isAllowedOrigin', () => {
  const allowed = [
    'https://app-dev.witnesswork.app',
    'http://localhost:*',
    'http://127.0.0.1:*',
  ]

  it('matches exact origins', () => {
    expect(isAllowedOrigin('https://app-dev.witnesswork.app', allowed)).toBe(
      true
    )
    for (const origin of [
      'https://app-dev.witnesswork.app.evil.test',
      'https://evil-app-dev.witnesswork.app',
      'http://app-dev.witnesswork.app',
      'https://app.witnesswork.app',
      'null',
      '',
    ])
      expect(isAllowedOrigin(origin, allowed)).toBe(false)
  })

  it('matches any port of a local server only', () => {
    expect(isAllowedOrigin('http://localhost:8081', allowed)).toBe(true)
    expect(isAllowedOrigin('http://127.0.0.1:8765', allowed)).toBe(true)
    for (const origin of [
      'http://localhost',
      'http://localhost:8081.evil.test',
      'http://localhost.evil.test:80',
      'https://localhost:8081',
      'http://localhost:',
    ])
      expect(isAllowedOrigin(origin, allowed)).toBe(false)
    expect(
      isAllowedOrigin('https://evil.test:443', ['https://evil.test:*'])
    ).toBe(false)
  })
})
