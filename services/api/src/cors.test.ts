import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Environment } from './types'
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
import { withCors } from './cors'

/**
 * CORS for the web app (witness-work ADR 0038 §10): an exact allow-list of
 * the app's origins (`WEB_APP_ORIGINS`), answered on every route, success and
 * error alike, with preflights answered before any limiter or auth.
 */

const NOW = Date.UTC(2026, 9, 30, 12)
const WEB = 'http://localhost:8081'
const PROD_WEB = 'https://app.witnesswork.app'
const EVIL = 'https://evil.example'
const EXPOSED = 'ETag, Retry-After, Date, WWW-Authenticate, x-ww-updated-at'

/** A limiter that refuses everything, counting what it saw. */
const exhaustedLimiter = () => {
  const seen: string[] = []
  return {
    seen,
    limit: async ({ key }: { key: string }) => {
      seen.push(key)
      return { success: false }
    },
  }
}

const openLimiter = () => ({ limit: async () => ({ success: true }) })

const makeEnv = (overrides: Record<string, unknown> = {}) =>
  ({
    HERE_API_KEY: 'test-key',
    RATE_LIMITER: openLimiter(),
    BUDDIES_RATE_LIMITER: openLimiter(),
    BUDDIES_READ_LIMITER: openLimiter(),
    BUDDIES_WRITE_LIMITER: openLimiter(),
    BUDDIES_REGISTER_LIMITER: openLimiter(),
    ACCOUNTS_DB: makeMemoryD1(),
    WEB_APP_ORIGINS: `${PROD_WEB}, ${WEB}`,
    ACCOUNT_TOKEN_SECRET: 'test-account-token-secret-0123456789abcdef',
    APP_ATTEST_ENVIRONMENT: 'development',
    CF_VERSION_METADATA: {
      id: 'version-id',
      tag: '',
      timestamp: '2026-10-01T00:00:00.000Z',
    },
    ...overrides,
  }) as unknown as Environment

const call = (env: Environment, path: string, init: RequestInit = {}) =>
  worker.fetch!(
    new Request(`http://127.0.0.1:8787${path}`, {
      ...init,
      headers: { 'cf-connecting-ip': '198.51.100.7', ...init.headers },
    }) as never,
    env,
    { waitUntil: () => {}, passThroughOnException: () => {} } as never
  )

const preflight = (
  env: Environment,
  path: string,
  origin: string | null,
  headers: string | null = 'authorization, content-type',
  method = 'POST'
) =>
  call(env, path, {
    method: 'OPTIONS',
    headers: {
      ...(origin ? { origin } : {}),
      'access-control-request-method': method,
      ...(headers ? { 'access-control-request-headers': headers } : {}),
    },
  })

const corsHeaders = (response: Response) =>
  [...response.headers.keys()].filter((name) =>
    name.startsWith('access-control-')
  )

