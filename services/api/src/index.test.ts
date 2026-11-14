import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Environment } from './types'
import { RATE_LIMIT_PERIOD_SECONDS, rateLimitKey } from './rateLimit'
import { makeMemoryD1 } from './test/memoryD1'
import { makeMemoryKv } from './test/memoryKv'

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }))

// The HERE proxy captures `fetch` when its module loads, so its stub has to be
// in place before the import below.
const here = vi.hoisted(() => {
  const state: { fetch?: typeof fetch } = {}
  globalThis.fetch = ((...args: Parameters<typeof fetch>) => state.fetch!(...args)) as typeof fetch
  return state
})

import worker from './index'

const NOW = Date.UTC(2026, 9, 8, 12, 0, 0, 250)

/** One request per key, like a limiter that has just run out. */
const singleUseLimiter = () => {
  const seen: string[] = []
  return {
    seen,
    limit: async ({ key }: { key: string }) => {
      const success = !seen.includes(key)
      seen.push(key)
      return { success }
    },
  }
}

const makeEnv = (limiter = singleUseLimiter()) =>
  ({
    HERE_API_KEY: 'test-key',
    RATE_LIMITER: limiter,
    CF_VERSION_METADATA: {
      id: 'version-id',
      tag: '',
      timestamp: '2026-10-01T00:00:00.000Z',
    },
  }) as unknown as Environment

const call = (env: Environment, path: string, init: RequestInit = {}) =>
  worker.fetch!(
    new Request(`https://ww-proxy.leviwilkerson.com${path}`, {
      ...init,
      headers: { 'cf-connecting-ip': '198.51.100.7', ...init.headers },
    }) as never,
    env,
    { waitUntil: () => {}, passThroughOnException: () => {} } as never
  )

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('GET /health', () => {
  it('reports the server clock, uncached', async () => {
    const response = await call(makeEnv(), '/health')
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Date')).toBe(new Date(NOW).toUTCString())
    expect(await response.json()).toEqual({
      status: 'ok',
      timestamp: new Date(NOW).toISOString(),
      serverTime: NOW,
      versionId: 'version-id',
      deployedAt: '2026-10-01T00:00:00.000Z',
    })
  })
})

describe('error envelope', () => {
  it('answers unknown routes with a JSON not_found', async () => {
    const response = await call(makeEnv(), '/nope')
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({
      ok: false,
      error: 'not_found',
      code: 'not_found',
    })
  })
})

describe('per-IP rate limits', () => {
  it('refuses with 429 rate_limited and Retry-After from the limiter window', async () => {
    const env = makeEnv()
    here.fetch = vi.fn(async () => Response.json({ items: [] }))
    expect((await call(env, '/autocomplete?q=Main')).status).toBe(200)

    const refused = await call(env, '/geocode?q=Main')
    expect(refused.status).toBe(429)
    expect(refused.headers.get('Retry-After')).toBe(
      String(RATE_LIMIT_PERIOD_SECONDS)
    )
    expect(await refused.json()).toEqual({
      ok: false,
      error: 'rate_limited',
      code: 'rate_limited',
      retryAfter: RATE_LIMIT_PERIOD_SECONDS,
    })
  })

  it('counts each route family in its own bucket for the same IP', async () => {
    const limiter = singleUseLimiter()
    const env = makeEnv(limiter)
    here.fetch = vi.fn(async () => Response.json({ items: [] }))
    expect((await call(env, '/geocode?q=Main')).status).toBe(200)
    expect((await call(env, '/geocode?q=Main')).status).toBe(429)

    // Address search used up its bucket; the admin family still has its own.
    const admin = await call(env, '/admin/notes-import/reset', {
      method: 'POST',
    })
    expect(admin.status).toBe(404)
    expect(limiter.seen).toEqual([
      'places:198.51.100.7',
      'places:198.51.100.7',
      'admin:198.51.100.7',
    ])
  })

  it('keys a caller without an IP as unknown, per family', () => {
    expect(rateLimitKey('notes-import', undefined)).toBe('notes-import:unknown')
    expect(rateLimitKey('route-planning', '2001:db8::1')).toBe(
      'route-planning:2001:db8::1'
    )
  })
})

describe('the hourly cron', () => {
  it('deletes account sessions that ended over a week ago', async () => {
    here.fetch = vi.fn(async () => new Response(null, { status: 404 }))
    const db = makeMemoryD1()
    db.db.exec(`INSERT INTO accounts (id, account_pub, status, created_at)
                VALUES ('account', 'pub', 'active', 0)`)
    const insert = db.db.prepare(
      `INSERT INTO account_sessions
         (id, account_id, platform, refresh_hash, created_at, expires_at, revoked_at)
       VALUES (?, 'account', 'ios', ?, 0, ?, ?)`
    )
    const week = 7 * 24 * 60 * 60 * 1000
    insert.run('live', 'h1', NOW + week, null)
    insert.run('revoked', 'h2', NOW + week, NOW - week)
    insert.run('expired', 'h3', NOW - week, null)
    insert.run('recently-ended', 'h4', NOW + week, NOW - 1)
    const pending: Promise<unknown>[] = []
    await worker.scheduled!(
      { scheduledTime: NOW, cron: '17 * * * *', noRetry: () => {} } as ScheduledController,
      { ...makeEnv(), NOTES_KV: makeMemoryKv(), ACCOUNTS_DB: db } as never,
      { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as never
    )
    await Promise.all(pending)
    const ids = db.db
      .prepare('SELECT id FROM account_sessions ORDER BY id')
      .all()
      .map((row) => row.id)
    expect(ids).toEqual(['live', 'recently-ended'])
  })
})
