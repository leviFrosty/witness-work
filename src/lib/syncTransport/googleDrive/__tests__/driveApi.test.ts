import { describe, expect, it, vi } from 'vitest'
import {
  classifyDriveError,
  createDriveApi,
  RESUMABLE_JSON_BYTES,
  utf8Length,
} from '@/lib/syncTransport/googleDrive/driveApi'
import { SyncTransportError } from '@/lib/syncTransport/types'
import { driveKit } from './driveTestKit'

// The Drive REST client against an in-memory Drive: request shapes, paging,
// error classification, token refresh and retries.

describe('classifyDriveError', () => {
  it.each([
    [401, null, 'unauthorized'],
    [403, 'storageQuotaExceeded', 'storage-full'],
    [403, 'userRateLimitExceeded', 'rate-limited'],
    [403, 'rateLimitExceeded', 'rate-limited'],
    [403, 'insufficientPermissions', 'unauthorized'],
    [403, 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'unauthorized'],
    [403, 'RATE_LIMIT_EXCEEDED', 'rate-limited'],
    // A 403 Drive didn't explain is no reason to disconnect anyone.
    [403, null, 'unknown'],
    [403, 'somethingNew', 'unknown'],
    // API usage limits, not the user's storage.
    [403, 'quotaExceeded', 'rate-limited'],
    [403, 'dailyLimitExceeded', 'rate-limited'],
    [404, 'notFound', 'not-found'],
    [429, null, 'rate-limited'],
    [500, 'backendError', 'network'],
    [503, null, 'network'],
    [400, 'badRequest', 'unknown'],
  ] as const)('%i %s is %s', (status, reason, code) => {
    expect(classifyDriveError(status, reason)).toBe(code)
  })
})

