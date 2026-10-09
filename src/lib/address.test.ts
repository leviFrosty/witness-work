import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  capture: vi.fn(),
  offline: false,
}))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('expo-location', () => ({}))
vi.mock('@/stores/preferences', () => ({}))
vi.mock('@/lib/links', () => ({ openURL: vi.fn() }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: mocks.capture },
}))
vi.mock('@/lib/http/online', () => ({ isKnownOffline: () => mocks.offline }))
vi.mock('@/lib/perf', () => ({ perf: { count: vi.fn() } }))
vi.mock('@/constants/apis', () => ({
  default: { geocode: 'https://api.test/geocode' },
}))
vi.stubGlobal('fetch', mocks.fetch)

import { fetchCoordinateFromAddress } from '@/lib/address'

const address = { line1: '12 Oak St', city: 'Springfield' }
const respond = (status: number, body: unknown) =>
  mocks.fetch.mockImplementation(
    async () => new Response(JSON.stringify(body), { status })
  )

beforeEach(() => {
  vi.clearAllMocks()
  mocks.offline = false
})

describe('fetchCoordinateFromAddress', () => {
  it('returns the first match', async () => {
    respond(200, {
      items: [{ id: 'a', title: 'A', position: { lat: 1, lng: 2 } }],
    })
    const count = vi.fn()
    await expect(fetchCoordinateFromAddress(count, address)).resolves.toEqual({
      latitude: 1,
      longitude: 2,
    })
    expect(count).toHaveBeenCalledOnce()
  })

  it('returns null for no match and skips empty addresses', async () => {
    respond(200, { items: [] })
    await expect(fetchCoordinateFromAddress(vi.fn(), address)).resolves.toBe(
      null
    )
    await expect(
      fetchCoordinateFromAddress(vi.fn(), { line1: '' })
    ).resolves.toBe(null)
    expect(mocks.fetch).toHaveBeenCalledOnce()
  })

  it('reads a passed-through HERE 404 as no match, unreported', async () => {
    respond(404, { ok: false, error: 'Not found', code: 'not_found' })
    await expect(fetchCoordinateFromAddress(vi.fn(), address)).resolves.toBe(
      null
    )
    expect(mocks.capture).not.toHaveBeenCalled()
  })

  it('does not report a HERE outage', async () => {
    respond(502, { ok: false, error: 'HERE failed', code: 'upstream_error' })
    await expect(
      fetchCoordinateFromAddress(vi.fn(), address)
    ).rejects.toMatchObject({ kind: 'server' })
    // Retried once before giving up.
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    expect(mocks.capture).not.toHaveBeenCalled()
  })

  it('throws offline without reporting it', async () => {
    mocks.offline = true
    await expect(
      fetchCoordinateFromAddress(vi.fn(), address)
    ).rejects.toMatchObject({ kind: 'offline' })
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.capture).not.toHaveBeenCalled()
  })

  it('throws a cancel without reporting it', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      fetchCoordinateFromAddress(vi.fn(), address, controller.signal)
    ).rejects.toMatchObject({ kind: 'cancelled' })
    expect(mocks.capture).not.toHaveBeenCalled()
  })

  it('reports a malformed answer', async () => {
    respond(200, { nope: true })
    await expect(
      fetchCoordinateFromAddress(vi.fn(), address)
    ).rejects.toMatchObject({ kind: 'unknown' })
    expect(mocks.capture).toHaveBeenCalledOnce()
  })

  it('waits out a 429 and tries again', async () => {
    mocks.fetch
      .mockResolvedValueOnce(
        new Response('{"error":"rate_limited"}', {
          status: 429,
          headers: { 'retry-after': '0' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ items: [{ position: { lat: 3, lng: 4 } }] })
        )
      )
    await expect(fetchCoordinateFromAddress(vi.fn(), address)).resolves.toEqual(
      {
        latitude: 3,
        longitude: 4,
      }
    )
    expect(mocks.capture).not.toHaveBeenCalled()
  })
})
