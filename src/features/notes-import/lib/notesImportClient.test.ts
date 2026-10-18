import { fetch as expoFetch } from 'expo/fetch'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AttestationError,
  type AttestedRequest,
} from '@/lib/attestation/appAttest'

const DAY = 24 * 60 * 60 * 1000

const harness = vi.hoisted(() => ({
  now: 1_000_000_000_000,
  fetch: (async () => {
    throw new Error('no worker')
  }) as (url: string, init: RequestInit) => Promise<Response>,
  assert: (async <T>(request: AttestedRequest<T>) =>
    request.submit({ kind: 'devBypass', token: 'dev-token' })) as <T>(
    request: AttestedRequest<T>
  ) => Promise<T>,
  links: 0,
  support: 'supported' as 'supported' | 'unsupported' | 'unknown',
  checkSupport: { calls: 0 },
  upgradeRequired: { calls: 0 },
  /** This device already has the account key (without a session). */
  hasAccountKey: false,
}))

vi.mock('expo/fetch', () => ({ fetch: vi.fn() }))
vi.mock('@/lib/http/online', () => ({ isKnownOffline: () => false }))
vi.mock('@/lib/perf', () => ({ perf: { count: vi.fn() } }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/serverAccount/revenueCatLinkRuntime', () => ({
  linkBeforePaidCall: async () => {
    harness.links++
  },
}))
vi.mock('@/lib/attestation', () => ({
  deviceAttestation: {
    checkSupport: async () => {
      harness.checkSupport.calls++
      return harness.support
    },
  },
}))
// The real session client, against the fake worker below: Notes Import's
// tokens, refreshes and reopened sessions are the app's own.
vi.mock('@/lib/serverAccount', async () => {
  const { createAccountSessions } = await import('@/lib/serverAccount/session')
  const { default: apis } = await import('@/constants/apis')
  return {
    accountSessions: createAccountSessions({
      baseUrl: apis.accounts,
      now: () => harness.now,
      localNow: () => harness.now,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      attestation: { assert: (request) => harness.assert(request) },
      store: { read: async () => null, write: async () => {} },
      accountKey: async () => new Uint8Array(32).fill(1),
      fetchImpl: ((url: string, init: RequestInit) =>
        harness.fetch(url, init)) as typeof fetch,
      onUpgradeRequired: () => {
        harness.upgradeRequired.calls++
      },
    }),
    hasAccountKey: async () => harness.hasAccountKey,
  }
})

import { accountSessions } from '@/lib/serverAccount'
import {
  consumeStream,
  destroyNotesImport,
  fetchNotesImportAccountUsage,
  fetchNotesImportResult,
  notesImportDeviceUnverified,
  requestNotesImport,
  resumeNotesImport,
  runNotesImportStreaming,
  SSE_IDLE_TIMEOUT_MS,
  transcribeNotesPage,
} from '@/features/notes-import/lib/notesImportClient'
import { perf } from '@/lib/perf'

type Call = {
  method: string
  path: string
  query: string
  headers: Record<string, string>
  body: Record<string, unknown> | null
}
type Handler = (call: Call) => Response | Promise<Response>

