import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  sessionError: null as unknown,
}))
vi.mock('@/lib/http/online', () => ({ isKnownOffline: () => false }))
vi.mock('@/lib/perf', () => ({ perf: { count: vi.fn() } }))
// The session adds its bearer token; `sessionError` stands in for a session
// that couldn't be opened.
vi.mock('@/lib/serverAccount', async () => {
  const { request } = await import('@/lib/http/request')
  return {
    accountSessions: {
      request: async (options: Parameters<typeof request>[0]) => {
        if (mocks.sessionError) throw mocks.sessionError
        return request({
          ...options,
          headers: { ...options.headers, authorization: 'Bearer at-1' },
        })
      },
    },
  }
})
vi.stubGlobal('fetch', mocks.fetch)

import { fetchRouteDirections } from '@/features/route-planning/lib/routeDirectionsClient'
import { AccountSessionError } from '@/lib/serverAccount/session'

const points = [
  { latitude: 39.1, longitude: -84.5 },
  { latitude: 39.11, longitude: -84.51 },
]
const leg = {
  distanceMeters: 1500,
  durationSeconds: 240,
  coordinates: [39.1, -84.5, 39.11, -84.51],
}

const respond = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) => new Response(JSON.stringify(body), { status, headers })

beforeEach(() => {
  mocks.fetch.mockReset()
  mocks.sessionError = null
})

describe('fetchRouteDirections', () => {
  it('sends bare coordinates as the session and returns the legs', async () => {
    mocks.fetch.mockResolvedValue(
      respond(200, { legs: [leg], remainingToday: 99 })
    )
    await expect(fetchRouteDirections({ points })).resolves.toEqual({
      ok: true,
      legs: [leg],
    })
    const [url, init] = mocks.fetch.mock.calls[0]! as [string, RequestInit]
    expect(url).toBe('https://api.witnesswork.app/route-planning/directions')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer at-1')
    expect(JSON.parse(init.body as string)).toEqual({
      points: [
        { lat: 39.1, lng: -84.5 },
        { lat: 39.11, lng: -84.51 },
      ],
    })
  })

  it('refuses legs that don’t match the points', async () => {
    mocks.fetch.mockResolvedValue(respond(200, { legs: [leg, leg] }))
    expect((await fetchRouteDirections({ points })).ok).toBe(false)
    mocks.fetch.mockResolvedValue(
      respond(200, { legs: [{ ...leg, coordinates: [1, 2, 3] }] })
    )
    expect((await fetchRouteDirections({ points })).ok).toBe(false)
    mocks.fetch.mockResolvedValue(
      respond(200, { legs: [{ ...leg, coordinates: [] }] })
    )
    expect((await fetchRouteDirections({ points })).ok).toBe(false)
  })

  it('says when there’s no road, and how long to wait otherwise', async () => {
    mocks.fetch.mockResolvedValue(
      respond(422, { ok: false, error: 'x', code: 'no_route' })
    )
    await expect(fetchRouteDirections({ points })).resolves.toEqual({
      ok: false,
      noRoute: true,
    })

    mocks.fetch.mockResolvedValue(
      respond(
        429,
        { ok: false, error: 'x', code: 'daily_limit' },
        { 'retry-after': '120' }
      )
    )
    await expect(fetchRouteDirections({ points })).resolves.toEqual({
      ok: false,
      retryAfterMs: 120_000,
    })
  })

  it('waits a long while on a device that can’t hold a session', async () => {
    mocks.sessionError = new AccountSessionError('attestation', {
      attestation: 'device',
    })
    const result = await fetchRouteDirections({ points })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.retryAfterMs).toBe(30 * 60_000)
  })
})
