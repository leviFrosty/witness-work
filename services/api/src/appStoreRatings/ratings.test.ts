import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppContext, Environment } from '../types'
import { makeMemoryKv } from '../test/memoryKv'
import { APP_STORE_STOREFRONTS } from './storefronts'
import {
  BATCH_SIZE,
  FAILED_BATCH_RETRY_MS,
  STATE_KEY,
  SUMMARY_KEY,
  SWEEP_INTERVAL_MS,
  fetchStorefrontRating,
  runRatingsSweepStep,
  summarize,
} from './ratings'
import { handleAppStoreRatingsRequest } from './route'

/** An App Store page, shaped like Apple's: several JSON-LD blocks in the HTML. */
const page = (softwareApplication: unknown) =>
  new Response(
    [
      '<html><head>',
      '<script id="organization" type="application/ld+json">{"@type":"Organization","name":"App Store"}</script>',
      `<script id=software-application type="application/ld+json">${JSON.stringify(softwareApplication)}</script>`,
      '<script id=schema:breadcrumb-list type="application/ld+json">{"@type":"BreadcrumbList"}</script>',
      '</head></html>',
    ].join('\n'),
    { headers: { 'content-type': 'text/html' } },
  )

const rated = (reviewCount: unknown, ratingValue: unknown) =>
  page({
    '@type': 'SoftwareApplication',
    name: 'WitnessWork',
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue,
      reviewCount,
      bestRating: '5',
      worstRating: '1',
    },
  })

const unrated = () =>
  page({ '@type': 'SoftwareApplication', name: 'WitnessWork' })

const storefrontOf = (input: RequestInfo | URL) =>
  new URL(String(input)).pathname.split('/')[1]

/** US 100 × 5.0, BR 50 × 4.0, every other storefront unrated. */
const appleFetch = vi.fn(async (input: RequestInfo | URL) => {
  const country = storefrontOf(input)
  if (country === 'us') return rated(100, 5)
  if (country === 'br') return rated(50, 4)
  return unrated()
}) as unknown as typeof fetch

const runs = Math.ceil(APP_STORE_STOREFRONTS.length / BATCH_SIZE)

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('fetchStorefrontRating', () => {
  const answering = (response: () => Response) =>
    (async () => response()) as unknown as typeof fetch

  it('reads the rating from the storefront page', async () => {
    const seen: string[] = []
    const recording = (async (input: RequestInfo | URL) => {
      seen.push(String(input))
      return rated(100, 4.9)
    }) as unknown as typeof fetch
    expect(await fetchStorefrontRating('us', recording)).toEqual({
      count: 100,
      average: 4.9,
    })
    expect(seen).toEqual(['https://apps.apple.com/us/app/id6469723047'])
  })

  it('treats a page with no rating as unrated', async () => {
    expect(await fetchStorefrontRating('fr', answering(unrated))).toBeNull()
    expect(
      await fetchStorefrontRating('fr', answering(() => rated(0, 0))),
    ).toBeNull()
  })

  it('treats a storefront that does not sell the app as unrated', async () => {
    expect(
      await fetchStorefrontRating(
        'fr',
        answering(() => new Response('', { status: 404 })),
      ),
    ).toBeNull()
  })

  it('does not count another storefront\'s rating after a redirect', async () => {
    const redirected = answering(() => {
      const response = rated(100, 5)
      Object.defineProperty(response, 'url', {
        value: 'https://apps.apple.com/us/app/witnesswork/id6469723047',
      })
      return response
    })
    expect(await fetchStorefrontRating('xk', redirected)).toBeNull()
    expect(await fetchStorefrontRating('us', redirected)).toEqual({
      count: 100,
      average: 5,
    })
  })

  it.each([403, 429, 503])('retries after a %i', async (status) => {
    expect(
      await fetchStorefrontRating(
        'us',
        answering(() => new Response('', { status })),
      ),
    ).toBeUndefined()
  })

  it('retries when the request throws', async () => {
    const throwing = (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await fetchStorefrontRating('us', throwing)).toBeUndefined()
  })

  it.each([
    ['no JSON-LD', () => new Response('<html></html>')],
    [
      'only other JSON-LD',
      () =>
        new Response(
          '<script type="application/ld+json">{"@type":"Organization"}</script>',
        ),
    ],
    [
      'broken JSON-LD',
      () =>
        new Response('<script type="application/ld+json">{oops</script>'),
    ],
    ['a negative count', () => rated(-1, 5)],
    ['a fractional count', () => rated(1.5, 5)],
    ['a string count', () => rated('12', 5)],
    ['an average above 5', () => rated(1, 6)],
    ['a missing average', () => rated(1, undefined)],
  ])('retries on a page with %s, in case Apple changed it', async (_, response) => {
    expect(
      await fetchStorefrontRating('us', answering(response)),
    ).toBeUndefined()
  })
})

