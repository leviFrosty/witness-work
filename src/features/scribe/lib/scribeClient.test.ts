import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/http/online', () => ({ isKnownOffline: () => false }))
vi.mock('@/lib/perf', () => ({ perf: { count: vi.fn() } }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

import {
  ACTIVE_CAP_DEFAULT_RETRY_MS,
  createScribeClient,
  frameData,
  parseStatus,
  STEP_DROP_RETRY_DELAYS_MS,
  STEP_IN_PROGRESS_RETRY_MS,
  type ScribeClientDeps,
} from '@/features/scribe/lib/scribeClient'
import { ScribeClientError } from '@/features/scribe/lib/errors'
import {
  DEFAULT_SCRIBE_LIMITS,
  SCRIBE_PROTOCOL,
  type StepRequest,
  type StepStreamEvent,
  type UsageSnapshotWire,
} from '@/features/scribe/lib/wire'
import type { ScribeErrorCode } from '@/features/scribe/types'
import {
  envelope,
  fakeFetch,
  fakeSessions,
  HEARTBEAT,
  jsonResponse,
  sseFrame,
  sseResponse,
  type FakeFetch,
  type FakeSessions,
  type Responder,
} from '@/features/scribe/lib/__fixtures__/sse'

const URLS = {
  status: 'https://api.test/scribe/v1/status',
  usage: 'https://api.test/scribe/v1/usage',
  step: 'https://api.test/scribe/v1/step',
  transcribe: 'https://api.test/scribe/v1/transcribe',
}

const BODY: StepRequest = {
  protocol: SCRIBE_PROTOCOL,
  conversationId: 'conv-1',
  turnId: 'turn-1',
  step: 0,
  app: { version: '3.0.0', platform: 'ios', locale: 'en-US' },
  tools: [],
  context: {
    v: 1,
    now: '2026-10-21T09:30:00-05:00',
    tz: 'America/Chicago',
    locale: 'en-US',
    weekStart: 0,
    clock: '12h',
    days: [],
    publisher: {
      role: 'publisher',
      entryMode: 'hours',
      showsTimeEntry: true,
      monthlyGoalMinutes: null,
      creditCapMinutes: null,
    },
    month: {
      month: '2026-10',
      loggedMinutes: 0,
      creditMinutes: 0,
      plannedRemainingMinutes: 0,
      studies: 0,
    },
    categories: ['k0 Standard'],
    plans: [],
    contacts: [],
    contactsTruncated: false,
    buddies: [],
    dataProtection: false,
  },
  messages: [
    {
      role: 'user',
      at: '2026-10-21T09:30:00-05:00',
      content: [{ type: 'text', text: 'Log an hour today' }],
    },
  ],
}

const METER: UsageSnapshotWire = {
  plan: 'free',
  supporterCheckFailed: false,
  windows: [{ id: 'monthly', percentUsed: 12, resetsAt: 1_800_000_000_000 }],
  limited: false,
  resetsAt: null,
  asOf: 1_790_000_000_000,
}

const START: StepStreamEvent = {
  type: 'start',
  offered: ['time_log'],
  dropped: [],
}
const TOOL_CALL: StepStreamEvent = {
  type: 'tool_call',
  callId: 'call_1',
  name: 'time_log',
  args: { date: '2026-10-21', minutes: 60 },
}
const DONE: StepStreamEvent = {
  type: 'done',
  finish: 'tool_calls',
  usage: {
    inputTokens: 3_000,
    cachedInputTokens: 2_000,
    cacheWriteTokens: 900,
    outputTokens: 120,
    reasoningTokens: 0,
    units: 1_500,
  },
  meter: METER,
}

interface Harness {
  client: ReturnType<typeof createScribeClient>
  stream: FakeFetch
  plain: FakeFetch
  sessions: FakeSessions
  sleeps: number[]
  links: { count: number }
}

function harness(
  options: {
    stream?: Responder[]
    plain?: Responder[]
    sessions?: FakeSessions
    idleTimeoutMs?: number
    link?: () => Promise<void>
  } = {}
): Harness {
  const stream = fakeFetch(...(options.stream ?? [new Error('no stream')]))
  const plain = fakeFetch(...(options.plain ?? [new Error('no request')]))
  const sessions = options.sessions ?? fakeSessions()
  const sleeps: number[] = []
  const links = { count: 0 }
  const deps: ScribeClientDeps = {
    urls: URLS,
    streamFetch: stream,
    fetchImpl: plain,
    sessions,
    linkBeforePaidCall:
      options.link ??
      (async () => {
        links.count++
      }),
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    idleTimeoutMs: options.idleTimeoutMs ?? 5_000,
  }
  return {
    client: createScribeClient(deps),
    stream,
    plain,
    sessions,
    sleeps,
    links,
  }
}

/** Runs a step and collects its events. */
async function runStep(h: Harness, signal?: AbortSignal) {
  const events: StepStreamEvent[] = []
  const terminal = await h.client.step(BODY, {
    signal,
    onEvent: (event) => events.push(event),
  })
  return { terminal, events }
}

const stepFailure = async (h: Harness): Promise<ScribeClientError> => {
  try {
    await runStep(h)
  } catch (error) {
    if (error instanceof ScribeClientError) return error
    throw error
  }
  throw new Error('expected the step to fail')
}

describe('step stream', () => {
  it('passes every event in order and resolves with done', async () => {
    const h = harness({
      stream: [
        sseResponse([
          START,
          { type: 'text', delta: 'Logging ' },
          { type: 'text', delta: 'an hour.' },
          TOOL_CALL,
          DONE,
        ]),
      ],
    })
    const { terminal, events } = await runStep(h)
    expect(terminal).toEqual(DONE)
    expect(events.map((event) => event.type)).toEqual([
      'start',
      'text',
      'text',
      'tool_call',
      'done',
    ])
    expect(events[3]).toEqual(TOOL_CALL)
    expect(h.stream.calls).toHaveLength(1)
  })

  it('posts the body with the bearer and SSE headers', async () => {
    const h = harness({ stream: [sseResponse([START, DONE])] })
    await runStep(h)
    const [call] = h.stream.calls
    expect(call.url).toBe(URLS.step)
    expect(call.method).toBe('POST')
    expect(call.headers).toMatchObject({
      authorization: 'Bearer token-1',
      accept: 'text/event-stream',
      'content-type': 'application/json',
    })
    expect(call.body).toEqual(BODY)
  })

  it('keeps several tool calls of one step', async () => {
    const second: StepStreamEvent = {
      type: 'tool_call',
      callId: 'call_2',
      name: 'plans_create',
      args: { date: '2026-10-22' },
    }
    const h = harness({
      stream: [sseResponse([START, TOOL_CALL, second, DONE])],
    })
    const { events } = await runStep(h)
    expect(events.filter((event) => event.type === 'tool_call')).toEqual([
      TOOL_CALL,
      second,
    ])
  })

  it('ignores unknown events, comments, malformed frames and bad calls', async () => {
    const h = harness({
      stream: [
        sseResponse([
          START,
          'event: reasoning\ndata: {"type":"reasoning","delta":"hm"}\n\n',
          HEARTBEAT,
          ': keep-alive\n\n',
          'data: {not json}\n\n',
          'event: tool_call\ndata: {"type":"tool_call","callId":"bad id!","name":"x","args":{}}\n\n',
          'event: tool_call\ndata: {"type":"tool_call","callId":"call_9","name":"x","args":[]}\n\n',
          { type: 'text', delta: 'ok' },
          DONE,
        ]),
      ],
    })
    const { events } = await runStep(h)
    expect(events.map((event) => event.type)).toEqual(['start', 'text', 'done'])
  })

  it('reads frames split across reads and CRLF line ends', async () => {
    const h = harness({
      stream: [
        sseResponse([START, { type: 'text', delta: 'Hello there' }, DONE], {
          chunkSize: 7,
          crlf: true,
        }),
      ],
    })
    const { terminal, events } = await runStep(h)
    expect(events.map((event) => event.type)).toEqual(['start', 'text', 'done'])
    expect(events[1]).toEqual({ type: 'text', delta: 'Hello there' })
    expect(terminal.type).toBe('done')
  })

  it('resolves with an error event and its meter', async () => {
    const h = harness({
      stream: [
        sseResponse([
          START,
          {
            type: 'error',
            code: 'model_timeout',
            message: 'timed out',
            retryable: true,
            meter: METER,
          },
        ]),
      ],
    })
    const { terminal } = await runStep(h)
    expect(terminal).toEqual({
      type: 'error',
      code: 'model_timeout',
      message: 'timed out',
      retryable: true,
      meter: METER,
    })
    expect(h.stream.calls).toHaveLength(1)
  })

  it('normalizes a done event with missing usage fields', async () => {
    const h = harness({
      stream: [
        sseResponse([
          START,
          'event: done\ndata: {"type":"done","finish":"end","usage":{"inputTokens":42},"meter":null}\n\n',
        ]),
      ],
    })
    const { terminal } = await runStep(h)
    expect(terminal).toEqual({
      type: 'done',
      finish: 'end',
      usage: {
        inputTokens: 42,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        units: 0,
      },
      meter: null,
    })
  })
})

describe('dropped streams', () => {
  it('resends the identical body after 1 s and 3 s', async () => {
    const h = harness({
      stream: [
        sseResponse([START, { type: 'text', delta: 'par' }]),
        sseResponse([START]),
        sseResponse([START, DONE]),
      ],
    })
    const { terminal } = await runStep(h)
    expect(terminal).toEqual(DONE)
    expect(h.sleeps).toEqual([...STEP_DROP_RETRY_DELAYS_MS])
    expect(h.stream.calls).toHaveLength(3)
    for (const call of h.stream.calls) expect(call.body).toEqual(BODY)
  })

  it('gives up after two resends', async () => {
    const h = harness({ stream: [() => sseResponse([START])] })
    const failure = await stepFailure(h)
    expect(failure.code).toBe('network')
    expect(h.stream.calls).toHaveLength(3)
    expect(h.sleeps).toEqual([1_000, 3_000])
  })

  it('treats a connection dropped mid-stream like an early end', async () => {
    let attempts = 0
    const h = harness({
      stream: [
        () => {
          attempts++
          if (attempts > 1) return sseResponse([START, DONE])
          const encoder = new TextEncoder()
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encoder.encode(sseFrame(START)))
              controller.error(new TypeError('Network connection was lost'))
            },
          })
          return new Response(body, { status: 200 })
        },
      ],
    })
    const { terminal } = await runStep(h)
    expect(terminal).toEqual(DONE)
    expect(h.sleeps).toEqual([1_000])
  })

  it('is a connection problem when no response came at all', async () => {
    const h = harness({ stream: [new TypeError('Network request failed')] })
    const failure = await stepFailure(h)
    expect(failure.code).toBe('network')
    expect(h.stream.calls).toHaveLength(1)
  })

  it('keeps a stream alive while heartbeats arrive', async () => {
    const h = harness({
      idleTimeoutMs: 60,
      stream: [
        sseResponse([
          START,
          { wait: 35 },
          HEARTBEAT,
          { wait: 35 },
          HEARTBEAT,
          { wait: 35 },
          DONE,
        ]),
      ],
    })
    const { terminal } = await runStep(h)
    expect(terminal).toEqual(DONE)
    expect(h.stream.calls).toHaveLength(1)
    expect(h.sleeps).toEqual([])
  })

  it('drops a silent stream at the idle watchdog and resends', async () => {
    const h = harness({
      idleTimeoutMs: 30,
      stream: [
        (request) =>
          sseResponse([START], { end: 'stall', signal: request.signal }),
        sseResponse([START, DONE]),
      ],
    })
    const { terminal } = await runStep(h)
    expect(terminal).toEqual(DONE)
    expect(h.stream.calls).toHaveLength(2)
    expect(h.stream.calls[0].signal?.aborted).toBe(true)
    expect(h.sleeps).toEqual([1_000])
  })

  it('drops a request that never answers at the idle watchdog', async () => {
    const h = harness({
      idleTimeoutMs: 30,
      stream: [
        (request) =>
          new Promise<Response>((_, reject) => {
            request.signal?.addEventListener('abort', () =>
              reject(
                Object.assign(new Error('aborted'), { name: 'AbortError' })
              )
            )
          }),
        sseResponse([START, DONE]),
      ],
    })
    const { terminal } = await runStep(h)
    expect(terminal).toEqual(DONE)
    expect(h.stream.calls).toHaveLength(2)
  })
})

