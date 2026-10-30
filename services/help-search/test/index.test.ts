import { beforeEach, describe, expect, it, vi } from 'vitest'
import worker, { type Env } from '../src/index'
import { clearIndexes } from '../src/indexes'
import { runSync } from '../src/sync'
import { bundle, entry } from './fixtures/bundle'
import { mockAi, mockKv } from './mocks'

describe('worker', () => {
  let ai: ReturnType<typeof mockAi>
  let kv: ReturnType<typeof mockKv>
  let env: Env
  let cached: Map<string, Response>
  let waiting: Promise<unknown>[]
  const ctx = {
    waitUntil: (promise: Promise<unknown>) => waiting.push(promise),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext

  beforeEach(async () => {
    ai = mockAi()
    kv = mockKv()
    cached = new Map()
    waiting = []
    clearIndexes()
    vi.stubGlobal('caches', {
      default: {
        match: vi.fn(async (request: Request) =>
          cached.get(request.url)?.clone()
        ),
        put: vi.fn(async (request: Request, response: Response) => {
          cached.set(request.url, response)
        }),
      },
    })
    env = {
      AI: ai.ai,
      SYNC_STATE: kv.kv,
      SEARCH_LIMITER: {
        limit: vi.fn(async () => ({ success: true })),
      } as unknown as RateLimit,
      HELP_CENTER_ORIGIN: 'https://site.test',
      ADMIN_TOKEN: 'secret',
    }
    await runSync(env, { bundles: [bundle()] })
    ai.run.mockClear()
  })

  const call = async (path: string, init?: RequestInit) => {
    const response = await worker.fetch(
      new Request(`https://help-search.example${path}`, init) as never,
      env,
      ctx
    )
    await Promise.all(waiting)
    return response
  }
  const admin = (path: string, body?: unknown) =>
    call(path, {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret',
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

  it('answers CORS preflight', async () => {
    const response = await call('/v1/search', { method: 'OPTIONS' })
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('returns 400 for bad params, with CORS', async () => {
    const response = await call('/v1/search?locale=en-US')
    expect(response.status).toBe(400)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('finds the answer and caches the response', async () => {
    const response = await call('/v1/search?q=carry%20over%20partial%20hours')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('public, max-age=300')
    const { results } = (await response.json()) as {
      results: { slug: string; score: number }[]
    }
    expect(results[0]).toEqual({ slug: 'time-rollover', score: 1 })
    expect(ai.run).toHaveBeenCalledWith('@cf/google/embeddinggemma-300m', {
      text: ['task: search result | query: carry over partial hours'],
    })
  })

  it('applies the platform filter', async () => {
    const response = await call(
      '/v1/search?q=icloud%20sync%20settings&platform=android'
    )
    const { results } = (await response.json()) as {
      results: { slug: string }[]
    }
    expect(results.map((r) => r.slug)).not.toContain('i-cloud-sync')
  })

  it('serves repeats from the edge cache', async () => {
    await call('/v1/search?q=Rollover')
    await call('/v1/search?q=rollover')
    expect(ai.run).toHaveBeenCalledTimes(1)
  })

  it('reads the index from KV once per isolate', async () => {
    const get = vi.mocked(kv.kv.get)
    get.mockClear()
    await call('/v1/search?q=one')
    await call('/v1/search?q=two')
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('answers from keywords, uncached, when the embedding fails', async () => {
    // BM25 needs more than three answers to tell a match from common words.
    const fillers = Array.from({ length: 10 }, (_, i) =>
      entry({ slug: `other-${i}`, question: `Other ${i}?`, plainText: '' })
    )
    await runSync(env, {
      bundles: [bundle([...bundle().entries, ...fillers], { hash: 'big' })],
    })
    clearIndexes()
    ai.run.mockRejectedValueOnce(new Error('down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await call('/v1/search?q=partial%20hours')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const { results } = (await response.json()) as {
      results: { slug: string }[]
    }
    expect(results.map((r) => r.slug)).toEqual(['time-rollover'])
    expect(cached.size).toBe(0)
  })

  it('returns 503 before the locale is indexed', async () => {
    const response = await call('/v1/search?q=horas&locale=es-ES')
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'search_unavailable' })
  })

  it('returns 429 when rate limited', async () => {
    env.SEARCH_LIMITER = {
      limit: vi.fn(async () => ({ success: false })),
    } as unknown as RateLimit
    expect((await call('/v1/search?q=a')).status).toBe(429)
  })

  it('guards admin routes', async () => {
    expect((await call('/v1/admin/sync', { method: 'POST' })).status).toBe(401)
    expect(
      (
        await call('/v1/admin/explain?q=a', {
          method: 'POST',
          headers: { authorization: 'Bearer nope' },
        })
      ).status
    ).toBe(401)
  })

  it('syncs posted bundles for an admin', async () => {
    const response = await admin('/v1/admin/sync', {
      bundles: [bundle(undefined, { hash: 'bbbb' })],
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      locales: { 'en-US': { status: 'synced', embedded: 0, reused: 3 } },
    })
  })

  it("explains a search's scores for an admin", async () => {
    const response = await admin('/v1/admin/explain?q=partial%20hours')
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      embedded: boolean
      results: { slug: string }[]
      scores: { slug: string; vectorScore?: number; keywordScore?: number }[]
    }
    expect(body.embedded).toBe(true)
    expect(body.results[0].slug).toBe('time-rollover')
    expect(body.scores).toHaveLength(3)
    expect(body.scores.find((s) => s.slug === 'time-rollover')).toMatchObject({
      vectorScore: expect.any(Number),
      keywordScore: expect.any(Number),
    })
  })
})
