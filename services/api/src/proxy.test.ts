import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Environment } from './types'

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }))

// The proxy captures `fetch` when its module loads, before Sentry wraps the
// global, so HERE's stub has to be in place before the import below.
const here = vi.hoisted(() => {
  const state: { fetch?: typeof fetch } = {}
  globalThis.fetch = ((...args: Parameters<typeof fetch>) => state.fetch!(...args)) as typeof fetch
  return state
})

const stubHere = (mock: unknown) => {
  here.fetch = mock as typeof fetch
}

import worker from './index'

const ENV = {
  HERE_API_KEY: 'test-key',
  RATE_LIMITER: { limit: async () => ({ success: true }) },
} as unknown as Environment

async function geocode() {
  const context = { waitUntil: () => {}, passThroughOnException: () => {} }
  return worker.fetch!(
    new Request('https://ww-proxy.leviwilkerson.com/geocode?q=Main') as never,
    ENV,
    context as never
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('HERE API proxy', () => {
  it('bypasses the global fetch that Sentry instruments', async () => {
    const hereMock = vi.fn(async () => Response.json({ items: [] }))
    stubHere(hereMock)
    const instrumented = vi.fn(async () => Response.json({}))
    vi.stubGlobal('fetch', instrumented)

    const response = await geocode()

    expect(response.status).toBe(200)
    expect(hereMock).toHaveBeenCalledOnce()
    expect(instrumented).not.toHaveBeenCalled()
  })

  it('passes JSON responses through with the upstream status', async () => {
    const fetchMock = vi.fn(async () => Response.json({ items: [] }, { status: 200 }))
    stubHere(fetchMock)

    const response = await geocode()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ items: [] })
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]))
    expect(url.searchParams.get('apiKey')).toBe('test-key')
  })

  it('returns 502 when HERE returns a plain-text Cloudflare error page', async () => {
    stubHere(vi.fn(async () => new Response('error code: 520\n', { status: 520 })))

    const response = await geocode()

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'upstream_error',
      code: 'upstream_error',
    })
  })

  it('keeps HERE’s error body and adds the envelope and Retry-After on 429', async () => {
    stubHere(
      vi.fn(async () =>
        Response.json(
          { status: 429, title: 'Too Many Requests' },
          { status: 429, headers: { 'Retry-After': '7' } }
        )
      )
    )

    const response = await geocode()

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('7')
    expect(await response.json()).toEqual({
      status: 429,
      title: 'Too Many Requests',
      ok: false,
      error: 'rate_limited',
      code: 'rate_limited',
      retryAfter: 7,
    })
  })

  it('defaults Retry-After when HERE is unavailable without one', async () => {
    stubHere(
      vi.fn(async () => Response.json({ title: 'Unavailable' }, { status: 503 }))
    )

    const response = await geocode()

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('30')
    expect(await response.json()).toMatchObject({
      code: 'upstream_error',
      retryAfter: 30,
    })
  })

  it('passes a HERE 400 through with a bad_request code and no Retry-After', async () => {
    stubHere(
      vi.fn(async () =>
        Response.json({ title: "Illegal input for parameter 'q'" }, { status: 400 })
      )
    )

    const response = await geocode()

    expect(response.status).toBe(400)
    expect(response.headers.get('Retry-After')).toBeNull()
    expect(await response.json()).toEqual({
      title: "Illegal input for parameter 'q'",
      ok: false,
      error: 'bad_request',
      code: 'bad_request',
    })
  })

  it('returns 502 upstream_error when HERE can’t be reached', async () => {
    stubHere(
      vi.fn(async () => {
        throw new TypeError('Network connection lost.')
      })
    )

    const response = await geocode()

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'upstream_error',
      code: 'upstream_error',
    })
  })
})
