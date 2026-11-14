import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }))

import { app } from '../app'
import { makeMemoryKv, type MemoryKv } from '../test/memoryKv'
import type { Environment } from '../types'

/**
 * The hard cutover (protocol: Legacy cutover): with KV
 * `scribe:legacy-notes-import` off or absent, every Notes Import route but
 * `GET /notes-import/status` is 426 before its rate limit, auth, or kill
 * switch, except `GET /notes-import/usage`, which is 404; with it on, they
 * answer as before.
 */

const ORIGIN = 'https://ww-proxy.leviwilkerson.com'
const IMPORT_ID = `imp_${'0'.repeat(40)}`

const USAGE: [string, string] = ['GET', '/notes-import/usage']

/** The routes that answer 426 while the legacy routes are off. */
const ROUTES: [string, string][] = [
  ['POST', '/notes-import/challenge'],
  ['POST', '/notes-import/attest'],
  ['POST', '/notes-import/verify'],
  ['POST', '/notes-import/kickoff'],
  ['POST', '/notes-import/transcribe'],
  ['GET', `/notes-import/${IMPORT_ID}/events`],
  ['GET', `/notes-import/${IMPORT_ID}/result`],
  ['POST', `/notes-import/${IMPORT_ID}/cancel`],
  ['POST', `/notes-import/${IMPORT_ID}/destroy`],
  ['POST', '/notes-import'],
  ['POST', '/notes-import/status'],
]

let kv: MemoryKv
let env: Environment
let rateLimit: ReturnType<typeof vi.fn>

beforeEach(() => {
  kv = makeMemoryKv()
  rateLimit = vi.fn(async () => ({ success: true }))
  env = {
    APP_ATTEST_ENVIRONMENT: 'production',
    NOTES_KV: kv,
    RATE_LIMITER: { limit: rateLimit },
    OPENROUTER_API_KEY: 'or-test',
  } as unknown as Environment
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 503 }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const call = (method: string, path: string, headers: Record<string, string> = {}) =>
  app.fetch(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.18.0.7', ...headers },
      body: method === 'POST' ? '{}' : undefined,
    }),
    env,
    { waitUntil: () => undefined, passThroughOnException: () => undefined } as never
  )

describe('legacy off (absent or off)', () => {
  it.each(ROUTES)('%s %s → 426 upgrade_required', async (method, path) => {
    for (const value of [null, 'off']) {
      if (value) await kv.put('scribe:legacy-notes-import', value)
      const response = await call(method, path, { authorization: 'Bearer not-a-token' })
      expect(response.status).toBe(426)
      expect(response.headers.get('retry-after')).toBeNull()
      expect(await response.json()).toEqual({
        ok: false,
        error: 'Update required',
        code: 'upgrade_required',
      })
    }
    // Refused before the family's rate limit counts it.
    expect(rateLimit).not.toHaveBeenCalled()
  })

  it('answers GET /notes-import/usage 404, as before the route, so older composers stay open', async () => {
    for (const value of [null, 'off']) {
      if (value) await kv.put('scribe:legacy-notes-import', value)
      const response = await call(...USAGE, { authorization: 'Bearer not-a-token' })
      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({ ok: false, code: 'not_found' })
    }
    expect(rateLimit).not.toHaveBeenCalled()
  })

  it('keeps GET /notes-import/status', async () => {
    const response = await call('GET', '/notes-import/status')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ capabilities: { appAttest: expect.any(Object) } })
  })

  it('hides /admin/notes-import/reset', async () => {
    const response = await call('POST', '/admin/notes-import/reset', { 'x-ww-admin-token': 'x' })
    expect(response.status).toBe(404)
  })

  it('leaves other routes alone', async () => {
    const response = await call('GET', '/attestation/v1/status')
    expect(response.status).toBe(200)
  })
})

describe('legacy on', () => {
  beforeEach(async () => {
    await kv.put('scribe:legacy-notes-import', 'on')
  })

  it.each([USAGE, ...ROUTES].filter(([method, path]) => !(method === 'POST' && path === '/notes-import/status')))(
    '%s %s answers as before',
    async (method, path) => {
      const response = await call(method, path)
      expect(response.status).not.toBe(426)
      expect(response.status).not.toBe(404)
      // The family's rate limit runs again (usage has none of its own).
      if (path !== '/notes-import/usage') expect(rateLimit).toHaveBeenCalled()
    }
  )

  it('lets a KV failure through rather than sending every old app to Update Required', async () => {
    env = { ...env, NOTES_KV: { get: async () => Promise.reject(new Error('kv down')) } } as never
    // A bearer request: a request signed the pre-session way is refused by
    // the account legacy switch itself, whose failed read counts as off
    // (ADR 0038 §11).
    const response = await call('POST', '/notes-import/kickoff', { authorization: 'Bearer x' })
    expect(response.status).not.toBe(426)
    expect((await call('POST', '/notes-import/kickoff')).status).toBe(426)
  })
})