describe('refusals', () => {
  const usageBody = { ...METER, limited: true, resetsAt: 1_793_836_800_000 }

  const cases: {
    status: number
    code: string
    expected: ScribeErrorCode
    calls: number
    extra?: Record<string, unknown>
    headers?: Record<string, string>
    retryAfterMs?: number | null
  }[] = [
    { status: 400, code: 'bad_request', expected: 'unknown', calls: 1 },
    { status: 400, code: 'invalid_tools', expected: 'unknown', calls: 1 },
    { status: 400, code: 'step_limit', expected: 'couldnt_finish', calls: 1 },
    // The session refreshes once on a 401 and runs again.
    {
      status: 401,
      code: 'unauthorized',
      expected: 'attestation_unavailable',
      calls: 2,
    },
    {
      status: 402,
      code: 'limit_reached',
      expected: 'limit_reached',
      calls: 1,
      extra: { retryAfter: 5_400, usage: usageBody },
      headers: { 'retry-after': '5400' },
      retryAfterMs: 5_400_000,
    },
    { status: 403, code: 'suspended', expected: 'suspended', calls: 1 },
    // Waits 2 s and retries once.
    {
      status: 409,
      code: 'step_in_progress',
      expected: 'unavailable',
      calls: 2,
    },
    { status: 409, code: 'step_retry_limit', expected: 'unknown', calls: 1 },
    { status: 413, code: 'too_large', expected: 'too_large', calls: 1 },
    { status: 413, code: 'context_full', expected: 'context_full', calls: 1 },
    {
      status: 426,
      code: 'upgrade_required',
      expected: 'update_required',
      calls: 1,
    },
    {
      status: 429,
      code: 'rate_limited',
      expected: 'rate_limited',
      calls: 1,
      extra: { retryAfter: 30 },
      retryAfterMs: 30_000,
    },
    // Waits retryAfter and retries once.
    {
      status: 429,
      code: 'active_cap',
      expected: 'rate_limited',
      calls: 2,
      extra: { retryAfter: 4 },
      headers: { 'retry-after': '4' },
      retryAfterMs: 4_000,
    },
    {
      status: 429,
      code: 'transcribe_limit',
      expected: 'rate_limited',
      calls: 1,
      extra: { retryAfter: 600 },
      retryAfterMs: 600_000,
    },
    { status: 500, code: 'server_error', expected: 'unavailable', calls: 1 },
    { status: 502, code: 'model_error', expected: 'model_error', calls: 1 },
    { status: 503, code: 'disabled', expected: 'disabled', calls: 1 },
    {
      status: 503,
      code: 'unavailable',
      expected: 'unavailable',
      calls: 1,
      extra: { retryAfter: 60 },
      retryAfterMs: 60_000,
    },
  ]

  it.each(cases)(
    '$status $code → $expected',
    async ({ status, code, expected, calls, extra, headers, retryAfterMs }) => {
      const h = harness({
        stream: [() => jsonResponse(status, envelope(code, extra), headers)],
      })
      const failure = await stepFailure(h)
      expect(failure.code).toBe(expected)
      expect(failure.serverCode).toBe(code)
      expect(failure.status).toBe(status)
      expect(failure.retryAfterMs).toBe(retryAfterMs ?? null)
      expect(h.stream.calls).toHaveLength(calls)
      if (code === 'limit_reached') expect(failure.usage).toEqual(usageBody)
      else expect(failure.usage).toBeNull()
    }
  )

  it('waits 2 s once for a step still in progress, then runs', async () => {
    const h = harness({
      stream: [
        jsonResponse(409, envelope('step_in_progress')),
        sseResponse([START, DONE]),
      ],
    })
    const { terminal } = await runStep(h)
    expect(terminal).toEqual(DONE)
    expect(h.sleeps).toEqual([STEP_IN_PROGRESS_RETRY_MS])
  })

  it('waits retryAfter once at the active-step cap, 5 s without one', async () => {
    const withHeader = harness({
      stream: [
        jsonResponse(429, envelope('active_cap', { retryAfter: 3 }), {
          'retry-after': '3',
        }),
        sseResponse([START, DONE]),
      ],
    })
    await runStep(withHeader)
    expect(withHeader.sleeps).toEqual([3_000])

    const without = harness({
      stream: [
        jsonResponse(429, envelope('active_cap')),
        sseResponse([START, DONE]),
      ],
    })
    await runStep(without)
    expect(without.sleeps).toEqual([ACTIVE_CAP_DEFAULT_RETRY_MS])
  })

  it('reads a non-JSON refusal by its status', async () => {
    const h = harness({
      stream: [() => new Response('Bad gateway', { status: 502 })],
    })
    const failure = await stepFailure(h)
    expect(failure).toMatchObject({
      code: 'unavailable',
      serverCode: null,
      status: 502,
    })
  })
})

