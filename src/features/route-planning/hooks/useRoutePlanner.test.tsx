import { createElement, useEffect } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteStop } from '@/features/route-planning/lib/routeStops'

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  openURL: vi.fn(),
  optimizeRoute: vi.fn(),
  currentCoordinate: vi.fn(),
  provider: 'google' as string | null,
}))

vi.mock('react-native', () => ({ Platform: { OS: 'ios', Version: '18.4' } }))
vi.mock('@/hooks/useAccount', () => ({
  default: () => ({ accountId: 'account-1234' }),
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: mocks.capture } }))
vi.mock('@/lib/links', () => ({ openURL: mocks.openURL }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (select: (s: object) => unknown) =>
    select({ defaultNavigationMapProvider: mocks.provider }),
}))
vi.mock('@/features/route-planning/lib/currentLocation', () => ({
  currentCoordinate: mocks.currentCoordinate,
}))
vi.mock('@/features/route-planning/lib/routePlanningClient', () => ({
  optimizeRoute: mocks.optimizeRoute,
}))

import useRoutePlanner from '@/features/route-planning/hooks/useRoutePlanner'

const stop = (n: number): RouteStop => ({
  key: `followUp:${n}`,
  kind: 'followUp',
  title: `Stop ${n}`,
  startTimeInMinutes: 540 + n,
  coordinate: { latitude: 39 + n / 100, longitude: -84 },
  destination: `${n} Main St`,
})

let planner: ReturnType<typeof useRoutePlanner>
let renderer: ReturnType<typeof create>
const mount = async (stops: RouteStop[]) => {
  function Consumer() {
    const value = useRoutePlanner(stops)
    useEffect(() => {
      planner = value
    })
    return null
  }
  await act(async () => {
    renderer = create(createElement(Consumer))
  })
}

const here = { latitude: 39, longitude: -84.5 }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.provider = 'google'
  mocks.currentCoordinate.mockResolvedValue({ ok: true, coordinate: here })
})