const expectCors = (response: Response, origin: string) => {
  expect(response.headers.get('access-control-allow-origin')).toBe(origin)
  expect(response.headers.get('access-control-expose-headers')).toBe(EXPOSED)
  expect(response.headers.get('vary')).toMatch(/\bOrigin\b/)
  expect(response.headers.get('access-control-allow-credentials')).toBeNull()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('preflight', () => {
  it('answers an allowed origin with 204, the methods, its headers, and a max age', async () => {
    const response = await preflight(
      makeEnv(),
      '/accounts/v1/sync/put',
      WEB,
      'Authorization, Content-Type, If-Match, x-ww-slot-id, x-ww-sha256, sentry-trace, baggage'
    )
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(WEB)
    expect(response.headers.get('access-control-allow-methods')).toBe(
      'GET, POST, PUT, DELETE, OPTIONS'
    )
    expect(response.headers.get('access-control-allow-headers')).toBe(
      'authorization, content-type, if-match, x-ww-slot-id, x-ww-sha256, sentry-trace, baggage'
    )
    expect(response.headers.get('access-control-max-age')).toBe('7200')
    expect(response.headers.get('vary')).toMatch(/\bOrigin\b/)
    expect(response.headers.get('access-control-allow-credentials')).toBeNull()
    expect(await response.text()).toBe('')
  })

  it('allows Buddies’ x-buddies-* headers, if-none-match, and no requested headers', async () => {
    const env = makeEnv()
    const buddies = await preflight(
      env,
      '/buddies/v1/blob/put',
      PROD_WEB,
      'authorization,x-buddies-payload,if-none-match'
    )
    expect(buddies.status).toBe(204)
    expect(buddies.headers.get('access-control-allow-headers')).toBe(
      'authorization, x-buddies-payload, if-none-match'
    )
    const simple = await preflight(env, '/health', WEB, null, 'GET')
    expect(simple.status).toBe(204)
    expect(simple.headers.get('access-control-allow-headers')).toBeNull()
  })

  it('refuses requested header names that aren’t field names', async () => {
    for (const headers of ['x-ww-ok,x-ww-bad header', 'x-ww-é', 'x-ww-a:b']) {
      const response = await preflight(makeEnv(), '/accounts/v1/account', WEB, headers, 'GET')
      expect(response.status).toBe(403)
      expect(corsHeaders(response)).toEqual([])
    }
  })

  it('never allows the admin token, and the dev bypass only on a local development worker', async () => {
    // Beta and production set no bypass token (and refuse to start with one).
    const prod = makeEnv({ NOTES_IMPORT_DEV_BYPASS_TOKEN: undefined, APP_ATTEST_ENVIRONMENT: 'production' })
    const dev = makeEnv({ NOTES_IMPORT_DEV_BYPASS_TOKEN: 'bypass' })
    for (const env of [prod, dev]) {
      const admin = await preflight(env, '/admin/accounts/lookup', WEB, 'x-ww-admin-token')
      expect(admin.status).toBe(403)
      expect(corsHeaders(admin)).toEqual([])
    }
    const prodBypass = await preflight(prod, '/accounts/v1/sessions', WEB, 'content-type, x-ww-dev-bypass')
    expect(prodBypass.status).toBe(403)
    const devBypass = await preflight(dev, '/accounts/v1/sessions', WEB, 'content-type, X-WW-Dev-Bypass')
    expect(devBypass.status).toBe(204)
    expect(devBypass.headers.get('access-control-allow-headers')).toBe('content-type, x-ww-dev-bypass')
  })

  it('refuses a disallowed or missing origin with 403 and no CORS headers', async () => {
    const env = makeEnv()
    for (const origin of [
      EVIL,
      null,
      'null',
      'http://localhost:8081/',
      'https://app.witnesswork.app.evil.example',
      'https://evil.app.witnesswork.app',
      'HTTP://LOCALHOST:8081',
    ]) {
      const response = await preflight(env, '/accounts/v1/account', origin)
      expect(response.status, String(origin)).toBe(403)
      expect(corsHeaders(response)).toEqual([])
    }
  })

  it('refuses a header outside the allow-list, or an unknown method', async () => {
    const env = makeEnv()
    const header = await preflight(
      env,
      '/accounts/v1/account',
      WEB,
      'authorization, x-api-key'
    )
    expect(header.status).toBe(403)
    expect(corsHeaders(header)).toEqual([])
    const method = await preflight(env, '/accounts/v1/account', WEB, null, 'PATCH')
    expect(method.status).toBe(403)
    expect(corsHeaders(method)).toEqual([])
  })

  it('is never rate limited, even with the bucket exhausted', async () => {
    const limiter = exhaustedLimiter()
    const env = makeEnv({ RATE_LIMITER: limiter })
    expect((await call(env, '/app/v1/config', { headers: { origin: WEB } })).status).toBe(429)
    const seen = limiter.seen.length
    for (const path of ['/app/v1/config', '/attestation/v1/challenge', '/geocode']) {
      expect((await preflight(env, path, WEB)).status).toBe(204)
    }
    expect(limiter.seen.length).toBe(seen)
  })

  it('answers before the Scribe cutover gate and any KV read', async () => {
    const env = makeEnv({
      NOTES_KV: {
        get: () => {
          throw new Error('KV read during a preflight')
        },
      },
    })
    expect((await preflight(env, '/notes-import/kickoff', WEB)).status).toBe(204)
  })
})

describe('responses', () => {
  it('carry the CORS headers for an allowed origin on success', async () => {
    const response = await call(makeEnv(), '/health', { headers: { origin: WEB } })
    expect(response.status).toBe(200)
    expectCors(response, WEB)
  })

  it('carry them on 401 with WWW-Authenticate', async () => {
    const response = await call(makeEnv(), '/accounts/v1/account', {
      headers: { origin: PROD_WEB, authorization: 'Bearer not.a.token' },
    })
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('Bearer')
    expectCors(response, PROD_WEB)
  })

  it('carry them on 429 with Retry-After', async () => {
    const response = await call(
      makeEnv({ RATE_LIMITER: exhaustedLimiter() }),
      '/app/v1/config',
      { headers: { origin: WEB } }
    )
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    expectCors(response, WEB)
  })

  it('carry them, Date exposed, on the public guest ops, whose preflight needs no Authorization', async () => {
    const BETA_WEB = 'https://beta.app.witnesswork.app'
    const kv = makeMemoryKv()
    await kv.put('spaces:enabled', 'true')
    await kv.put('spaces:guests', 'false')
    const env = makeEnv({ NOTES_KV: kv, WEB_APP_ORIGINS: `${PROD_WEB},${BETA_WEB}` })
    for (const origin of [PROD_WEB, BETA_WEB]) {
      for (const op of ['guest/sync', 'guest/put']) {
        const allowed = await preflight(env, `/spaces/v1/${op}`, origin, 'content-type')
        expect(allowed.status).toBe(204)
        expect(allowed.headers.get('access-control-allow-origin')).toBe(origin)
        expect(allowed.headers.get('access-control-allow-credentials')).toBeNull()
        // Guest links switched off: still a CORS answer the page can read.
        const response = await call(env, `/spaces/v1/${op}`, {
          method: 'POST',
          headers: { origin, 'content-type': 'application/json' },
          body: '{}',
        })
        expect(response.status).toBe(503)
        expectCors(response, origin)
        expect(response.headers.get('access-control-expose-headers')).toContain('Date')
      }
    }
  })

  it('carry them on 404', async () => {
    const response = await call(makeEnv(), '/nope', { headers: { origin: WEB } })
    expect(response.status).toBe(404)
    expectCors(response, WEB)
  })

  it('carry them on 500 from onError', async () => {
    const env = makeEnv({
      RATE_LIMITER: {
        limit: async () => {
          throw new Error('limiter down')
        },
      },
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await call(env, '/app/v1/config', { headers: { origin: WEB } })
    expect(response.status).toBe(500)
    expectCors(response, WEB)
  })

  it('copies a response whose headers are immutable, and leaves a 101 alone', async () => {
    const immutable = new Response('bytes', {
      status: 200,
      headers: { etag: '"abc"' },
    })
    const frozen = new Headers(immutable.headers)
    frozen.set = frozen.append = frozen.delete = () => {
      throw new TypeError("Can't modify immutable headers.")
    }
    Object.defineProperty(immutable, 'headers', { value: frozen })
    const copied = withCors(immutable, WEB)
    expect(copied).not.toBe(immutable)
    expectCors(copied, WEB)
    expect(copied.headers.get('etag')).toBe('"abc"')
    expect(await copied.text()).toBe('bytes')

    const upgrade = { status: 101, headers: frozen } as unknown as Response
    expect(withCors(upgrade, WEB)).toBe(upgrade)
  })

  it('carry nothing for a disallowed or missing origin', async () => {
    const env = makeEnv()
    for (const headers of [{ origin: EVIL }, {}] as Record<string, string>[]) {
      const ok = await call(env, '/health', { headers })
      expect(ok.status).toBe(200)
      expect(corsHeaders(ok)).toEqual([])
      const refused = await call(env, '/accounts/v1/account', {
        headers: { ...headers, authorization: 'Bearer not.a.token' },
      })
      expect(refused.status).toBe(401)
      expect(corsHeaders(refused)).toEqual([])
    }
  })

  it('carry nothing when WEB_APP_ORIGINS is unset', async () => {
    const env = makeEnv({ WEB_APP_ORIGINS: undefined })
    const response = await call(env, '/health', { headers: { origin: WEB } })
    expect(corsHeaders(response)).toEqual([])
    expect((await preflight(env, '/health', WEB)).status).toBe(403)
  })
})

describe('wrangler.toml', () => {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8')
  const origins = (section: string) =>
    (/^WEB_APP_ORIGINS = "([^"]*)"$/m.exec(toml.split(`\n[${section}]\n`)[1]?.split(/\n\[/)[0] ?? '')?.[1] ?? '')
      .split(',')
      .filter(Boolean)
  const PRODUCTION = origins('vars')
  const BETA = origins('env.beta.vars')
  const LOCAL = origins('env.dev.vars')

  it('lists each environment’s own web app', () => {
    // beta.app stays in production for Beta web builds from before the Beta API.
    expect(PRODUCTION).toEqual([PROD_WEB, 'https://beta.app.witnesswork.app'])
    expect(BETA).toEqual(['https://beta.app.witnesswork.app'])
    expect(LOCAL).toContain(WEB)
    expect(LOCAL.every((origin) => /^http:\/\/localhost:\d+$/.test(origin))).toBe(true)
  })

  it.each([
    ['production', PRODUCTION],
    ['Beta', BETA],
    ['local development', LOCAL],
  ])('admits exactly the %s list', async (_name, allowed) => {
    const env = makeEnv({ WEB_APP_ORIGINS: allowed.join(',') })
    for (const origin of new Set([...PRODUCTION, ...BETA, ...LOCAL])) {
      const response = await preflight(env, '/accounts/v1/account', origin)
      expect(response.status, origin).toBe(allowed.includes(origin) ? 204 : 403)
      const health = await call(env, '/health', { headers: { origin } })
      expect(health.headers.get('access-control-allow-origin'), origin).toBe(
        allowed.includes(origin) ? origin : null
      )
    }
  })
})