describe('sessions', () => {
  it('refreshes once on a 401 and runs with the new bearer', async () => {
    const h = harness({
      stream: [
        jsonResponse(401, envelope('unauthorized')),
        sseResponse([START, DONE]),
      ],
    })
    const { terminal } = await runStep(h)
    expect(terminal).toEqual(DONE)
    expect(h.sessions.refreshes).toBe(1)
    expect(h.sessions.authorizations).toEqual([
      'Bearer token-1',
      'Bearer token-2',
    ])
    expect(h.stream.calls.map((call) => call.headers.authorization)).toEqual([
      'Bearer token-1',
      'Bearer token-2',
    ])
  })

  it('links the RevenueCat customer once, before the first paid call', async () => {
    const order: string[] = []
    let links = 0
    const stream = fakeFetch(() => {
      order.push('step')
      return sseResponse([START, DONE])
    })
    const client = createScribeClient({
      urls: URLS,
      streamFetch: stream,
      fetchImpl: fakeFetch(() =>
        jsonResponse(200, {
          ok: true,
          text: 'page',
          truncated: false,
          usage: null,
        })
      ),
      sessions: fakeSessions(),
      linkBeforePaidCall: async () => {
        links++
        order.push('link')
      },
      sleep: async () => {},
    })
    await client.step(BODY, { onEvent: () => {} })
    await client.step(BODY, { onEvent: () => {} })
    await client.transcribe({ image: 'aGk=', mimeType: 'image/jpeg' })
    expect(links).toBe(1)
    expect(order.slice(0, 2)).toEqual(['link', 'step'])
  })

  it('never holds a call up when linking fails', async () => {
    const h = harness({
      stream: [sseResponse([START, DONE])],
      link: async () => {
        throw new Error('RevenueCat down')
      },
    })
    const { terminal } = await runStep(h)
    expect(terminal).toEqual(DONE)
  })

  it('passes a session failure through as a client error', async () => {
    const h = harness({
      sessions: fakeSessions({
        fail: new ScribeClientError('device_ineligible'),
      }),
    })
    const failure = await stepFailure(h)
    expect(failure.code).toBe('device_ineligible')
    expect(h.stream.calls).toHaveLength(0)
  })
})

