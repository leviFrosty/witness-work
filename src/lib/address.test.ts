import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  capture: vi.fn(),
  openURL: vi.fn(),
  offline: false,
  os: 'ios',
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mocks.os
    },
  },
}))
vi.mock('expo-location', () => ({}))
vi.mock('@/stores/preferences', () => ({}))
vi.mock('@/lib/links', () => ({ openURL: mocks.openURL }))
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

import links from '@/constants/links'
import { fetchCoordinateFromAddress, navigateTo } from '@/lib/address'
import { isRetryableGeocodeFailure } from '@/lib/geocodeRetry'
import { classifyNetworkError } from '@/lib/http/networkError'
import type { Contact } from '@/types/contact'

const address = { line1: '12 Oak St', city: 'Springfield' }
const respond = (status: number, body: unknown) =>
  mocks.fetch.mockImplementation(
    async () => new Response(JSON.stringify(body), { status })
  )

beforeEach(() => {
  vi.clearAllMocks()
  mocks.offline = false
  mocks.os = 'ios'
})

describe('navigateTo', () => {
  const contact = {
    id: 'c1',
    name: 'Sam Sample',
    address: { line1: '12 Example St #4', city: 'Faketown & Co' },
  } as Contact
  const query = '12%20Example%20St%20%234%20Faketown%20%26%20Co'
  const opened = () => mocks.openURL.mock.calls[0]

  it('keeps a # or & in the address inside the search', () => {
    navigateTo(contact, 'apple')
    expect(opened()[0]).toBe(`https://maps.apple.com/?q=${query}`)
  })

  it('falls back to Google Maps when Apple Maps cannot open', () => {
    navigateTo(contact, null)
    expect(opened()[0]).toBe(`${links.appleMapsBase}${query}`)
    expect(opened()[1]).toMatchObject({
      alert: { title: 'couldNotOpenMaps' },
      fallbackUrl: `${links.googleMapsBase}${query}`,
    })
  })

  it('opens Google or Waze directly, with no fallback', () => {
    navigateTo(contact, 'google')
    navigateTo(contact, 'waze')
    expect(mocks.openURL.mock.calls.map(([url]) => url)).toEqual([
      `${links.googleMapsBase}${query}`,
      `${links.wazeMapsBase}${query}`,
    ])
    expect(mocks.openURL.mock.calls[0][1].fallbackUrl).toBeUndefined()
    expect(mocks.openURL.mock.calls[1][1].fallbackUrl).toBeUndefined()
  })

  it('opens Google Maps on Android', () => {
    mocks.os = 'android'
    navigateTo(contact, 'apple')
    expect(opened()[0]).toBe(`${links.googleMapsBase}${query}`)
  })

  it('searches a dragged pin by its coordinate', () => {
    navigateTo(
      {
        ...contact,
        coordinate: { latitude: 1.5, longitude: -2.25 },
        userDraggedCoordinate: true,
      },
      'apple'
    )
    expect(opened()[0]).toBe(`${links.appleMapsBase}1.5%2C%20-2.25`)
  })
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

  it("doesn't report a captive portal's sign-in page, and keeps it retryable", async () => {
    mocks.fetch.mockImplementation(
      async () =>
        new Response(
          '<!DOCTYPE html><html><body>Sign in to Wi-Fi</body></html>',
          {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          }
        )
    )
    const failure = await fetchCoordinateFromAddress(vi.fn(), address).catch(
      (error: unknown) => error
    )
    expect(failure).toMatchObject({ kind: 'offline' })
    expect(isRetryableGeocodeFailure(classifyNetworkError(failure))).toBe(true)
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