describe('createDriveApi', () => {
  it('round-trips JSON with non-ASCII content through a multipart create', async () => {
    const { drive, api } = driveKit()
    const json = JSON.stringify({ name: 'Zoë 山田 — ½' })
    const created = await api('a').createJson('witness-work-d1.json', json)
    expect(created.name).toBe('witness-work-d1.json')
    expect(await api('a').downloadText(created.id)).toBe(json)
    expect(drive.text('a', 'witness-work-d1.json')).toBe(json)
  })

  it('lists every page of the app data folder', async () => {
    const { drive, api } = driveKit({ maxPageSize: 2 })
    for (let i = 0; i < 5; i++) drive.put('a', `witness-work-${i}.json`, '{}')
    const files = await api('a').listFiles()
    expect(files.map((f) => f.name).sort()).toEqual([
      'witness-work-0.json',
      'witness-work-1.json',
      'witness-work-2.json',
      'witness-work-3.json',
      'witness-work-4.json',
    ])
    expect(drive.log.filter((r) => r.path === '/drive/v3/files')).toHaveLength(
      3
    )
  })

  it('keeps each account in its own folder', async () => {
    const { drive, api } = driveKit()
    await api('a').createJson('witness-work-d1.json', '{"a":1}')
    expect(await api('b').listFiles()).toEqual([])
    expect(drive.files('a')).toHaveLength(1)
    expect(await api('b').accountId()).toBe('b')
  })

  it('asks for a fresh token once after a 401, then succeeds', async () => {
    const { drive, api, tokens } = driveKit()
    drive.failNext((r) => r.method === 'GET', 401, 'authError')
    expect(await api('a').listFiles()).toEqual([])
    expect(tokens).toEqual([
      { refresh: false },
      { refresh: true, rejected: 'fake:a' },
    ])
  })

  it('backs off and retries throttling and server errors', async () => {
    const { drive, api } = driveKit()
    drive.failNext(() => true, 429)
    drive.failNext(() => true, 503, 'backendError')
    expect(await api('a').listFiles()).toEqual([])
  })

  it('gives up after its retries with a classified error', async () => {
    const { drive, api } = driveKit()
    // The first attempt and four retries.
    for (let i = 0; i < 5; i++)
      drive.failNext(() => true, 403, 'userRateLimitExceeded')
    await expect(api('a').listFiles()).rejects.toMatchObject({
      code: 'rate-limited',
    })
  })

  it('reports a full Google account as storage-full without retrying', async () => {
    const { drive, api } = driveKit()
    drive.setQuota('a', 4)
    const error = await api('a')
      .createJson('witness-work-d1.json', '{"too":"big"}')
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SyncTransportError)
    expect((error as SyncTransportError).code).toBe('storage-full')
    expect(drive.files('a')).toEqual([])
  })

  it('treats deleting a missing file as done', async () => {
    const { api } = driveKit()
    await expect(api('a').deleteFile('nope')).resolves.toBeUndefined()
  })

  it('uploads and downloads photo bytes through a resumable session', async () => {
    const { drive, api, local } = driveKit()
    local.set('/local/photo.jpg', new Uint8Array([1, 2, 3]))
    const uploaded = await api('a').uploadBinary({
      existingId: null,
      name: 'witness-work-img-profile--r1.jpg',
      sourcePath: '/local/photo.jpg',
    })
    expect(uploaded.size).toBe(3)
    expect(drive.files('a')[0].mimeType).toBe('image/jpeg')
    await api('a').downloadBinary(uploaded.id, '/local/copy.jpg')
    expect([...local.get('/local/copy.jpg')!]).toEqual([1, 2, 3])
  })

  it('waits as long as Retry-After asks, up to a limit', async () => {
    const { drive } = driveKit()
    const waits: number[] = []
    let throttled = 2
    const api = createDriveApi({
      origin: drive.origin,
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (throttled-- > 0)
          return new Response(
            JSON.stringify({
              error: { errors: [{ reason: 'userRateLimitExceeded' }] },
            }),
            { status: 403, headers: { 'Retry-After': '7' } }
          )
        return drive.fetch(input, init)
      }) as typeof fetch,
      transfer: { upload: vi.fn(), download: vi.fn() },
      sleep: async (ms) => {
        waits.push(ms)
      },
      getToken: async () => 'fake:a',
    })
    expect(await api.listFiles()).toEqual([])
    expect(waits).toEqual([7_000, 7_000])
  })

  it('leaves a long Retry-After to the sync engine instead of waiting', async () => {
    const waits: number[] = []
    const api = createDriveApi({
      fetch: (async () =>
        new Response('{}', {
          status: 429,
          headers: { 'Retry-After': '120' },
        })) as typeof fetch,
      transfer: { upload: vi.fn(), download: vi.fn() },
      sleep: async (ms) => {
        waits.push(ms)
      },
      getToken: async () => 'fake:a',
    })
    await expect(api.listFiles()).rejects.toMatchObject({
      code: 'rate-limited',
      retryAfterMs: 120_000,
    })
    expect(waits).toEqual([])
  })

  it('backs off exponentially between retries', async () => {
    const waits: number[] = []
    const api = createDriveApi({
      fetch: (async () => new Response('{}', { status: 503 })) as typeof fetch,
      transfer: { upload: vi.fn(), download: vi.fn() },
      sleep: async (ms) => {
        waits.push(ms)
      },
      getToken: async () => 'fake:a',
    })
    await expect(api.listFiles()).rejects.toMatchObject({ code: 'network' })
    expect(waits).toHaveLength(4)
    waits.forEach((ms, retry) => {
      expect(ms).toBeGreaterThanOrEqual(1_000 * 2 ** retry)
      expect(ms).toBeLessThan(1_000 * 2 ** retry + 1_000)
    })
  })

  it('classifies a failed photo download by the reason in its body', async () => {
    const tokens: unknown[] = []
    const api = createDriveApi({
      fetch: vi.fn() as unknown as typeof fetch,
      transfer: {
        upload: vi.fn(),
        download: vi.fn(async () => ({
          status: 403,
          body: JSON.stringify({
            error: { errors: [{ reason: 'userRateLimitExceeded' }] },
          }),
        })),
      },
      sleep: async () => {},
      getToken: async (options) => {
        tokens.push(options)
        return 'fake:a'
      },
    })
    await expect(api.downloadBinary('id', '/tmp/x')).rejects.toMatchObject({
      code: 'rate-limited',
    })
    // Throttling never asks for a fresh token.
    expect(tokens.every((t) => !(t as { refresh: boolean }).refresh)).toBe(true)
  })

  it('uploads JSON over 4 MB through a resumable session', async () => {
    const { drive, api } = driveKit()
    const json = JSON.stringify({ blob: 'x'.repeat(RESUMABLE_JSON_BYTES) })
    const created = await api('a').createJson('witness-work-big.json', json)
    expect(drive.text('a', 'witness-work-big.json')).toBe(json)
    expect(created.size).toBe(json.length)
    expect(drive.log.some((r) => r.path.startsWith('/upload/sessions/'))).toBe(
      true
    )
    expect(utf8Length('Zoë 山田 😀')).toBe(
      new TextEncoder().encode('Zoë 山田 😀').length
    )
  })
})