describe('cancelling', () => {
  it('is cancelled when the caller aborts mid-stream', async () => {
    const controller = new AbortController()
    const h = harness({
      stream: [
        (request) => {
          setTimeout(() => controller.abort(), 10)
          return sseResponse([START], { end: 'stall', signal: request.signal })
        },
      ],
    })
    await expect(runStep(h, controller.signal)).rejects.toMatchObject({
      code: 'cancelled',
    })
    expect(h.stream.calls[0].signal?.aborted).toBe(true)
    expect(h.sleeps).toEqual([])
  })

  it('sends nothing for an already aborted call', async () => {
    const controller = new AbortController()
    controller.abort()
    const h = harness({ stream: [sseResponse([START, DONE])] })
    await expect(runStep(h, controller.signal)).rejects.toMatchObject({
      code: 'cancelled',
    })
    expect(h.stream.calls).toHaveLength(0)
  })
})

describe('status', () => {
  it('reads without a session and fills the protocol defaults', async () => {
    const h = harness({ plain: [jsonResponse(200, { ok: true })] })
    const status = await h.client.status()
    expect(status).toEqual({
      enabled: true,
      reason: null,
      protocol: { min: 1, max: 1 },
      minAppVersion: null,
      disabledTools: [],
      limits: DEFAULT_SCRIBE_LIMITS,
    })
    expect(h.plain.calls[0].url).toBe(URLS.status)
    expect(h.plain.calls[0].headers.authorization).toBeUndefined()
    expect(h.sessions.authorizations).toEqual([])
  })

  it('is off only for an explicit false, and keeps known limits', async () => {
    expect(parseStatus({ enabled: 'no' }).enabled).toBe(true)
    const status = parseStatus({
      enabled: false,
      reason: 'no_provider',
      protocol: { min: 1, max: 2 },
      minAppVersion: '3.1.0',
      disabledTools: ['visits_read_notes', 7],
      limits: { maxInputTokens: 32_000, maxStepsPerTurn: 'x', transcribe: {} },
    })
    expect(status).toMatchObject({
      enabled: false,
      reason: 'no_provider',
      protocol: { min: 1, max: 2 },
      minAppVersion: '3.1.0',
      disabledTools: ['visits_read_notes'],
    })
    expect(status.limits).toEqual({
      ...DEFAULT_SCRIBE_LIMITS,
      maxInputTokens: 32_000,
    })
    expect(parseStatus({ reason: 'other' }).reason).toBeNull()
  })

  it('throws a client error when it can’t be read', async () => {
    const offline = harness({
      plain: [new TypeError('Network request failed')],
    })
    await expect(offline.client.status()).rejects.toMatchObject({
      code: 'network',
    })
    const down = harness({
      plain: [jsonResponse(503, envelope('unavailable'))],
    })
    await expect(down.client.status()).rejects.toMatchObject({
      code: 'unavailable',
      status: 503,
    })
  })
})

