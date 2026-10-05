import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>()
  return { ...actual, default: { ...actual.default, post: mocks.post } }
})

import { optimizeRoute } from '@/features/route-planning/lib/routePlanningClient'

const args = {
  accountId: 'account-1234',
  start: { latitude: 39.1, longitude: -84.5 },
  stops: [
    { latitude: 39.11, longitude: -84.51 },
    { latitude: 39.12, longitude: -84.52 },
  ],
}

const httpError = (status: number, data: unknown) =>
  new AxiosError('failed', 'ERR_BAD_RESPONSE', undefined, undefined, {
    status,
    statusText: '',
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
  })

beforeEach(() => mocks.post.mockReset())

describe('optimizeRoute', () => {
  it('sends the account id and bare coordinates only', async () => {
    mocks.post.mockResolvedValue({
      data: { order: [1, 0], distanceMeters: 5000, durationSeconds: 700 },
    })
    await expect(optimizeRoute(args)).resolves.toEqual({
      ok: true,
      order: [1, 0],
      distanceMeters: 5000,
      durationSeconds: 700,
    })
    const [url, body] = mocks.post.mock.calls[0]!
    expect(url).toBe(
      'https://ww-proxy.leviwilkerson.com/route-planning/optimize'
    )
    expect(body).toEqual({
      accountId: 'account-1234',
      start: { lat: 39.1, lng: -84.5 },
      stops: [
        { lat: 39.11, lng: -84.51 },
        { lat: 39.12, lng: -84.52 },
      ],
    })
  })

  it('rejects an answer that does not reorder exactly the stops sent', async () => {
    mocks.post.mockResolvedValue({
      data: { order: [0, 0], distanceMeters: 1, durationSeconds: 1 },
    })
    await expect(optimizeRoute(args)).resolves.toEqual({
      ok: false,
      error: 'failed',
    })
  })

  it('passes known server codes through and folds the rest into failed', async () => {
    for (const code of [
      'supporter_required',
      'daily_limit',
      'rate_limited',
      'no_route',
      'unavailable',
    ]) {
      mocks.post.mockRejectedValueOnce(httpError(400, { code }))
      await expect(optimizeRoute(args)).resolves.toEqual({
        ok: false,
        error: code,
      })
    }
    mocks.post.mockRejectedValueOnce(httpError(400, { code: 'bad_request' }))
    await expect(optimizeRoute(args)).resolves.toEqual({
      ok: false,
      error: 'failed',
    })
  })

  it('reports a request with no response as offline', async () => {
    mocks.post.mockRejectedValueOnce(new AxiosError('Network Error'))
    await expect(optimizeRoute(args)).resolves.toEqual({
      ok: false,
      error: 'offline',
    })
  })
})
