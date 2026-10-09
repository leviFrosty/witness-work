import { fetch as expoFetch } from 'expo/fetch'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NotesImportAppAttestError,
  NotesImportAppAttestHttpError,
} from '@/features/notes-import/lib/notesImportAppAttest'

const harness = vi.hoisted(() => ({
  post: vi.fn(),
}))

vi.mock('expo/fetch', () => ({ fetch: vi.fn() }))
vi.mock('expo-network', () => ({
  addNetworkStateListener: vi.fn(),
  getNetworkStateAsync: vi.fn(() => new Promise(() => {})),
}))
vi.mock('@/lib/perf', () => ({ perf: { count: vi.fn() } }))
vi.mock('@/features/notes-import/lib/notesContentHash', () => ({
  notesContentHash: vi.fn(async () => 'a'.repeat(64)),
}))
vi.mock('@/features/notes-import/lib/notesImportAuthRuntime', () => ({
  notesImportAuth: { post: harness.post },
}))

import {
  consumeStream,
  runNotesImportStreaming,
  resumeNotesImport,
  SSE_IDLE_TIMEOUT_MS,
} from '@/features/notes-import/lib/notesImportClient'
import { perf } from '@/lib/perf'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** A stream body the test feeds by hand; it never closes on its own. */
const controlledBody = () => {
  let controller!: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>
  const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(c) {
      controller = c
    },
  })
  const encoder = new TextEncoder()
  return {
    body,
    push: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
  }
}

const doneEvent = (summary: string) =>
  'id: 2\ndata: ' +
  JSON.stringify({
    type: 'done',
    payload: {
      result: {
        contacts: [],
        visits: [],
        timeEntries: [],
        categories: [],
        publisher: null,
        warnings: [],
        summary,
        assistantMessage: '',
      },
      contentHash: 'h',
      refinement: false,
      credits: null,
    },
  }) +
  '\n\n'

const request = {
  notesText: 'private notes',
  context: {
    now: '2026-07-23T09:30:00-05:00',
    timeZone: 'America/Chicago',
    existingContacts: [],
    existingCategories: [],
  },
}

describe('Notes Import client authorization errors', () => {
  beforeEach(() => {
    harness.post.mockReset()
  })

  it('preserves backend reason and action from semantic authorization errors', async () => {
    harness.post.mockRejectedValueOnce(
      new NotesImportAppAttestError('counterConflict', {
        status: 409,
        serverCode: 'attestation_failed',
        reason: 'counter_not_increasing',
        action: 'start_new_operation',
      })
    )

    await expect(runNotesImportStreaming(request)).rejects.toMatchObject({
      name: 'NotesImportClientError',
      code: 'attestation_failed',
      status: 409,
      reason: 'counter_not_increasing',
      action: 'start_new_operation',
    })
  })

  it.each([
    ['deviceIneligible', 'device_ineligible'],
    ['playServicesUnavailable', 'play_services_required'],
  ] as const)(
    'maps Android verification failure %s to %s',
    async (authCode, clientCode) => {
      harness.post.mockRejectedValueOnce(
        new NotesImportAppAttestError(authCode, {
          status: 403,
          reason: 'device_integrity_failed',
          action: 'none',
        })
      )

      await expect(runNotesImportStreaming(request)).rejects.toMatchObject({
        name: 'NotesImportClientError',
        code: clientCode,
        reason: 'device_integrity_failed',
      })
    }
  )

  it('keeps cancellation distinct from a network failure', async () => {
    harness.post.mockRejectedValueOnce(
      new NotesImportAppAttestHttpError({ kind: 'cancelled' })
    )

    await expect(runNotesImportStreaming(request)).rejects.toMatchObject({
      name: 'NotesImportClientError',
      code: 'cancelled',
      message: 'Import cancelled',
    })
  })
})