describe('useRoutePlanner', () => {
  it('starts with stops past the limit removed, and swaps them in under it', async () => {
    await mount(Array.from({ length: 12 }, (_, i) => stop(i + 1)))
    expect(planner.included).toHaveLength(10)
    expect(planner.removed.map((s) => s.key)).toEqual([
      'followUp:11',
      'followUp:12',
    ])
    expect(planner.canRestore).toBe(false)

    await act(async () => planner.restore('followUp:11'))
    expect(planner.included).toHaveLength(10)
    await act(async () => planner.remove('followUp:1'))
    await act(async () => planner.restore('followUp:11'))
    expect(planner.included.map((s) => s.key)).toContain('followUp:11')
  })

  it('orders the stops from the current location and opens one Google Maps route', async () => {
    mocks.optimizeRoute.mockResolvedValue({
      ok: true,
      order: [2, 0, 1],
      distanceMeters: 9000,
      durationSeconds: 1200,
    })
    await mount([stop(1), stop(2), stop(3)])
    await act(async () => planner.plan())

    expect(mocks.optimizeRoute).toHaveBeenCalledWith({
      accountId: 'account-1234',
      start: here,
      stops: [stop(1), stop(2), stop(3)].map((s) => s.coordinate),
      signal: expect.any(AbortSignal),
    })
    expect(planner.route?.stops.map((s) => s.title)).toEqual([
      'Stop 3',
      'Stop 1',
      'Stop 2',
    ])
    expect(planner.route?.startsAtCurrentLocation).toBe(true)
    expect(planner.route?.handoff.mode).toBe('route')
    expect(mocks.capture).toHaveBeenCalledWith('route_plan_created', {
      stop_count: 3,
      removed_count: 0,
      start: 'current_location',
      optimized: true,
    })

    await act(async () => planner.open(0))
    await act(async () => planner.open(0))
    expect(mocks.openURL).toHaveBeenCalledTimes(2)
    expect(
      mocks.capture.mock.calls.filter(
        ([event]) => event === 'route_plan_navigation_started'
      )
    ).toEqual([
      [
        'route_plan_navigation_started',
        { app: 'google', handoff: 'route', stop_count: 3 },
      ],
    ])
  })

  it('starts from a chosen stop without asking for the location', async () => {
    mocks.provider = 'waze'
    mocks.optimizeRoute.mockResolvedValue({
      ok: true,
      order: [1, 0],
      distanceMeters: 1,
      durationSeconds: 1,
    })
    await mount([stop(1), stop(2), stop(3)])
    await act(async () => planner.chooseStart('followUp:2'))
    await act(async () => planner.plan())

    expect(mocks.currentCoordinate).not.toHaveBeenCalled()
    expect(mocks.optimizeRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        start: stop(2).coordinate,
        stops: [stop(1).coordinate, stop(3).coordinate],
      })
    )
    expect(planner.route?.stops.map((s) => s.title)).toEqual([
      'Stop 2',
      'Stop 3',
      'Stop 1',
    ])
    expect(planner.route?.handoff.mode).toBe('stopByStop')
    expect(planner.route?.handoff.links).toHaveLength(3)
  })

  it('skips the server when there is only one stop to visit', async () => {
    await mount([stop(1), stop(2)])
    await act(async () => planner.remove('followUp:2'))
    await act(async () => planner.plan())
    expect(mocks.optimizeRoute).not.toHaveBeenCalled()
    expect(mocks.currentCoordinate).not.toHaveBeenCalled()
    expect(planner.route?.stops).toHaveLength(1)
    expect(planner.route?.summary).toBeUndefined()
    expect(mocks.capture).toHaveBeenCalledWith(
      'route_plan_created',
      expect.objectContaining({ optimized: false, removed_count: 1 })
    )
  })

  it('explains a missing location or a refused request, and records the failure', async () => {
    mocks.currentCoordinate.mockResolvedValueOnce({
      ok: false,
      reason: 'unavailable',
    })
    await mount([stop(1), stop(2)])
    await act(async () => planner.plan())
    expect(planner.error).toEqual({ code: 'location' })
    expect(planner.route).toBeNull()

    mocks.currentCoordinate.mockResolvedValueOnce({
      ok: false,
      reason: 'denied',
    })
    await act(async () => planner.plan())
    expect(planner.error).toEqual({ code: 'location_denied' })

    mocks.optimizeRoute.mockResolvedValueOnce({
      ok: false,
      error: 'daily_limit',
    })
    await act(async () => planner.plan())
    expect(planner.error).toEqual({ code: 'daily_limit' })
    expect(mocks.capture).toHaveBeenCalledWith('route_plan_failed', {
      error_code: 'daily_limit',
    })
    expect(planner.planning).toBe(false)

    // Changing the stops clears the message.
    await act(async () => planner.remove('followUp:1'))
    expect(planner.error).toBeNull()
  })

  it('keeps the server wait time with a rate limit', async () => {
    mocks.optimizeRoute.mockResolvedValueOnce({
      ok: false,
      error: 'rate_limited',
      retryAfterMs: 30_000,
    })
    await mount([stop(1), stop(2)])
    await act(async () => planner.plan())
    expect(planner.error).toEqual({
      code: 'rate_limited',
      retryAfterMs: 30_000,
    })
  })

  it('cancels a plan in flight when the screen goes away', async () => {
    let signal: AbortSignal | undefined
    mocks.optimizeRoute.mockImplementationOnce(
      (args: { signal: AbortSignal }) => {
        signal = args.signal
        return new Promise((resolve) =>
          args.signal.addEventListener('abort', () =>
            resolve({ ok: false, error: 'cancelled' })
          )
        )
      }
    )
    await mount([stop(1), stop(2)])
    let planning: Promise<void> | undefined
    await act(async () => {
      planning = planner.plan()
    })
    await act(async () => renderer.unmount())
    await planning
    expect(signal?.aborted).toBe(true)
    expect(mocks.capture).not.toHaveBeenCalledWith(
      'route_plan_failed',
      expect.anything()
    )
  })
})
