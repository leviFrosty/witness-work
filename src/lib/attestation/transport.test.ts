import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyNetworkError } from '@/lib/http/networkError'
import { perf } from '@/lib/perf'

vi.mock('expo-network', () => ({
  addNetworkStateListener: vi.fn(),
  getNetworkStateAsync: vi.fn(() => new Promise(() => {})),
}))
vi.mock('@/lib/perf', () => ({ perf: { count: vi.fn() } }))

import apis from '@/constants/apis'
import {
  ENDPOINT_TIMEOUT_MS,
  STATUS_TIMEOUT_MS,
  attestationBaseUrl,
  attestationDevBypass,
  attestationTransport,
} from '@/lib/attestation/transport'
import { apiDevBypass } from '@/lib/http/devBypass'
import { AttestationHttpError } from '@/lib/attestation/appAttest'
import type { AttestationEndpoint } from '@/lib/attestation/appAttest'

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

describe('Attestation transport timeouts', () => {
  it('gives every attestation round-trip a short budget', () => {
    expect(ENDPOINT_TIMEOUT_MS).toEqual({
      challenge: 15_000,
      registration: 15_000,
      verify: 15_000,
    })
    expect(STATUS_TIMEOUT_MS).toBe(8_000)
  })

  it.each(Object.entries(ENDPOINT_TIMEOUT_MS))(
    'times out %s after its own budget as a network failure',
    async (endpoint, budget) => {
      vi.useFakeTimers()
      vi.stubGlobal('fetch', stalledFetch())
      let failure: unknown
      void attestationTransport
        .post(endpoint as AttestationEndpoint, {})
        .catch((e: unknown) => {
          failure = e
        })
      await vi.advanceTimersByTimeAsync(budget - 1)
      expect(failure).toBeUndefined()
      await vi.advanceTimersByTimeAsync(1)
      expect(failure).toBeInstanceOf(AttestationHttpError)
      expect(failure).toMatchObject({ kind: 'network', timedOut: true })
      expect(classifyNetworkError(failure)).toBe('timeout')
    }
  )

  it('times out the status probe after 8 s', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', stalledFetch())
    let failure: unknown
    void attestationTransport.getStatus().catch((e: unknown) => {
      failure = e
    })
    await vi.advanceTimersByTimeAsync(STATUS_TIMEOUT_MS)
    expect(failure).toMatchObject({ kind: 'network', timedOut: true })
  })
})

describe('Attestation transport errors', () => {
  it('carries the server Retry-After', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ ok: false, error: 'Busy', code: 'rate_limited' }),
            { status: 429, headers: { 'retry-after': '15' } }
          )
      )
    )
    await expect(
      attestationTransport.post('challenge', { a: 1 })
    ).rejects.toMatchObject({
      serverCode: 'rate_limited',
      retryAfterMs: 15_000,
    })
  })

  it('maps an error body to the authorizers’ metadata, reading code not error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(401, {
          error: 'App Attest assertion rejected',
          code: 'attestation_failed',
          reason: 'challenge_expired',
          action: 'start_new_operation',
        })
      )
    )
    await expect(
      attestationTransport.post('verify', { a: 1 })
    ).rejects.toMatchObject({
      kind: 'http',
      status: 401,
      serverCode: 'attestation_failed',
      reason: 'challenge_expired',
      action: 'start_new_operation',
    })
  })

  it('maps a connection failure to network and a caller abort to cancelled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Network request failed')
      })
    )
    const offline = await attestationTransport
      .post('challenge', {})
      .catch((e: unknown) => e)
    expect(offline).toMatchObject({ kind: 'network', timedOut: false })
    expect(classifyNetworkError(offline)).toBe('offline')

    vi.stubGlobal('fetch', stalledFetch())
    const controller = new AbortController()
    const pending = attestationTransport.post(
      'challenge',
      {},
      { signal: controller.signal }
    )
    controller.abort()
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' })
  })

  it('gets challenges, registers keys, and verifies at /attestation/v1', async () => {
    const fetchImpl = vi.fn(async () => json(200, { ok: true }))
    vi.stubGlobal('fetch', fetchImpl)
    await attestationTransport.post('challenge', {})
    await attestationTransport.post('registration', {})
    await attestationTransport.post('verify', {})
    const urls = (fetchImpl.mock.calls as unknown as [string][]).map(
      ([url]) => new URL(url).pathname
    )
    expect(urls).toEqual([
      '/attestation/v1/challenge',
      '/attestation/v1/register',
      '/attestation/v1/verify',
    ])
  })

  it('reports the API base the attestation routes live under', () => {
    expect(`${attestationBaseUrl}/attestation/v1/status`).toBe(
      apis.attestationStatus
    )
  })

  it('sends JSON with the caller headers', async () => {
    const fetchImpl = vi.fn(async () => json(200, { ok: true }))
    vi.stubGlobal('fetch', fetchImpl)
    await expect(
      attestationTransport.post(
        'verify',
        { a: 1 },
        { headers: { 'x-test': '1' } }
      )
    ).resolves.toEqual({ ok: true })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toMatch(/\/attestation\/v1\/verify$/)
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"a":1}')
    expect(init.headers).toMatchObject({
      'x-test': '1',
      'content-type': 'application/json',
    })
  })
})

describe('Attestation status probe', () => {
  it('reads the capabilities from /attestation/v1/status', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      void url
      return json(200, { ok: true, capabilities: { appAttest: {} } })
    })
    vi.stubGlobal('fetch', fetchImpl)
    await attestationTransport.getStatus()
    expect(fetchImpl.mock.calls[0][0]).toMatch(/\/attestation\/v1\/status$/)
    expect(perf.count).toHaveBeenCalledWith('attestation:statusProbe')
  })

  it('shares one request between concurrent callers', async () => {
    let answer!: (response: Response) => void
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve
        })
    )
    vi.stubGlobal('fetch', fetchImpl)
    const first = attestationTransport.getStatus()
    const second = attestationTransport.getStatus()
    answer(json(200, { available: true }))
    await expect(first).resolves.toEqual({ available: true })
    await expect(second).resolves.toEqual({ available: true })
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { available: false }))
    )
    await expect(attestationTransport.getStatus()).resolves.toEqual({
      available: false,
    })
  })
})

describe('Attestation dev bypass', () => {
  it('is the shared API bypass', () => {
    expect(attestationDevBypass).toBe(apiDevBypass)
  })
})