describe('Notes Import terminal error safety', () => {
  it('normalizes an unrecognized stream error code', async () => {
    vi.mocked(expoFetch, { partial: true }).mockResolvedValueOnce({
      status: 200,
      ok: true,
      body: new Response(
        'data: ' +
          JSON.stringify({
            type: 'error',
            code: 'private server text',
            message: 'failed',
          }) +
          '\n\n'
      ).body,
    })
    await expect(
      resumeNotesImport({
        ...request,
        run: { importId: 'run', subscribeToken: 'token' },
      })
    ).rejects.toMatchObject({ code: 'unknown' })
  })

  it('normalizes an unrecognized snapshot error code', async () => {
    vi.mocked(expoFetch, { partial: true }).mockResolvedValueOnce({
      status: 200,
      ok: true,
      body: new Response('').body,
    })
    const get = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: 'error',
            error: { code: 'private server text', message: 'failed' },
          }),
          { status: 200 }
        )
    )
    vi.stubGlobal('fetch', get)
    await expect(
      resumeNotesImport({
        ...request,
        run: { importId: 'run', subscribeToken: 'token' },
      })
    ).rejects.toMatchObject({ code: 'unknown' })
    expect(get).toHaveBeenCalledTimes(1)
  })
})

describe('Notes Import service errors this build does not know', () => {
  beforeEach(() => {
    harness.post.mockReset()
  })

  it.each([
    [503, 'server_error'],
    [429, 'rate_limited'],
    [502, undefined],
  ])('reads a %i %s as temporarily unavailable', async (status, serverCode) => {
    harness.post.mockRejectedValueOnce(
      new NotesImportAppAttestHttpError({
        kind: 'http',
        status,
        serverCode,
        retryAfterMs: 30_000,
      })
    )
    await expect(runNotesImportStreaming(request)).rejects.toMatchObject({
      code: 'unavailable',
      retryAfterMs: 30_000,
    })
  })

  it('keeps an unknown 4xx as unknown', async () => {
    harness.post.mockRejectedValueOnce(
      new NotesImportAppAttestHttpError({
        kind: 'http',
        status: 418,
        serverCode: 'teapot',
      })
    )
    await expect(runNotesImportStreaming(request)).rejects.toMatchObject({
      code: 'unknown',
    })
  })
})

describe('Notes Import attestation outages', () => {
  beforeEach(() => {
    harness.post.mockReset()
  })

  it.each([
    'serverUnavailable',
    'protocolUnavailable',
    'storageFailure',
  ] as const)(
    'reports %s as a temporary outage, not a failed device',
    async (authCode) => {
      harness.post.mockRejectedValueOnce(
        new NotesImportAppAttestError(authCode)
      )
      await expect(runNotesImportStreaming(request)).rejects.toMatchObject({
        code: 'attestation_unavailable',
      })
    }
  )

  it.each(['authorizationFailed', 'unsupported', 'invalidKey'] as const)(
    'keeps %s as a verification failure',
    async (authCode) => {
      harness.post.mockRejectedValueOnce(
        new NotesImportAppAttestError(authCode)
      )
      await expect(runNotesImportStreaming(request)).rejects.toMatchObject({
        code: 'attestation_failed',
      })
    }
  )
})

