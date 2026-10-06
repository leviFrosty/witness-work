import { describe, expect, it } from 'vitest'
import {
  buildRouteHandoff,
  resolveNavigationApp,
  supportsAppleMultiStop,
} from '@/features/route-planning/lib/routeHandoff'
import type { RouteStop } from '@/features/route-planning/lib/routeStops'

const stop = (n: number, destination?: string): RouteStop => ({
  key: `followUp:${n}`,
  kind: 'followUp',
  title: `Stop ${n}`,
  startTimeInMinutes: 600,
  coordinate: { latitude: 39 + n / 100, longitude: -84 - n / 100 },
  destination: destination ?? `${n} Main St, Cincinnati`,
})

const query = (url: string) => new URL(url).searchParams

describe('buildRouteHandoff', () => {
  const three = [stop(1), stop(2, '39.03,-84.03'), stop(3)]

  it('opens Google Maps once with every stop in order from the current location', () => {
    const handoff = buildRouteHandoff({
      app: 'google',
      stops: three,
      appleMultiStop: false,
    })
    expect(handoff.mode).toBe('route')
    expect(handoff.links).toHaveLength(1)
    const url = handoff.links[0]!
    expect(url.startsWith('https://www.google.com/maps/dir/?api=1&')).toBe(true)
    expect(url).not.toContain('+')
    const params = query(url)
    expect(params.get('origin')).toBeNull()
    expect(params.get('destination')).toBe('3 Main St, Cincinnati')
    expect(params.get('waypoints')).toBe('1 Main St, Cincinnati|39.03,-84.03')
    expect(params.get('travelmode')).toBe('driving')
  })

  it('fits ten stops in one Google link and falls back to coordinates for long addresses', () => {
    const ten = Array.from({ length: 10 }, (_, i) => stop(i + 1))
    expect(
      buildRouteHandoff({ app: 'google', stops: ten, appleMultiStop: false })
        .links
    ).toHaveLength(1)

    const long = ten.map((s) => ({ ...s, destination: 'x'.repeat(300) }))
    const url = buildRouteHandoff({
      app: 'google',
      stops: long,
      appleMultiStop: false,
    }).links[0]!
    expect(url.length).toBeLessThanOrEqual(2048)
    expect(query(url).get('destination')).toBe('39.1,-84.1')
  })

  it('keeps a pipe in an address from splitting a Google waypoint', () => {
    const url = buildRouteHandoff({
      app: 'google',
      stops: [stop(1, 'Unit 4 | Building B'), stop(2)],
      appleMultiStop: false,
    }).links[0]!
    expect(query(url).get('waypoints')).toBe('Unit 4   Building B')
  })

  it('uses Apple Maps multi-stop directions on iOS 18.4 and later', () => {
    const handoff = buildRouteHandoff({
      app: 'apple',
      stops: three,
      appleMultiStop: true,
    })
    expect(handoff.mode).toBe('route')
    const url = handoff.links[0]!
    expect(url.startsWith('https://maps.apple.com/directions?')).toBe(true)
    expect(url).toContain('1%20Main%20St')
    const params = query(url)
    expect(params.get('source')).toBeNull()
    expect(params.get('destination')).toBe('3 Main St, Cincinnati')
    expect(params.getAll('waypoint')).toEqual([
      '1 Main St, Cincinnati',
      '39.03,-84.03',
    ])
    expect(params.get('mode')).toBe('driving')
  })

  it('opens Apple Maps one stop at a time before iOS 18.4', () => {
    const handoff = buildRouteHandoff({
      app: 'apple',
      stops: three,
      appleMultiStop: false,
    })
    expect(handoff.mode).toBe('stopByStop')
    expect(handoff.links.map((link) => query(link).get('daddr'))).toEqual([
      '1 Main St, Cincinnati',
      '39.03,-84.03',
      '3 Main St, Cincinnati',
    ])
    expect(query(handoff.links[0]!).get('dirflg')).toBe('d')
  })

  it('opens Waze one stop at a time, navigating to exact coordinates', () => {
    const handoff = buildRouteHandoff({
      app: 'waze',
      stops: three,
      appleMultiStop: true,
    })
    expect(handoff.mode).toBe('stopByStop')
    expect(handoff.links).toHaveLength(3)
    expect(Object.fromEntries(query(handoff.links[1]!))).toEqual({
      ll: '39.02,-84.02',
      navigate: 'yes',
    })
    expect(handoff.links[1]!.startsWith('https://waze.com/ul?')).toBe(true)
  })
})

describe('supportsAppleMultiStop', () => {
  it('requires iOS 18.4 or later', () => {
    expect(supportsAppleMultiStop('ios', '18.4')).toBe(true)
    expect(supportsAppleMultiStop('ios', '18.4.1')).toBe(true)
    expect(supportsAppleMultiStop('ios', '26.0')).toBe(true)
    expect(supportsAppleMultiStop('ios', '18.3.2')).toBe(false)
    expect(supportsAppleMultiStop('ios', '17.6')).toBe(false)
    expect(supportsAppleMultiStop('android', 35)).toBe(false)
  })
})

describe('resolveNavigationApp', () => {
  it('follows the default navigation app, with Google Maps for Apple on Android', () => {
    expect(resolveNavigationApp('waze', 'ios')).toBe('waze')
    expect(resolveNavigationApp('apple', 'android')).toBe('google')
    expect(resolveNavigationApp(null, 'android')).toBe('google')
    expect(resolveNavigationApp(null, 'ios')).toBe('apple')
  })
})
