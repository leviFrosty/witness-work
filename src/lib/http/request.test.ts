import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-network', () => ({
  addNetworkStateListener: vi.fn(),
  getNetworkStateAsync: vi.fn(() => new Promise(() => {})),
}))
vi.mock('@/lib/perf', () => ({ perf: { count: vi.fn() } }))

import { HttpError, request, retryAfterMs } from '@/lib/http/request'

const json = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) => new Response(JSON.stringify(body), { status, headers })

afterEach(() => {
  vi.useRealTimers()
})

describe('request', () => {
  it('parses JSON and sends JSON bodies', async () => {
    const fetchImpl = vi.fn(async () => json(200, { ok: true }))
    const result = await request<{ ok: boolean }>({
      url: 'https://api.test/x',
      json: { a: 1 },
      timeoutMs: 1000,
      fetchImpl,
    })
    expect(result.data).toEqual({ ok: true })
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"a":1}')
    expect((init.headers as Record<string, string>)['content-type']).toBe(
      'application/json'
    )
  })

  it('times out a stalled request, body included', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
          )
        )
    )
    await expect(
      request({
        url: 'https://api.test/x',
        timeoutMs: 20,
        fetchImpl: fetchImpl as typeof fetch,
      })
    ).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('reports a caller abort as cancelled', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
          )
        )
    )
    const pending = request({
      url: 'https://api.test/x',
      timeoutMs: 10_000,
      signal: controller.signal,
      fetchImpl: fetchImpl as typeof fetch,
    })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' })
  })

  it('types HTTP failures with the server code and Retry-After', async () => {
    const fetchImpl = vi.fn(async () =>
      json(429, { ok: false, error: 'rate_limited' }, { 'retry-after': '7' })
    )
    const error = await request({
      url: 'https://api.test/x',
      timeoutMs: 1000,
      fetchImpl,
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({
      kind: 'rateLimited',
      status: 429,
      serverCode: 'rate_limited',
      retryAfterMs: 7000,
    })
  })

  it('retries idempotent requests after retryable failures only', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(503, {}))
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(json(200, { done: true }))
    const result = await request({
      url: 'https://api.test/x',
      timeoutMs: 1000,
      retry: { retries: 2, baseDelayMs: 1 },
      fetchImpl,
    })
    expect(result.data).toEqual({ done: true })
    expect(fetchImpl).toHaveBeenCalledTimes(3)

    const clientError = vi.fn(async () => json(400, { error: 'bad' }))
    await expect(
      request({
        url: 'https://api.test/x',
        timeoutMs: 1000,
        retry: { retries: 2 },
        fetchImpl: clientError,
      })
    ).rejects.toMatchObject({ kind: 'client', serverCode: 'bad' })
    expect(clientError).toHaveBeenCalledTimes(1)
  })

  it('attaches the parsed error body, or null when it is not JSON', async () => {
    const body = { code: 'limit_reached', reason: 'window', credits: { n: 1 } }
    await expect(
      request({
        url: 'https://api.test/x',
        timeoutMs: 1000,
        fetchImpl: vi.fn(async () => json(429, body)),
      })
    ).rejects.toMatchObject({ kind: 'rateLimited', status: 429, body })
    await expect(
      request({
        url: 'https://api.test/x',
        timeoutMs: 1000,
        fetchImpl: vi.fn(async () => new Response('oops', { status: 502 })),
      })
    ).rejects.toMatchObject({ kind: 'server', serverCode: null, body: null })
  })

  it('never retries a POST unless it is marked idempotent', async () => {
    const fetchImpl = vi.fn(async () => json(503, {}))
    await expect(
      request({
        url: 'https://api.test/x',
        json: {},
        timeoutMs: 1000,
        retry: { retries: 2, baseDelayMs: 1 },
        fetchImpl,
      })
    ).rejects.toMatchObject({ kind: 'server' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    await expect(
      request({
        url: 'https://api.test/x',
        json: {},
        idempotent: true,
        timeoutMs: 1000,
        retry: { retries: 1, baseDelayMs: 1 },
        fetchImpl,
      })
    ).rejects.toMatchObject({ kind: 'server' })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('reports transport failures as offline', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Network request failed')
    })
    await expect(
      request({ url: 'https://api.test/x', timeoutMs: 1000, fetchImpl })
    ).rejects.toMatchObject({ kind: 'offline' })
  })
})

describe('retryAfterMs', () => {
  it('reads seconds and HTTP dates', () => {
    expect(retryAfterMs('3')).toBe(3000)
    expect(retryAfterMs(null)).toBeNull()
    expect(retryAfterMs('soon')).toBeNull()
    const inFive = new Date(Date.now() + 5000).toUTCString()
    expect(retryAfterMs(inFive)).toBeGreaterThan(3000)
  })
})
