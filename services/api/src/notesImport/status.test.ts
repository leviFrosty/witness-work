import { describe, expect, it, vi } from 'vitest'
import {
  anyAllowlistedProviderHealthy,
  getNotesImportStatus,
  type OpenRouterEndpointsResponse,
  type StatusKv,
} from './status'
import type { NotesImportConfig } from './config'
import type { Environment } from '../types'
import { makeMemoryKv } from '../test/memoryKv'

const CONFIG: NotesImportConfig = {
  model: 'deepseek/deepseek-v4.1-flash',
  providers: ['fireworks', 'digitalocean'],
  maxChars: 100_000,
  maxOutputTokens: 16_000,
  emptyWindowSeconds: 604_800,
  emptyWindowLimit: 5,
  entitlementId: 'Supporter',
  devBypassToken: null,
  requireProduction: true,
  activeImportCap: 2,
  activeImportCapSupporter: 5,
  resultRetentionSeconds: 3_600,
  subscribeTokenTtlSeconds: 3_600,
  reasoningEffort: 'low',
}

const ENV = {} as Environment
const DEFAULT_PUBLIC_LIMITS = {
  imports: { free: 3, supporter: null },
  refinements: { free: 5, supporter: null },
  windowDays: 30,
}
const APP_ATTEST_CAPABILITIES = {
  capabilities: {
    appAttest: { protocolVersions: [1, 2] },
    transcribe: { maxPages: 10, maxBytes: 4 * 1024 * 1024 },
  },
}

const endpointsBody = (
  endpoints: { provider_name: string; status: number }[]
): OpenRouterEndpointsResponse => ({ data: { endpoints } })

const okFetch = (body: OpenRouterEndpointsResponse): typeof fetch =>
  vi.fn(async () =>
    new Response(JSON.stringify(body), { status: 200 })
  ) as unknown as typeof fetch

const getStatus = (
  kv: ReturnType<typeof makeMemoryKv>,
  fetchFn: typeof fetch
) =>
  getNotesImportStatus({
    kv: kv as unknown as StatusKv,
    env: ENV,
    apiKey: 'k',
    config: CONFIG,
    fetchFn,
  })

describe('anyAllowlistedProviderHealthy', () => {
  it('uses only a healthy allowlisted provider', () => {
    expect(
      anyAllowlistedProviderHealthy(
        endpointsBody([{ provider_name: 'Fireworks', status: 0 }]),
        CONFIG.providers
      )
    ).toBe(true)
    expect(
      anyAllowlistedProviderHealthy(
        endpointsBody([{ provider_name: 'DeepInfra', status: 0 }]),
        CONFIG.providers
      )
    ).toBe(false)
    expect(
      anyAllowlistedProviderHealthy(
        endpointsBody([{ provider_name: 'Fireworks', status: -1 }]),
        CONFIG.providers
      )
    ).toBe(false)
  })

  it('matches provider names case/spacing-insensitively', () => {
    expect(
      anyAllowlistedProviderHealthy(
        endpointsBody([{ provider_name: 'Digital Ocean', status: 0 }]),
        CONFIG.providers
      )
    ).toBe(true)
  })
})