describe('usage', () => {
  it('reads the snapshot with the bearer', async () => {
    const h = harness({ plain: [jsonResponse(200, { ok: true, ...METER })] })
    await expect(h.client.usage()).resolves.toEqual(METER)
    expect(h.plain.calls[0]).toMatchObject({
      url: URLS.usage,
      method: 'GET',
      headers: { authorization: 'Bearer token-1' },
    })
    // Read-only: never links or charges.
    expect(h.links.count).toBe(0)
  })

  it('is unknown when the body isn’t a snapshot', async () => {
    const h = harness({
      plain: [jsonResponse(200, { ok: true, plan: 'gold' })],
    })
    await expect(h.client.usage()).rejects.toMatchObject({ code: 'unknown' })
  })
})

describe('transcribe', () => {
  it('posts protocol 1 with the page and reads text, truncated and usage', async () => {
    const h = harness({
      plain: [
        jsonResponse(200, {
          ok: true,
          text: 'Maria · 12 Oak St',
          truncated: true,
          usage: METER,
        }),
      ],
    })
    const result = await h.client.transcribe({
      image: 'aGVsbG8=',
      mimeType: 'image/jpeg',
    })
    expect(result).toEqual({
      text: 'Maria · 12 Oak St',
      truncated: true,
      usage: METER,
    })
    expect(h.plain.calls[0]).toMatchObject({
      url: URLS.transcribe,
      method: 'POST',
      headers: { authorization: 'Bearer token-1' },
      body: { protocol: 1, image: 'aGVsbG8=', mimeType: 'image/jpeg' },
    })
  })

  it('maps the page ceiling with its wait', async () => {
    const h = harness({
      plain: [
        jsonResponse(429, envelope('transcribe_limit', { retryAfter: 900 }), {
          'retry-after': '900',
        }),
      ],
    })
    await expect(
      h.client.transcribe({ image: 'aGk=', mimeType: 'image/png' })
    ).rejects.toMatchObject({
      code: 'rate_limited',
      serverCode: 'transcribe_limit',
      retryAfterMs: 900_000,
    })
  })

  it('is unknown without text', async () => {
    const h = harness({ plain: [jsonResponse(200, { ok: true })] })
    await expect(
      h.client.transcribe({ image: 'aGk=', mimeType: 'image/png' })
    ).rejects.toMatchObject({ code: 'unknown' })
  })
})

describe('frameData', () => {
  it('joins data lines and skips comments and event lines', () => {
    expect(frameData('event: text\ndata: {"a":1}')).toBe('{"a":1}')
    expect(frameData('data:one\ndata: two')).toBe('one\ntwo')
    expect(frameData(': heartbeat')).toBeNull()
  })
})
