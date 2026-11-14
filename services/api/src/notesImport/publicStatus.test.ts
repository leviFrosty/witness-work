import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppContext, Environment } from '../types'
import { makeMemoryKv } from '../test/memoryKv'
import { handleNotesImportStatusRequest } from './route'
import { getNotesImportStatus } from './status'
import { getNotesImportConfig } from './config'

function fixture() {
  const kv = makeMemoryKv()
  kv.store.set('notes-import:provider-health', 'up')
  const get = vi.spyOn(kv, 'get')
  const env = {
    APP_ATTEST_ENVIRONMENT: 'production',
    NOTES_KV: kv,
    OPENROUTER_API_KEY: 'test',
  } as unknown as Environment
  const context = {
    env,
    json: (body: unknown, status: number, headers: HeadersInit) =>
      Response.json(body, { status, headers }),
  } as unknown as AppContext
  return {
    kv,
    get,
    env,
    request: () => handleNotesImportStatusRequest(context),
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('public status freshness', () => {
  it('reuses completed responses for 30 seconds and then refreshes policy and version', async () => {
    vi.useFakeTimers()
    const { kv, get, request } = fixture()
    const first = await request()
    expect(first.headers.get('Cache-Control')).toBe('no-store')
    expect(await first.json()).toMatchObject({
      available: true,
      limits: { windowDays: 30 },
    })
    const reads = get.mock.calls.length
    kv.store.set('notes-import:enabled', 'false')
    kv.store.set('notes-import:min-version', '"9.0.0"')
    await vi.advanceTimersByTimeAsync(29_999)
    expect(await (await request()).json()).toMatchObject({ available: true })
    expect(get).toHaveBeenCalledTimes(reads)
    await vi.advanceTimersByTimeAsync(1)
    expect(await (await request()).json()).toMatchObject({
      available: false,
      minAppVersion: '9.0.0',
    })
    expect(get.mock.calls.length).toBeGreaterThan(reads)
  })

  it('does not reuse public UI hints for import enforcement or another environment', async () => {
    const { kv, env, request } = fixture()
    await request()
    kv.store.set('notes-import:enabled', 'false')
    expect(
      await getNotesImportStatus({
        kv: env.NOTES_KV,
        env,
        apiKey: 'test',
        config: getNotesImportConfig(env),
        includeLimits: false,
      }),
    ).toMatchObject({ available: false, reason: 'disabled' })
    const other = fixture()
    other.kv.store.set('notes-import:enabled', 'false')
    expect(await (await other.request()).json()).toMatchObject({
      available: false,
    })
  })

  it('does not cache degraded fail-open results', async () => {
    const { kv, request } = fixture()
    kv.store.delete('notes-import:provider-health')
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('failed', { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          data: { endpoints: [{ provider_name: 'Azure', status: 0 }] },
        }),
      )
    vi.stubGlobal('fetch', fetchFn)
    const degraded = await (await request()).json()
    expect(degraded).toMatchObject({ available: true })
    expect(degraded).not.toHaveProperty('limits')
    expect(await (await request()).json()).toHaveProperty('limits')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('bounds a stalled provider response body without caching the failure', async () => {
    vi.useFakeTimers()
    const { kv, request } = fixture()
    kv.store.delete('notes-import:provider-health')
    const fetchFn = vi.fn(
      async (_url, init: RequestInit) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init.signal!.addEventListener('abort', () =>
                controller.error(new Error('aborted')),
              )
            },
          }),
        ),
    )
    vi.stubGlobal('fetch', fetchFn)
    const response = request()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(await (await response).json()).not.toHaveProperty('limits')
    expect(fetchFn.mock.calls[0][1].signal?.aborted).toBe(true)
    expect(kv.store.has('notes-import:provider-health')).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