describe('summarize', () => {
  it('weights the average by rating count', () => {
    expect(
      summarize(
        { us: { count: 100, average: 5 }, br: { count: 50, average: 4 } },
        0,
      ),
    ).toEqual({
      complete: true,
      averageRating: 4.67,
      ratingCount: 150,
      countryCount: 2,
      updatedAt: new Date(0).toISOString(),
    })
  })
})

describe('runRatingsSweepStep', () => {
  it('does not queue concurrent lookups behind the Worker connection limit', async () => {
    const kv = makeMemoryKv()
    let active = 0
    let maxActive = 0
    const measuredFetch = (async (input: RequestInfo | URL) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await Promise.resolve()
      active -= 1
      return appleFetch(input)
    }) as typeof fetch
    await runRatingsSweepStep({ kv, now: 0, fetchFn: measuredFetch })
    expect(maxActive).toBe(1)
  })

  it('sweeps once a week', () => {
    expect(SWEEP_INTERVAL_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('publishes a summary only after every storefront is swept, then rests a week', async () => {
    const kv = makeMemoryKv()
    for (let run = 1; run < runs; run++) {
      expect(
        await runRatingsSweepStep({ kv, now: 0, fetchFn: appleFetch }),
      ).toBe('progress')
      expect(kv.store.has(SUMMARY_KEY)).toBe(false)
    }
    expect(await runRatingsSweepStep({ kv, now: 0, fetchFn: appleFetch })).toBe(
      'completed',
    )
    expect(appleFetch).toHaveBeenCalledTimes(APP_STORE_STOREFRONTS.length)
    expect(JSON.parse(kv.store.get(SUMMARY_KEY)!)).toMatchObject({
      averageRating: 4.67,
      ratingCount: 150,
      countryCount: 2,
    })

    expect(
      await runRatingsSweepStep({
        kv,
        now: SWEEP_INTERVAL_MS - 1,
        fetchFn: appleFetch,
      }),
    ).toBe('idle')
    expect(appleFetch).toHaveBeenCalledTimes(APP_STORE_STOREFRONTS.length)
    expect(
      await runRatingsSweepStep({
        kv,
        now: SWEEP_INTERVAL_MS,
        fetchFn: appleFetch,
      }),
    ).toBe('progress')
  })

  it('keeps the last known value when a lookup fails', async () => {
    const kv = makeMemoryKv()
    kv.store.set(
      STATE_KEY,
      JSON.stringify({
        pending: [...APP_STORE_STOREFRONTS],
        completedAt: null,
        storefronts: { af: { count: 7, average: 3 } },
      }),
    )
    const failing = (async () =>
      new Response('', { status: 500 })) as unknown as typeof fetch
    await runRatingsSweepStep({ kv, now: 0, fetchFn: failing })
    expect(JSON.parse(kv.store.get(STATE_KEY)!)).toMatchObject({
      storefronts: { af: { count: 7, average: 3 } },
    })
    expect(JSON.parse(kv.store.get(STATE_KEY)!).pending).toHaveLength(
      APP_STORE_STOREFRONTS.length,
    )
    expect(kv.store.has(SUMMARY_KEY)).toBe(false)
  })

  it('does not publish a partial sweep and retries failed storefronts before completing', async () => {
    const kv = makeMemoryKv()
    let failUs = true
    const partial = vi.fn(async (input: RequestInfo | URL) => {
      if (failUs && storefrontOf(input) === 'us') {
        return new Response('', { status: 503 })
      }
      return appleFetch(input)
    }) as unknown as typeof fetch
    for (let run = 0; run < runs; run++) {
      expect(await runRatingsSweepStep({ kv, now: 0, fetchFn: partial })).toBe(
        'progress',
      )
    }
    expect(kv.store.has(SUMMARY_KEY)).toBe(false)
    expect(JSON.parse(kv.store.get(STATE_KEY)!).pending).toEqual(['us'])
    failUs = false
    expect(await runRatingsSweepStep({ kv, now: 1, fetchFn: partial })).toBe(
      'completed',
    )
    expect(JSON.parse(kv.store.get(SUMMARY_KEY)!)).toMatchObject({
      complete: true,
      ratingCount: 150,
    })
  })

  it('keeps the previous complete summary while a later sweep has failures', async () => {
    const kv = makeMemoryKv()
    for (let run = 0; run < runs; run++) {
      await runRatingsSweepStep({ kv, now: 0, fetchFn: appleFetch })
    }
    const previous = kv.store.get(SUMMARY_KEY)
    const failing = (async () =>
      new Response('', { status: 500 })) as unknown as typeof fetch
    for (let run = 0; run < runs; run++) {
      await runRatingsSweepStep({
        kv,
        now: SWEEP_INTERVAL_MS,
        fetchFn: failing,
      })
    }
    expect(kv.store.get(SUMMARY_KEY)).toBe(previous)
  })
})

describe('runRatingsSweepStep when Apple refuses', () => {
  const refusing = vi.fn(
    async () => new Response('', { status: 429 }),
  ) as unknown as typeof fetch

  it('stops asking for a day after a whole batch fails, then resumes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const kv = makeMemoryKv()
    expect(await runRatingsSweepStep({ kv, now: 0, fetchFn: refusing })).toBe(
      'progress',
    )
    expect(refusing).toHaveBeenCalledTimes(BATCH_SIZE)
    expect(warn).toHaveBeenCalledTimes(1)

    expect(
      await runRatingsSweepStep({
        kv,
        now: FAILED_BATCH_RETRY_MS - 1,
        fetchFn: refusing,
      }),
    ).toBe('idle')
    expect(refusing).toHaveBeenCalledTimes(BATCH_SIZE)

    expect(
      await runRatingsSweepStep({
        kv,
        now: FAILED_BATCH_RETRY_MS,
        fetchFn: appleFetch,
      }),
    ).toBe('progress')
    expect(appleFetch).toHaveBeenCalledTimes(BATCH_SIZE)
    expect(JSON.parse(kv.store.get(STATE_KEY)!).retryAt).toBeUndefined()
    warn.mockRestore()
  })

  it('keeps going when only part of a batch fails', async () => {
    const kv = makeMemoryKv()
    const first = APP_STORE_STOREFRONTS[0]
    const partial = (async (input: RequestInfo | URL) =>
      storefrontOf(input) === first
        ? new Response('', { status: 429 })
        : unrated()) as unknown as typeof fetch
    await runRatingsSweepStep({ kv, now: 0, fetchFn: partial })
    const state = JSON.parse(kv.store.get(STATE_KEY)!)
    expect(state.retryAt).toBeUndefined()
    expect(state.pending.at(-1)).toBe(first)
  })

  it('keeps the served summary when a finished sweep found no ratings', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const kv = makeMemoryKv()
    for (let run = 0; run < runs; run++) {
      await runRatingsSweepStep({ kv, now: 0, fetchFn: appleFetch })
    }
    const served = kv.store.get(SUMMARY_KEY)
    const empty = (async () => unrated()) as unknown as typeof fetch
    for (let run = 0; run < runs; run++) {
      await runRatingsSweepStep({ kv, now: SWEEP_INTERVAL_MS, fetchFn: empty })
    }
    expect(kv.store.get(SUMMARY_KEY)).toBe(served)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('GET /app-store/ratings', () => {
  function fixture() {
    const kv = makeMemoryKv()
    const cached = new Map<string, Response>()
    const cache = {
      match: vi.fn(async (request: Request) =>
        cached.get(request.url)?.clone(),
      ),
      put: vi.fn(async (request: Request, response: Response) => {
        cached.set(request.url, response)
      }),
    }
    vi.stubGlobal('caches', { default: cache })
    const pending: Promise<unknown>[] = []
    const request = (
      url = 'https://ww-proxy.leviwilkerson.com/app-store/ratings',
    ) =>
      handleAppStoreRatingsRequest({
        req: { url },
        env: { NOTES_KV: kv } as unknown as Environment,
        executionCtx: {
          waitUntil: (promise: Promise<unknown>) => pending.push(promise),
        },
        json: (body: unknown, status: number, headers: HeadersInit) =>
          Response.json(body, { status, headers }),
      } as unknown as AppContext).then(async (response) => {
        await Promise.all(pending)
        return response
      })
    return { kv, cache, cached, request }
  }

  it('is unavailable and uncached before the first sweep completes', async () => {
    const { cache, request } = fixture()
    const response = await request()
    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(cache.put).not.toHaveBeenCalled()
  })

  it('does not serve the legacy partial summary', async () => {
    const { kv, cached, request } = fixture()
    const legacy = JSON.stringify({
      averageRating: 4.96,
      ratingCount: 72,
      countryCount: 4,
      updatedAt: '2026-11-01T03:17:21.060Z',
    })
    kv.store.set('app-store-ratings:summary', legacy)
    cached.set(
      'https://ww-proxy.leviwilkerson.com/app-store/ratings',
      new Response(legacy),
    )
    expect((await request()).status).toBe(503)
  })

  it('serves repeat requests, including query variants, from the edge cache', async () => {
    const { kv, cache, request } = fixture()
    const summary = summarize({ us: { count: 728, average: 4.89 } }, 0)
    kv.store.set(SUMMARY_KEY, JSON.stringify(summary))
    const get = vi.spyOn(kv, 'get')

    const first = await request()
    expect(first.status).toBe(200)
    expect(first.headers.get('Cache-Control')).toContain('s-maxage=')
    expect(await first.json()).toEqual(summary)

    const second = await request(
      'https://ww-proxy.leviwilkerson.com/app-store/ratings?v=2',
    )
    expect(await second.json()).toEqual(summary)
    expect(get).toHaveBeenCalledTimes(1)
    expect(cache.put).toHaveBeenCalledTimes(1)
  })
})
