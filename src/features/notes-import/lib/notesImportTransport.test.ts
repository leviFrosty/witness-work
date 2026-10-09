import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyNetworkError } from '@/lib/http/networkError'

vi.mock('expo-network', () => ({
  addNetworkStateListener: vi.fn(),
  getNetworkStateAsync: vi.fn(() => new Promise(() => {})),
}))
vi.mock('@/lib/perf', () => ({ perf: { count: vi.fn() } }))

import {
  ENDPOINT_TIMEOUT_MS,
  STATUS_TIMEOUT_MS,
  notesImportDevBypass,
  notesImportTransport,
} from '@/features/notes-import/lib/notesImportTransport'
import { apiDevBypass } from '@/lib/http/devBypass'
import { NotesImportAppAttestHttpError } from '@/features/notes-import/lib/notesImportAppAttest'
import type { NotesImportAppAttestEndpoint } from '@/features/notes-import/lib/notesImportAppAttest'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status })

/** A fetch that never answers until its signal aborts. */
const stalledFetch = () =>
  vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
        )
      )
  )

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Notes Import transport timeouts', () => {
  it('gives only the legacy blocking POST the long budget', () => {
    expect(ENDPOINT_TIMEOUT_MS).toEqual({
      challenge: 15_000,
      registration: 15_000,
      verify: 15_000,
      kickoff: 15_000,
      legacy: 90_000,
    })
    expect(STATUS_TIMEOUT_MS).toBe(8_000)
  })

  it.each(Object.entries(ENDPOINT_TIMEOUT_MS))(
    'times out %s after its own budget as a network failure',
    async (endpoint, budget) => {
      vi.useFakeTimers()
      vi.stubGlobal('fetch', stalledFetch())
      let failure: unknown
      void notesImportTransport
        .post(endpoint as NotesImportAppAttestEndpoint, {})
        .catch((e: unknown) => {
          failure = e
        })
      await vi.advanceTimersByTimeAsync(budget - 1)
      expect(failure).toBeUndefined()
      await vi.advanceTimersByTimeAsync(1)
      expect(failure).toBeInstanceOf(NotesImportAppAttestHttpError)
      expect(failure).toMatchObject({ kind: 'network', timedOut: true })
      expect(classifyNetworkError(failure)).toBe('timeout')
    }
  )

  it('times out the status probe after 8 s', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', stalledFetch())
    let failure: unknown
    void notesImportTransport.getStatus().catch((e: unknown) => {
      failure = e
    })
    await vi.advanceTimersByTimeAsync(STATUS_TIMEOUT_MS)
    expect(failure).toMatchObject({ kind: 'network', timedOut: true })
  })
})

describe('Notes Import transport errors', () => {
  it('carries the server Retry-After', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ ok: false, error: 'Busy', code: 'active_cap' }),
            { status: 429, headers: { 'retry-after': '15' } }
          )
      )
    )
    await expect(
      notesImportTransport.post('kickoff', { a: 1 })
    ).rejects.toMatchObject({ serverCode: 'active_cap', retryAfterMs: 15_000 })
  })

  it('maps an error body to the authorizers’ metadata, reading code not error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(429, {
          error: 'You have used every import',
          code: 'limit_reached',
          reason: 'window',
          action: 'none',
          credits: { remaining: 0 },
        })
      )
    )
    await expect(
      notesImportTransport.post('kickoff', { a: 1 })
    ).rejects.toMatchObject({
      kind: 'http',
      status: 429,
      serverCode: 'limit_reached',
      reason: 'window',
      action: 'none',
      credits: { remaining: 0 },
    })
  })

  it('maps a connection failure to network and a caller abort to cancelled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Network request failed')
      })
    )
    const offline = await notesImportTransport
      .post('challenge', {})
      .catch((e: unknown) => e)
    expect(offline).toMatchObject({ kind: 'network', timedOut: false })
    expect(classifyNetworkError(offline)).toBe('offline')

    vi.stubGlobal('fetch', stalledFetch())
    const controller = new AbortController()
    const pending = notesImportTransport.post(
      'challenge',
      {},
      { signal: controller.signal }
    )
    controller.abort()
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' })
  })

  it('sends JSON with the caller headers', async () => {
    const fetchImpl = vi.fn(async () => json(200, { ok: true }))
    vi.stubGlobal('fetch', fetchImpl)
    await expect(
      notesImportTransport.post(
        'verify',
        { a: 1 },
        { headers: { 'x-test': '1' } }
      )
    ).resolves.toEqual({ ok: true })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toMatch(/\/notes-import\/verify$/)
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"a":1}')
    expect(init.headers).toMatchObject({
      'x-test': '1',
      'content-type': 'application/json',
    })
  })
})

describe('Notes Import status probe', () => {
  it('shares one request between concurrent callers', async () => {
    let answer!: (response: Response) => void
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve
        })
    )
    vi.stubGlobal('fetch', fetchImpl)
    const first = notesImportTransport.getStatus()
    const second = notesImportTransport.getStatus()
    answer(json(200, { available: true }))
    await expect(first).resolves.toEqual({ available: true })
    await expect(second).resolves.toEqual({ available: true })
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { available: false }))
    )
    await expect(notesImportTransport.getStatus()).resolves.toEqual({
      available: false,
    })
  })
})

describe('Notes Import dev bypass', () => {
  it('is the shared API bypass', () => {
    expect(notesImportDevBypass).toBe(apiDevBypass)
  })
})