describe('getNotesImportStatus — discriminated schedule', () => {
  it('advertises App Attest v1 and v2 on available, unavailable, and fail-open results', async () => {
    const availableKv = makeMemoryKv()
    await availableKv.put('notes-import:provider-health', 'up')
    const unavailableKv = makeMemoryKv()
    await unavailableKv.put('notes-import:provider-health', 'down')
    const unavailableFetch = vi.fn() as unknown as typeof fetch
    const failedKv: StatusKv = {
      get: vi.fn(async () => {
        throw new Error('KV unavailable')
      }) as StatusKv['get'],
      put: vi.fn() as StatusKv['put'],
    }

    const results = await Promise.all([
      getStatus(availableKv, unavailableFetch),
      getStatus(unavailableKv, unavailableFetch),
      getNotesImportStatus({
        kv: failedKv,
        env: ENV,
        apiKey: 'k',
        config: CONFIG,
        fetchFn: unavailableFetch,
      }),
    ])

    for (const result of results) {
      expect(result.capabilities).toEqual({
        appAttest: { protocolVersions: [1, 2] },
        transcribe: { maxPages: 10, maxBytes: 4 * 1024 * 1024 },
      })
    }
    expect(unavailableFetch).not.toHaveBeenCalled()
  })

  it('returns no limits when the kill-switch is unavailable', async () => {
    const kv = makeMemoryKv()
    await kv.put(
      'notes-import:enabled',
      JSON.stringify({ available: false, reason: 'down for maintenance' })
    )
    const fetchFn = vi.fn() as unknown as typeof fetch

    await expect(getStatus(kv, fetchFn)).resolves.toEqual({
      ...APP_ATTEST_CAPABILITIES,
      available: false,
      reason: 'down for maintenance',
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('does not bypass an explicit kill-switch when the later cache read fails', async () => {
    const kv: StatusKv = {
      get: vi.fn(async (key: string) => {
        if (key === 'notes-import:enabled') {
          return JSON.stringify({ available: false, reason: 'maintenance' })
        }
        throw new Error('provider cache unavailable')
      }) as StatusKv['get'],
      put: vi.fn() as StatusKv['put'],
    }
    const fetchFn = vi.fn() as unknown as typeof fetch

    await expect(
      getNotesImportStatus({
        kv,
        env: ENV,
        apiKey: 'k',
        config: CONFIG,
        fetchFn,
      })
    ).resolves.toEqual({
      ...APP_ATTEST_CAPABILITIES,
      available: false,
      reason: 'maintenance',
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('returns the default resolved public schedule when available', async () => {
    const kv = makeMemoryKv()
    await expect(
      getStatus(
        kv,
        okFetch(endpointsBody([{ provider_name: 'Fireworks', status: 0 }]))
      )
    ).resolves.toEqual({
      ...APP_ATTEST_CAPABILITIES,
      available: true,
      limits: DEFAULT_PUBLIC_LIMITS,
    })
  })

  it('serializes unlimited as null while preserving zero and finite values', async () => {
    const kv = makeMemoryKv()
    await kv.put(
      'notes-import:limits',
      JSON.stringify({
        importsFree: 0,
        importsSupporter: 12,
        refinementsFree: -1,
        refinementsSupporter: 0,
        windowDays: 14.5,
      })
    )
    await expect(
      getStatus(
        kv,
        okFetch(endpointsBody([{ provider_name: 'Fireworks', status: 0 }]))
      )
    ).resolves.toEqual({
      ...APP_ATTEST_CAPABILITIES,
      available: true,
      limits: {
        imports: { free: 0, supporter: 12 },
        refinements: { free: null, supporter: 0 },
        windowDays: 14.5,
      },
    })
  })

  it('falls through available:true kill-switch and still supplies the schedule', async () => {
    const kv = makeMemoryKv()
    await kv.put(
      'notes-import:enabled',
      JSON.stringify({ available: true, reason: '' })
    )
    await expect(
      getStatus(
        kv,
        okFetch(endpointsBody([{ provider_name: 'Fireworks', status: 0 }]))
      )
    ).resolves.toEqual({
      ...APP_ATTEST_CAPABILITIES,
      available: true,
      limits: DEFAULT_PUBLIC_LIMITS,
    })
  })
})

describe('getNotesImportStatus — provider health and caching', () => {
  it('caches healthy provider status and returns the resolved schedule', async () => {
    const kv = makeMemoryKv()
    const result = await getStatus(
      kv,
      okFetch(endpointsBody([{ provider_name: 'Fireworks', status: 0 }]))
    )
    expect(result).toEqual({
      ...APP_ATTEST_CAPABILITIES,
      available: true,
      limits: DEFAULT_PUBLIC_LIMITS,
    })
    expect(JSON.parse(kv.store.get('notes-import:provider-health')!)).toEqual({
      healthy: true,
      checkedAt: expect.any(Number),
    })
  })

  it('returns unavailable without limits and caches when all providers are down', async () => {
    const kv = makeMemoryKv()
    const result = await getStatus(
      kv,
      okFetch(endpointsBody([{ provider_name: 'Fireworks', status: -1 }]))
    )
    expect(result).toEqual({
      ...APP_ATTEST_CAPABILITIES,
      available: false,
      reason: 'no_provider',
    })
    expect(JSON.parse(kv.store.get('notes-import:provider-health')!)).toEqual({
      healthy: false,
      checkedAt: expect.any(Number),
    })
  })

  it('keeps a confirmed unhealthy result when the cache write fails', async () => {
    const kv: StatusKv = {
      get: vi.fn(async () => null) as StatusKv['get'],
      put: vi.fn(async () => {
        throw new Error('KV write unavailable')
      }) as StatusKv['put'],
    }

    await expect(
      getNotesImportStatus({
        kv,
        env: ENV,
        apiKey: 'k',
        config: CONFIG,
        fetchFn: okFetch(
          endpointsBody([{ provider_name: 'Fireworks', status: -1 }])
        ),
      })
    ).resolves.toEqual({
      ...APP_ATTEST_CAPABILITIES,
      available: false,
      reason: 'no_provider',
    })
  })

  it('serves a cached up result with schedule without probing', async () => {
    const kv = makeMemoryKv()
    await kv.put('notes-import:provider-health', 'up')
    const fetchFn = vi.fn() as unknown as typeof fetch
    await expect(getStatus(kv, fetchFn)).resolves.toEqual({
      ...APP_ATTEST_CAPABILITIES,
      available: true,
      limits: DEFAULT_PUBLIC_LIMITS,
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('fails open without inventing a schedule when the provider probe errors', async () => {
    const kv = makeMemoryKv()
    const fetchFn = vi.fn(async () =>
      new Response('nope', { status: 500 })
    ) as unknown as typeof fetch
    await expect(getStatus(kv, fetchFn)).resolves.toEqual({
      ...APP_ATTEST_CAPABILITIES,
      available: true,
    })
    expect(kv.store.has('notes-import:provider-health')).toBe(false)
  })

  it('fails open without a schedule when status KV cannot be read', async () => {
    const kv: StatusKv = {
      get: vi.fn(async () => {
        throw new Error('KV unavailable')
      }) as StatusKv['get'],
      put: vi.fn() as StatusKv['put'],
    }
    const fetchFn = vi.fn() as unknown as typeof fetch
    await expect(
      getNotesImportStatus({
        kv,
        env: ENV,
        apiKey: 'k',
        config: CONFIG,
        fetchFn,
      })
    ).resolves.toEqual({
      ...APP_ATTEST_CAPABILITIES,
      available: true,
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('getNotesImportStatus — minAppVersion', () => {
  const healthyFetch = () =>
    okFetch(endpointsBody([{ provider_name: 'Fireworks', status: 0 }]))

  it('omits minAppVersion when nothing is configured', async () => {
    const result = await getStatus(makeMemoryKv(), healthyFetch())
    expect(result).not.toHaveProperty('minAppVersion')
  })

  it('surfaces the KV record value', async () => {
    const kv = makeMemoryKv()
    await kv.put('notes-import:min-version', JSON.stringify({ minVersion: '1.42.0' }))
    await expect(getStatus(kv, healthyFetch())).resolves.toMatchObject({
      available: true,
      minAppVersion: '1.42.0',
    })
  })

  it('accepts a bare string value', async () => {
    const kv = makeMemoryKv()
    await kv.put('notes-import:min-version', '1.42.0')
    await expect(getStatus(kv, healthyFetch())).resolves.toMatchObject({
      minAppVersion: '1.42.0',
    })
  })

  it('still reports minAppVersion alongside the kill-switch', async () => {
    const kv = makeMemoryKv()
    await kv.put('notes-import:enabled', 'false')
    await kv.put('notes-import:min-version', '"1.42.0"')
    await expect(getStatus(kv, healthyFetch())).resolves.toEqual({
      ...APP_ATTEST_CAPABILITIES,
      available: false,
      reason: 'disabled',
      minAppVersion: '1.42.0',
    })
  })

  it('falls back to the env var and ignores an invalid KV value', async () => {
    const kv = makeMemoryKv()
    await kv.put('notes-import:min-version', JSON.stringify({ minVersion: 'v1.42' }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(
      getNotesImportStatus({
        kv: kv as unknown as StatusKv,
        env: { NOTES_IMPORT_MIN_APP_VERSION: '1.40.0' } as Environment,
        apiKey: 'k',
        config: CONFIG,
        fetchFn: healthyFetch(),
      })
    ).resolves.toMatchObject({ minAppVersion: '1.40.0' })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('omits minAppVersion when the env var is invalid', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await getNotesImportStatus({
      kv: makeMemoryKv() as unknown as StatusKv,
      env: { NOTES_IMPORT_MIN_APP_VERSION: 'latest' } as Environment,
      apiKey: 'k',
      config: CONFIG,
      fetchFn: healthyFetch(),
    })
    expect(result).not.toHaveProperty('minAppVersion')
    warn.mockRestore()
  })
})

describe('getNotesImportStatus — stale provider results', () => {
  const NOW = 1_800_000_000_000
  const health = (healthy: boolean, ageMs: number) =>
    JSON.stringify({ healthy, checkedAt: NOW - ageMs })
  const downFetch = () =>
    okFetch(endpointsBody([{ provider_name: 'Fireworks', status: -1 }]))

  it('serves a result younger than a minute without probing', async () => {
    const kv = makeMemoryKv()
    await kv.put('notes-import:provider-health', health(false, 59_999))
    const fetchFn = vi.fn() as unknown as typeof fetch
    const waitUntil = vi.fn()

    await expect(
      getNotesImportStatus({
        kv: kv as unknown as StatusKv,
        env: ENV,
        apiKey: 'k',
        config: CONFIG,
        fetchFn,
        waitUntil,
        now: () => NOW,
      })
    ).resolves.toMatchObject({ available: false, reason: 'no_provider' })
    expect(fetchFn).not.toHaveBeenCalled()
    expect(waitUntil).not.toHaveBeenCalled()
  })

  it('serves a stale result at once and refreshes it after the response', async () => {
    const kv = makeMemoryKv()
    await kv.put('notes-import:provider-health', health(true, 60_000))
    const fetchFn = downFetch()
    const background: Promise<unknown>[] = []

    await expect(
      getNotesImportStatus({
        kv: kv as unknown as StatusKv,
        env: ENV,
        apiKey: 'k',
        config: CONFIG,
        fetchFn,
        waitUntil: (promise) => background.push(promise),
        now: () => NOW,
      })
    ).resolves.toEqual({
      ...APP_ATTEST_CAPABILITIES,
      available: true,
      limits: DEFAULT_PUBLIC_LIMITS,
    })

    // The refresh queues its cache write while it runs.
    await Promise.all(background)
    await Promise.all(background)
    expect(fetchFn).toHaveBeenCalledOnce()
    expect(JSON.parse(kv.store.get('notes-import:provider-health')!)).toEqual({
      healthy: false,
      checkedAt: NOW,
    })
  })

  it('keeps the stale result when the background refresh fails', async () => {
    const kv = makeMemoryKv()
    const stale = health(true, 120_000)
    await kv.put('notes-import:provider-health', stale)
    const background: Promise<unknown>[] = []

    await getNotesImportStatus({
      kv: kv as unknown as StatusKv,
      env: ENV,
      apiKey: 'k',
      config: CONFIG,
      fetchFn: vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch,
      waitUntil: (promise) => background.push(promise),
      now: () => NOW,
    })

    await expect(Promise.all(background)).resolves.toBeDefined()
    expect(kv.store.get('notes-import:provider-health')).toBe(stale)
  })

  it('re-probes a stale result before answering without waitUntil', async () => {
    const kv = makeMemoryKv()
    await kv.put('notes-import:provider-health', health(true, 60_000))
    const fetchFn = downFetch()

    await expect(
      getNotesImportStatus({
        kv: kv as unknown as StatusKv,
        env: ENV,
        apiKey: 'k',
        config: CONFIG,
        fetchFn,
        now: () => NOW,
      })
    ).resolves.toMatchObject({ available: false, reason: 'no_provider' })
    expect(fetchFn).toHaveBeenCalledOnce()
  })

  it('writes a probed result after the response when it can', async () => {
    const kv = makeMemoryKv()
    const background: Promise<unknown>[] = []

    await getNotesImportStatus({
      kv: kv as unknown as StatusKv,
      env: ENV,
      apiKey: 'k',
      config: CONFIG,
      fetchFn: okFetch(endpointsBody([{ provider_name: 'Fireworks', status: 0 }])),
      waitUntil: (promise) => background.push(promise),
      now: () => NOW,
    })

    expect(background).toHaveLength(1)
    await Promise.all(background)
    expect(JSON.parse(kv.store.get('notes-import:provider-health')!)).toEqual({
      healthy: true,
      checkedAt: NOW,
    })
  })

  it('starts every KV read before any of them answers', async () => {
    const pending: string[] = []
    const kv: StatusKv = {
      get: vi.fn((key: string) => {
        pending.push(key)
        return new Promise<string | null>(() => {})
      }) as unknown as StatusKv['get'],
      put: vi.fn() as StatusKv['put'],
    }

    void getNotesImportStatus({
      kv,
      env: ENV,
      apiKey: 'k',
      config: CONFIG,
      fetchFn: vi.fn() as unknown as typeof fetch,
    })
    await Promise.resolve()

    expect(pending.sort()).toEqual([
      'notes-import:enabled',
      'notes-import:limits',
      'notes-import:min-version',
      'notes-import:provider-health',
    ])
  })
})