describe('Notes Import SSE idle watchdog', () => {
  beforeEach(() => {
    vi.mocked(expoFetch).mockReset()
    vi.mocked(perf.count).mockClear()
  })

  const open = (body: ReadableStream<Uint8Array<ArrayBuffer>>) =>
    vi.mocked(expoFetch, { partial: true }).mockResolvedValueOnce({
      status: 200,
      ok: true,
      body,
    })

  it('drops a silent stream after the idle timeout and reports it closed', async () => {
    vi.useFakeTimers()
    const stream = controlledBody()
    open(stream.body)
    let outcome: unknown
    void consumeStream('run', 'token', '0', vi.fn(), vi.fn()).then((o) => {
      outcome = o
    })
    await vi.advanceTimersByTimeAsync(SSE_IDLE_TIMEOUT_MS - 1)
    expect(outcome).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(outcome).toEqual({ kind: 'closed' })
    expect(perf.count).toHaveBeenCalledWith('notesImport:sseIdleAbort')
    const init = vi.mocked(expoFetch).mock.calls[0][1]
    expect(init?.signal?.aborted).toBe(true)
  })

  it('resets on every chunk, heartbeat comments included, and ignores them', async () => {
    vi.useFakeTimers()
    const stream = controlledBody()
    open(stream.body)
    const onEvent = vi.fn()
    const onCursor = vi.fn()
    let outcome: unknown
    void consumeStream('run', 'token', '0', onEvent, onCursor).then((o) => {
      outcome = o
    })
    await vi.advanceTimersByTimeAsync(30_000)
    stream.push(': heartbeat\n\n')
    await vi.advanceTimersByTimeAsync(30_000)
    stream.push(': heartbeat\n\n')
    await vi.advanceTimersByTimeAsync(SSE_IDLE_TIMEOUT_MS - 1)
    expect(outcome).toBeUndefined()
    expect(onEvent).not.toHaveBeenCalled()
    expect(onCursor).not.toHaveBeenCalled()
    stream.push(doneEvent('after heartbeats'))
    await vi.advanceTimersByTimeAsync(0)
    expect(outcome).toMatchObject({
      kind: 'done',
      payload: { result: { summary: 'after heartbeats' } },
    })
    expect(perf.count).not.toHaveBeenCalledWith('notesImport:sseIdleAbort')
  })

  it('times out a connection that never answers', async () => {
    vi.useFakeTimers()
    vi.mocked(expoFetch).mockReturnValueOnce(new Promise(() => {}))
    let outcome: unknown
    void consumeStream('run', 'token', '0', vi.fn(), vi.fn()).then((o) => {
      outcome = o
    })
    await vi.advanceTimersByTimeAsync(SSE_IDLE_TIMEOUT_MS)
    expect(outcome).toEqual({ kind: 'closed' })
  })

  it('still reports a caller cancel as a cancel', async () => {
    vi.mocked(expoFetch, { partial: true }).mockImplementationOnce(
      async (_url, init) => ({
        status: 200,
        ok: true,
        // Like expo/fetch: aborting the request errors the body.
        body: new ReadableStream<Uint8Array<ArrayBuffer>>({
          start(c) {
            init?.signal?.addEventListener('abort', () =>
              c.error(
                Object.assign(new Error('Aborted'), { name: 'AbortError' })
              )
            )
          },
        }),
      })
    )
    const controller = new AbortController()
    const pending = resumeNotesImport({
      ...request,
      run: { importId: 'run', subscribeToken: 'token' },
      signal: controller.signal,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' })
    expect(perf.count).not.toHaveBeenCalledWith('notesImport:sseIdleAbort')
  })

  it('falls through to the snapshot after a stall and resolves from it', async () => {
    vi.useFakeTimers()
    const stream = controlledBody()
    open(stream.body)
    const snapshot = vi.fn(
      async (_url: string) =>
        new Response(
          JSON.stringify({
            status: 'done',
            payload: {
              result: {
                contacts: [],
                visits: [],
                timeEntries: [],
                categories: [],
                publisher: null,
                warnings: [],
                summary: 'from snapshot',
                assistantMessage: '',
              },
              contentHash: 'h',
              refinement: false,
              credits: null,
            },
          }),
          { status: 200 }
        )
    )
    vi.stubGlobal('fetch', snapshot)
    let resolved: unknown
    void resumeNotesImport({
      ...request,
      run: { importId: 'run', subscribeToken: 'token' },
    }).then((r) => {
      resolved = r
    })
    stream.push('id: 1\ndata: {"type":"status","status":"thinking"}\n\n')
    await vi.advanceTimersByTimeAsync(SSE_IDLE_TIMEOUT_MS)
    expect(snapshot).toHaveBeenCalledTimes(1)
    expect(String(snapshot.mock.calls[0][0])).toContain(
      '/notes-import/run/result'
    )
    expect(resolved).toMatchObject({ result: { summary: 'from snapshot' } })
  })
})
