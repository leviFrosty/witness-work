import { afterAll, describe, expect, it, vi } from 'vitest'
import type { Environment } from '../types'
import { relayError } from '../test/buddiesClient'

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: DurableObjectState
    env: unknown
    constructor(ctx: DurableObjectState, env: unknown) {
      this.ctx = ctx
      this.env = env
    }
  },
}))

// Sentry's fetch integration wraps the global on first request; undo that so
// it can't leak into other test files sharing this worker.
const originalFetch = globalThis.fetch
afterAll(() => {
  globalThis.fetch = originalFetch
})

describe('Worker entry', () => {
  it('mounts the Buddies relay, its live socket, the /b page, and exports both Durable Objects', async () => {
    const entry = await import('../index')
    expect(typeof entry.BuddyInbox).toBe('function')
    expect(typeof entry.BuddyInvite).toBe('function')

    const env = {
      NOTES_KV: { get: async () => null },
      BUDDIES_ENABLED: 'false',
      CF_VERSION_METADATA: { id: 'test', tag: '', timestamp: '' },
    } as unknown as Environment
    const ctx = {
      waitUntil: () => undefined,
      passThroughOnException: () => undefined,
    } as unknown as ExecutionContext
    const call = (path: string, init?: RequestInit) =>
      entry.default.fetch!(
        new Request(`https://ww-proxy.test${path}`, init) as never,
        env,
        ctx
      )

    const disabled = await call('/buddies/v1/inbox/sync', {
      method: 'POST',
      body: '{}',
    })
    expect(disabled.status).toBe(503)
    expect(await disabled.json()).toEqual(relayError('disabled'))

    // Always-allowed ops get past the kill switch to envelope validation.
    const malformed = await call('/buddies/v1/slot/leave', {
      method: 'POST',
      body: 'x',
    })
    expect(await malformed.json()).toEqual(relayError('bad_request'))

    expect(
      (await call('/buddies/v1/nope', { method: 'POST', body: '{}' })).status
    ).toBe(404)

    // The live socket is GET-only and honors the kill switch.
    const live = await call('/buddies/v1/inbox/live', {
      headers: { upgrade: 'websocket' },
    })
    expect(live.status).toBe(503)
    expect(await live.json()).toEqual(relayError('disabled'))
    expect(
      (await call('/buddies/v1/inbox/live', { method: 'POST', body: '{}' }))
        .status
    ).toBe(404)
    const page = await call('/b')
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('Open this invite in WitnessWork')
    // A cold import of the whole Worker; slow when the machine is busy.
  }, 30_000)

  it('mounts Shared Spaces at /spaces/v1 and exports its Durable Object', async () => {
    const entry = await import('../index')
    expect(typeof entry.SharedSpace).toBe('function')

    // SPACES_ENABLED absent and no KV key: the kill switch is off.
    const env = {
      NOTES_KV: { get: async () => null },
      CF_VERSION_METADATA: { id: 'test', tag: '', timestamp: '' },
    } as unknown as Environment
    const ctx = {
      waitUntil: () => undefined,
      passThroughOnException: () => undefined,
    } as unknown as ExecutionContext
    const call = (path: string, init?: RequestInit) =>
      entry.default.fetch!(
        new Request(`https://ww-proxy.test${path}`, init) as never,
        env,
        ctx
      )

    const disabled = await call('/spaces/v1/sync', { method: 'POST', body: '{}' })
    expect(disabled.status).toBe(503)
    expect(disabled.headers.get('retry-after')).toBe('60')
    expect(await disabled.json()).toMatchObject(relayError('disabled'))
    const live = await call('/spaces/v1/live', { headers: { upgrade: 'websocket' } })
    expect(live.status).toBe(503)
    expect(await live.json()).toMatchObject(relayError('disabled'))
    // The switch spares leave, but this worker has no account sessions.
    const leave = await call('/spaces/v1/leave', { method: 'POST', body: '{}' })
    expect(leave.status).toBe(503)
    expect(await leave.json()).toMatchObject(relayError('disabled'))
    expect((await call('/spaces/v1/nope', { method: 'POST', body: '{}' })).status).toBe(404)
    expect((await call('/spaces/v1/sync')).status).toBe(404)
  })
})