const json = (status: number, body: unknown, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

const refusal = (status: number, code: string, extra = {}) =>
  json(status, { ok: false, error: `${code} message`, code, ...extra })

/**
 * Ww-api as Notes Import sees it on account sessions: the session routes, and
 * Notes Import routes that take only a live bearer token (a 401 otherwise).
 * Tests answer the Notes Import routes they use through `on`.
 */
function fakeWorker() {
  const calls: Call[] = []
  const live = new Set<string>()
  const routes = new Map<string, Handler>()
  let issued = 0

  const tokens = () => {
    const accessToken = `at-${++issued}`
    live.add(accessToken)
    return {
      accessToken,
      accessExpiresAt: harness.now + 15 * 60_000,
      refreshToken: `rt-${issued}`,
      sessionExpiresAt: harness.now + 90 * DAY,
    }
  }

  const handle = async (url: string, init: RequestInit = {}) => {
    const parsed = new URL(url)
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(
      (init.headers ?? {}) as Record<string, string>
    ))
      headers[key.toLowerCase()] = value
    const call: Call = {
      method: init.method ?? 'GET',
      path: parsed.pathname,
      query: parsed.search,
      headers,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
    }
    calls.push(call)
    const route = `${call.method} ${call.path}`
    const forced = routes.get(route)
    if (call.path.startsWith('/accounts/v1/')) {
      if (forced) return forced(call)
      if (route === 'POST /accounts/v1/sessions')
        return json(201, {
          ok: true,
          accountId: 'acct00000000000000001A',
          status: 'active',
          sessionId: 'sid-1',
          ...tokens(),
        })
      if (route === 'POST /accounts/v1/sessions/refresh')
        return json(200, { ok: true, ...tokens() })
      return refusal(404, 'not_found')
    }
    const token = headers.authorization?.replace(/^Bearer /, '')
    if (!token || !live.has(token))
      return refusal(401, 'unauthorized', undefined)
    if (forced) return forced(call)
    return refusal(404, 'not_found')
  }

  return {
    calls,
    /** Answer one route (`METHOD /path`). */
    on: (route: string, handler: Handler) => routes.set(route, handler),
    /** The server stops accepting every access token issued so far. */
    revokeAccessTokens: () => live.clear(),
    handle,
    callsTo: (route: string) =>
      calls.filter((call) => `${call.method} ${call.path}` === route),
  }
}

let worker: ReturnType<typeof fakeWorker>

const sse = (...frames: string[]) =>
  new Response(frames.join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })

const doneFrame = (summary: string, id = 2) =>
  `id: ${id}\ndata: ` +
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

const thinkingFrame = (id: number) =>
  `id: ${id}\ndata: {"type":"status","status":"thinking"}\n\n`

const context = {
  now: '2026-07-23T09:30:00-05:00',
  timeZone: 'America/Chicago',
  existingContacts: [],
  existingCategories: [],
}
const request = { notesText: 'private notes', context }

const credits = {
  remaining: 2,
  limit: 3,
  resetsAt: null,
  isSupporter: false,
  refinements: { remaining: 5, limit: 5 },
}

const IMPORT_ID = `imp_${'a'.repeat(40)}`
const NEXT_IMPORT_ID = `imp_${'b'.repeat(40)}`
const eventsRoute = (importId = IMPORT_ID) =>
  `GET /notes-import/${importId}/events`

/** Fields only per-request attestation and the old identity sent. */
const LEGACY_FIELDS = [
  'uuid',
  'accountId',
  'contentHash',
  'requestHash',
  'keyId',
  'challenge',
  'assertion',
  'protocolVersion',
  'operation',
  'operationId',
  'purpose',
  'attestationProvider',
  'integrityToken',
]

const pathOf = (url: string) => new URL(url).pathname

beforeEach(() => {
  worker = fakeWorker()
  harness.fetch = worker.handle
  harness.assert = async (request) =>
    request.submit({ kind: 'devBypass', token: 'dev-token' })
  harness.links = 0
  harness.support = 'supported'
  harness.checkSupport.calls = 0
  harness.upgradeRequired.calls = 0
  harness.hasAccountKey = false
  accountSessions.forget()
  vi.mocked(expoFetch).mockReset()
  // The stream reads the same worker, as a fetch Response.
  vi.mocked(expoFetch).mockImplementation(
    (url, init) =>
      worker.handle(String(url), init as RequestInit) as unknown as ReturnType<
        typeof expoFetch
      >
  )
  vi.mocked(perf.count).mockClear()
  worker.on('POST /notes-import/kickoff', () =>
    json(200, { importId: IMPORT_ID, refinement: false, credits })
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Notes Import on the account session: request shapes', () => {
  it('kicks off as the session with plain fields, then streams by bearer token', async () => {
    worker.on(eventsRoute(), () => sse(thinkingFrame(1), doneFrame('parsed')))
    const onKickoff = vi.fn()
    const onCredits = vi.fn()

    const response = await runNotesImportStreaming({
      ...request,
      onKickoff,
      onCredits,
    })

    expect(response.result.summary).toBe('parsed')
    // One attested session open, no per-import attestation.
    expect(worker.callsTo('POST /accounts/v1/sessions')).toHaveLength(1)
    expect(worker.calls.map((call) => call.path)).not.toContain(
      '/attestation/v1/challenge'
    )
    const [kickoff] = worker.callsTo('POST /notes-import/kickoff')
    expect(kickoff.headers.authorization).toBe('Bearer at-1')
    expect(kickoff.headers['x-ww-dev-bypass']).toBeUndefined()
    expect(kickoff.body).toEqual({
      notesText: 'private notes',
      context,
    })
    for (const field of LEGACY_FIELDS)
      expect(kickoff.body).not.toHaveProperty(field)
    expect(kickoff.body).not.toHaveProperty('revenueCatAppUserId')
    // Linked the RevenueCat customer first (ADR 0029).
    expect(harness.links).toBe(1)

    const [events] = worker.callsTo(eventsRoute())
    expect(events.query).toBe('')
    expect(events.headers.authorization).toBe('Bearer at-1')
    expect(events.headers.accept).toBe('text/event-stream')
    expect(events.headers['last-event-id']).toBeUndefined()
    // The handle carries no capability of its own.
    expect(onKickoff).toHaveBeenCalledWith({ importId: IMPORT_ID })
    expect(onCredits).toHaveBeenCalledWith(credits)
  })

  it('sends a refinement as it is', async () => {
    worker.on(eventsRoute(), () => sse(doneFrame('refined')))
    const refinement = { previousResultJSON: '{}', instruction: 'Add Ann' }
    await runNotesImportStreaming({ ...request, refinement })
    expect(worker.callsTo('POST /notes-import/kickoff')[0].body).toEqual({
      notesText: 'private notes',
      context,
      refinement,
    })
  })

  it('reads a page as the session', async () => {
    worker.on('POST /notes-import/transcribe', () =>
      json(200, {
        ok: true,
        text: 'page text',
        truncated: true,
        pagesRemaining: 9,
      })
    )
    const page = await transcribeNotesPage({
      image: 'base64-page',
      mimeType: 'image/jpeg',
    })
    expect(page).toEqual({ text: 'page text', truncated: true })
    const [call] = worker.callsTo('POST /notes-import/transcribe')
    expect(call.headers.authorization).toBe('Bearer at-1')
    expect(call.body).toEqual({
      image: 'base64-page',
      mimeType: 'image/jpeg',
    })
    expect(harness.links).toBe(1)
    for (const field of LEGACY_FIELDS)
      expect(call.body).not.toHaveProperty(field)
  })

  it('rejects a transcription without text', async () => {
    worker.on('POST /notes-import/transcribe', () => json(200, { ok: true }))
    await expect(
      transcribeNotesPage({ image: 'x', mimeType: 'image/jpeg' })
    ).rejects.toMatchObject({ code: 'unknown' })
  })

  it('runs the synchronous fallback as the session', async () => {
    worker.on('POST /notes-import', () =>
      json(200, {
        result: {
          contacts: [],
          visits: [],
          timeEntries: [],
          categories: [],
          publisher: null,
          warnings: [],
          summary: 'sync',
          assistantMessage: '',
        },
        contentHash: 'h',
        refinement: false,
        credits,
      })
    )
    const response = await requestNotesImport(request)
    expect(response).toMatchObject({
      result: { summary: 'sync' },
      emptyCharged: false,
      credits,
    })
    const [call] = worker.callsTo('POST /notes-import')
    expect(call.headers.authorization).toBe('Bearer at-1')
    expect(call.body).toEqual({
      notesText: 'private notes',
      context,
    })
    expect(harness.links).toBe(1)
  })

  it('reads a result snapshot by bearer token, with no token in the URL', async () => {
    worker.on(`GET /notes-import/${IMPORT_ID}/result`, () =>
      json(200, { status: 'thinking' })
    )
    await expect(fetchNotesImportResult(IMPORT_ID)).resolves.toMatchObject({
      status: 'thinking',
    })
    const [call] = worker.callsTo(`GET /notes-import/${IMPORT_ID}/result`)
    expect(call.query).toBe('')
    expect(call.headers.authorization).toBe('Bearer at-1')
  })

  it('destroys a run by bearer token and treats a 404 as already deleted', async () => {
    worker.on(`POST /notes-import/${IMPORT_ID}/destroy`, () =>
      json(200, { ok: true })
    )
    await destroyNotesImport({ importId: IMPORT_ID })
    const [call] = worker.callsTo(`POST /notes-import/${IMPORT_ID}/destroy`)
    expect(call.query).toBe('')
    expect(call.headers.authorization).toBe('Bearer at-1')

    worker.on(`POST /notes-import/${IMPORT_ID}/destroy`, () =>
      refusal(404, 'not_found')
    )
    await expect(
      destroyNotesImport({ importId: IMPORT_ID })
    ).resolves.toBeUndefined()
  })
})

describe('the account’s allowance', () => {
  const usage = {
    ok: true,
    accountStatus: 'active',
    supporter: false,
    supporterCheckFailed: false,
    imports: {
      limit: 3,
      used: 1,
      remaining: 2,
      resetsAt: '2026-11-17T12:00:00.000Z',
    },
    refinements: { limitPerImport: 5 },
    windowDays: 30,
  }

  it('reads it as the session this device already has', async () => {
    await accountSessions.ensure()
    worker.on('GET /notes-import/usage', () => json(200, usage))

    await expect(fetchNotesImportAccountUsage()).resolves.toMatchObject({
      imports: usage.imports,
      refinementsPerImport: 5,
    })
    const [read] = worker.callsTo('GET /notes-import/usage')
    expect(read.headers.authorization).toBe('Bearer at-1')
  })

  it('never creates an account key or attests on a device without one', async () => {
    worker.on('GET /notes-import/usage', () => json(200, usage))

    await expect(fetchNotesImportAccountUsage()).resolves.toBeNull()
    expect(worker.calls).toEqual([])
  })

  it('opens a session on a device that already has the account key', async () => {
    harness.hasAccountKey = true
    worker.on('GET /notes-import/usage', () => json(200, usage))

    await expect(fetchNotesImportAccountUsage()).resolves.toMatchObject({
      imports: usage.imports,
    })
    expect(worker.callsTo('POST /accounts/v1/sessions')).toHaveLength(1)
  })

  it('is unavailable from a server before the route, or a malformed answer', async () => {
    await accountSessions.ensure()
    worker.on('GET /notes-import/usage', () =>
      json(404, { ok: false, error: 'not_found', code: 'not_found' })
    )
    await expect(fetchNotesImportAccountUsage()).resolves.toBeNull()

    worker.on('GET /notes-import/usage', () =>
      json(200, { ...usage, imports: { limit: 3 } })
    )
    await expect(fetchNotesImportAccountUsage()).resolves.toBeNull()
  })
})

describe('Notes Import session tokens', () => {
  it('refreshes once and retries a kickoff whose token was refused', async () => {
    await accountSessions.ensure()
    worker.revokeAccessTokens()
    worker.on(eventsRoute(), () => sse(doneFrame('parsed')))

    await runNotesImportStreaming(request)

    const kickoffs = worker.callsTo('POST /notes-import/kickoff')
    expect(kickoffs.map((call) => call.headers.authorization)).toEqual([
      'Bearer at-1',
      'Bearer at-2',
    ])
    expect(worker.callsTo('POST /accounts/v1/sessions/refresh')).toHaveLength(1)
    expect(worker.callsTo('POST /accounts/v1/sessions')).toHaveLength(1)
  })

  it('reconnects the stream with a refreshed token after a 401', async () => {
    await accountSessions.ensure()
    worker.revokeAccessTokens()
    worker.on(eventsRoute(), () => sse(doneFrame('resumed')))

    const response = await resumeNotesImport({
      ...request,
      run: { importId: IMPORT_ID },
    })

    expect(response.result.summary).toBe('resumed')
    expect(
      worker.callsTo(eventsRoute()).map((call) => call.headers.authorization)
    ).toEqual(['Bearer at-1', 'Bearer at-2'])
    expect(worker.callsTo('POST /accounts/v1/sessions/refresh')).toHaveLength(1)
    expect(worker.callsTo('POST /notes-import/kickoff')).toHaveLength(0)
  })

  it('reconnects with a fresh token and the last event id once the old token is near expiry', async () => {
    vi.useFakeTimers()
    let connections = 0
    worker.on(eventsRoute(), () =>
      ++connections === 1
        ? sse(thinkingFrame(1), thinkingFrame(3))
        : sse(doneFrame('after reconnect', 4))
    )
    worker.on(`GET /notes-import/${IMPORT_ID}/result`, () => {
      // The run outlives this access token.
      harness.now += 14.5 * 60_000
      return json(200, { status: 'thinking' })
    })
    let resolved: unknown
    void runNotesImportStreaming(request).then((value) => {
      resolved = value
    })
    await vi.advanceTimersByTimeAsync(700)

    expect(resolved).toMatchObject({ result: { summary: 'after reconnect' } })
    const [first, second] = worker.callsTo(eventsRoute())
    expect(first.headers.authorization).toBe('Bearer at-1')
    expect(second.headers.authorization).toBe('Bearer at-2')
    expect(second.headers['last-event-id']).toBe('3')
    expect(second.query).toBe('')
    expect(worker.callsTo('POST /accounts/v1/sessions/refresh')).toHaveLength(1)
  })

  it('gives up after a refreshed token is refused as well', async () => {
    worker.on('POST /notes-import/kickoff', () => refusal(401, 'unauthorized'))
    await expect(runNotesImportStreaming(request)).rejects.toMatchObject({
      name: 'NotesImportClientError',
      code: 'attestation_failed',
      status: 401,
    })
    expect(worker.callsTo('POST /notes-import/kickoff')).toHaveLength(2)
  })
})

describe('Notes Import refusals on account sessions', () => {
  it('reports a suspended account without retrying', async () => {
    worker.on('POST /notes-import/kickoff', () => refusal(403, 'suspended'))
    await expect(runNotesImportStreaming(request)).rejects.toMatchObject({
      code: 'suspended',
      status: 403,
    })
    expect(worker.callsTo('POST /notes-import/kickoff')).toHaveLength(1)
  })

  it('reports a suspended account on a page read', async () => {
    worker.on('POST /notes-import/transcribe', () => refusal(403, 'suspended'))
    await expect(
      transcribeNotesPage({ image: 'x', mimeType: 'image/jpeg' })
    ).rejects.toMatchObject({ code: 'suspended' })
  })

  it('shows Update Required for a 426 on kickoff', async () => {
    worker.on('POST /notes-import/kickoff', () =>
      refusal(426, 'upgrade_required')
    )
    await expect(runNotesImportStreaming(request)).rejects.toMatchObject({
      code: 'upgrade_required',
    })
    expect(harness.upgradeRequired.calls).toBe(1)
  })

  it('shows Update Required for a 426 on the stream, without reconnecting', async () => {
    worker.on(eventsRoute(), () => refusal(426, 'upgrade_required'))
    await expect(runNotesImportStreaming(request)).rejects.toMatchObject({
      code: 'upgrade_required',
    })
    expect(harness.upgradeRequired.calls).toBe(1)
    expect(worker.callsTo(eventsRoute())).toHaveLength(1)
  })

  it('surfaces a run the account cannot read right after kickoff as not_found', async () => {
    worker.on(eventsRoute(), () => refusal(404, 'not_found'))
    await expect(runNotesImportStreaming(request)).rejects.toMatchObject({
      code: 'not_found',
    })
    expect(worker.callsTo(eventsRoute())).toHaveLength(1)
    expect(worker.callsTo('POST /notes-import/kickoff')).toHaveLength(1)
  })

  it('re-kicks off a resumed run that is gone or from before sessions', async () => {
    worker.on(eventsRoute(), () => refusal(404, 'not_found'))
    worker.on('POST /notes-import/kickoff', () =>
      json(200, { importId: NEXT_IMPORT_ID, refinement: false, credits })
    )
    worker.on(eventsRoute(NEXT_IMPORT_ID), () => sse(doneFrame('again')))
    const onKickoff = vi.fn()

    const response = await resumeNotesImport({
      ...request,
      run: { importId: IMPORT_ID },
      onKickoff,
    })

    expect(response.result.summary).toBe('again')
    expect(onKickoff).toHaveBeenCalledWith({ importId: NEXT_IMPORT_ID })
  })

  it('treats a 404 snapshot after a dropped stream as a run that is gone', async () => {
    worker.on(eventsRoute(), () => sse(thinkingFrame(1)))
    worker.on(`GET /notes-import/${IMPORT_ID}/result`, () =>
      refusal(404, 'not_found')
    )
    worker.on('POST /notes-import/kickoff', () =>
      json(200, { importId: NEXT_IMPORT_ID, refinement: false, credits })
    )
    worker.on(eventsRoute(NEXT_IMPORT_ID), () => sse(doneFrame('again')))

    const response = await resumeNotesImport({
      ...request,
      run: { importId: IMPORT_ID },
    })

    expect(response.result.summary).toBe('again')
    expect(worker.callsTo(eventsRoute())).toHaveLength(1)
  })

  it('passes allowance denials through with their credits', async () => {
    const spent = { ...credits, remaining: 0 }
    worker.on('POST /notes-import/kickoff', () =>
      refusal(402, 'limit_reached', { credits: spent })
    )
    await expect(runNotesImportStreaming(request)).rejects.toMatchObject({
      code: 'limit_reached',
      credits: spent,
    })
  })

  it.each([
    [503, 'server_error'],
    [503, 'disabled'],
    [429, 'rate_limited'],
    [502, undefined],
  ])('reads a %i %s as temporarily unavailable', async (status, code) => {
    worker.on('POST /notes-import/kickoff', () =>
      code
        ? refusal(status, code, { retryAfter: 30 })
        : new Response('bad gateway', { status })
    )
    const expected = code ? { retryAfterMs: 30_000 } : {}
    await expect(runNotesImportStreaming(request)).rejects.toMatchObject({
      code: 'unavailable',
      ...expected,
    })
  })

  it('keeps an unknown 4xx as unknown', async () => {
    worker.on('POST /notes-import/kickoff', () => refusal(418, 'teapot'))
    await expect(runNotesImportStreaming(request)).rejects.toMatchObject({
      code: 'unknown',
    })
  })
})

describe('Notes Import when the session cannot open', () => {
  it.each([
    ['unsupported', 'device_ineligible'],
    ['deviceIneligible', 'device_ineligible'],
    ['playServicesUnavailable', 'device_ineligible'],
    ['serverUnavailable', 'attestation_unavailable'],
    ['protocolUnavailable', 'attestation_unavailable'],
    ['authorizationFailed', 'attestation_failed'],
  ] as const)(
    'maps a device that fails with %s to %s, before any Notes Import route',
    async (attestationCode, code) => {
      harness.assert = async () => {
        throw new AttestationError(attestationCode)
      }
      await expect(runNotesImportStreaming(request)).rejects.toMatchObject({
        name: 'NotesImportClientError',
        code,
      })
      expect(
        worker.calls.filter((call) => call.path.startsWith('/notes-import'))
      ).toHaveLength(0)
    }
  )

  it('keeps the server’s reason for a refused attestation', async () => {
    worker.on('POST /accounts/v1/sessions', () =>
      refusal(403, 'attestation_failed', { reason: 'device_integrity_failed' })
    )
    await expect(runNotesImportStreaming(request)).rejects.toMatchObject({
      code: 'device_ineligible',
      reason: 'device_integrity_failed',
    })
  })

  it('reads accounts turned off on the server as unavailable', async () => {
    worker.on('POST /accounts/v1/sessions', () => refusal(503, 'disabled'))
    await expect(
      transcribeNotesPage({ image: 'x', mimeType: 'image/jpeg' })
    ).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('keeps cancellation distinct from a network failure', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      runNotesImportStreaming({ ...request, signal: controller.signal })
    ).rejects.toMatchObject({ code: 'cancelled', message: 'Import cancelled' })
  })
})

describe('Notes Import device verification for availability', () => {
  it('knows a device that can never attest without opening a session', async () => {
    harness.support = 'unsupported'
    vi.resetModules()
    const client = await import('@/features/notes-import/lib/notesImportClient')
    await expect(client.notesImportDeviceUnverified()).resolves.toBe(true)
    expect(worker.calls).toHaveLength(0)
  })

  it('asks the device once per launch, and again after an unknown answer', async () => {
    vi.resetModules()
    const client = await import('@/features/notes-import/lib/notesImportClient')
    harness.support = 'unknown'
    await expect(client.notesImportDeviceUnverified()).resolves.toBe(false)
    harness.support = 'supported'
    await expect(client.notesImportDeviceUnverified()).resolves.toBe(false)
    await expect(client.notesImportDeviceUnverified()).resolves.toBe(false)
    expect(harness.checkSupport.calls).toBe(2)
  })

  it('remembers a session refused for the device while it holds off', async () => {
    harness.assert = async () => {
      throw new AttestationError('deviceIneligible')
    }
    await expect(runNotesImportStreaming(request)).rejects.toMatchObject({
      code: 'device_ineligible',
    })
    await expect(notesImportDeviceUnverified()).resolves.toBe(true)
  })
})

describe('Notes Import terminal error safety', () => {
  it('normalizes an unrecognized stream error code', async () => {
    worker.on(eventsRoute(), () =>
      sse(
        'data: ' +
          JSON.stringify({
            type: 'error',
            code: 'private server text',
            message: 'failed',
          }) +
          '\n\n'
      )
    )
    await expect(
      resumeNotesImport({ ...request, run: { importId: IMPORT_ID } })
    ).rejects.toMatchObject({ code: 'unknown' })
  })

  it('normalizes an unrecognized snapshot error code', async () => {
    worker.on(eventsRoute(), () => sse())
    worker.on(`GET /notes-import/${IMPORT_ID}/result`, () =>
      json(200, {
        status: 'error',
        error: { code: 'private server text', message: 'failed' },
      })
    )
    await expect(
      resumeNotesImport({ ...request, run: { importId: IMPORT_ID } })
    ).rejects.toMatchObject({ code: 'unknown' })
    expect(
      worker.callsTo(`GET /notes-import/${IMPORT_ID}/result`)
    ).toHaveLength(1)
  })
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

describe('Notes Import SSE idle watchdog', () => {
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
    void consumeStream(IMPORT_ID, 'Bearer t', '0', vi.fn(), vi.fn()).then(
      (o) => {
        outcome = o
      }
    )
    await vi.advanceTimersByTimeAsync(SSE_IDLE_TIMEOUT_MS - 1)
    expect(outcome).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(outcome).toEqual({ kind: 'closed' })
    expect(perf.count).toHaveBeenCalledWith('notesImport:sseIdleAbort')
    const [url, init] = vi.mocked(expoFetch).mock.calls[0]
    expect(pathOf(String(url))).toBe(`/notes-import/${IMPORT_ID}/events`)
    expect(init?.signal?.aborted).toBe(true)
  })

  it('resets on every chunk, heartbeat comments included, and ignores them', async () => {
    vi.useFakeTimers()
    const stream = controlledBody()
    open(stream.body)
    const onEvent = vi.fn()
    const onCursor = vi.fn()
    let outcome: unknown
    void consumeStream(IMPORT_ID, 'Bearer t', '0', onEvent, onCursor).then(
      (o) => {
        outcome = o
      }
    )
    await vi.advanceTimersByTimeAsync(30_000)
    stream.push(': heartbeat\n\n')
    await vi.advanceTimersByTimeAsync(30_000)
    stream.push(': heartbeat\n\n')
    await vi.advanceTimersByTimeAsync(SSE_IDLE_TIMEOUT_MS - 1)
    expect(outcome).toBeUndefined()
    expect(onEvent).not.toHaveBeenCalled()
    expect(onCursor).not.toHaveBeenCalled()
    stream.push(doneFrame('after heartbeats'))
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
    void consumeStream(IMPORT_ID, 'Bearer t', '0', vi.fn(), vi.fn()).then(
      (o) => {
        outcome = o
      }
    )
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
      run: { importId: IMPORT_ID },
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
    worker.on(`GET /notes-import/${IMPORT_ID}/result`, () =>
      json(200, {
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
      })
    )
    let resolved: unknown
    void resumeNotesImport({
      ...request,
      run: { importId: IMPORT_ID },
    }).then((r) => {
      resolved = r
    })
    stream.push(thinkingFrame(1))
    await vi.advanceTimersByTimeAsync(SSE_IDLE_TIMEOUT_MS)
    expect(
      worker.callsTo(`GET /notes-import/${IMPORT_ID}/result`)
    ).toHaveLength(1)
    expect(resolved).toMatchObject({ result: { summary: 'from snapshot' } })
  })
})
