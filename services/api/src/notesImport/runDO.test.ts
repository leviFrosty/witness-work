import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreditsSnapshot } from '../credits'
import type { Environment } from '../types'
import type { StartImportInput } from './runDO'

const mocks = vi.hoisted(() => ({
  runModel: vi.fn(),
  resolveTerminalSupporter: vi.fn(),
  capture: vi.fn(async () => undefined),
}))

vi.mock('../analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../analytics')>()),
  captureAnalyticsEvent: mocks.capture,
}))

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

vi.mock('./llm', () => ({ runNotesImportModel: mocks.runModel }))
vi.mock('./settlement', () => ({
  resolveTerminalSupporter: mocks.resolveTerminalSupporter,
}))

const EMPTY_RESULT = {
  contacts: [],
  visits: [],
  timeEntries: [],
  categories: [],
  publisher: null,
  warnings: [],
  summary: 'No records',
  assistantMessage: '',
}

const CREDITS: CreditsSnapshot = {
  remaining: 4,
  limit: 5,
  resetsAt: '2026-07-31T00:00:00.000Z',
  isSupporter: false,
  refinements: { remaining: 5, limit: 5 },
}

const INPUT: StartImportInput = {
  importId: 'imp_test',
  uuid: 'meter-id',
  contentHash: 'a'.repeat(64),
  notesText: 'notes',
  context: {
    now: '2026-07-01T00:00:00Z',
    timeZone: 'UTC',
    existingContacts: [],
    existingCategories: [],
  },
  isSupporter: false,
  devBypass: false,
  decision: {
    allowed: true,
    isNewHash: true,
    isRefinement: false,
    remaining: 4,
  },
}

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const cursor = <T>(rows: T[]) => ({
  toArray: () => rows,
  one: () => rows[0],
})

interface FakeRunState {
  meta: Map<string, string>
  events: Array<{ seq: number; type: string; data: string }>
  alarms: number[]
  /** Whether `meta` and `events` exist (created on the first write). */
  tables: boolean
}

const fakeContext = (state: FakeRunState): DurableObjectState =>
  ({
    id: { toString: () => 'opaque-run-id' },
    storage: {
      sql: {
        exec: (query: string, ...args: unknown[]) => {
          if (query.startsWith('CREATE TABLE')) {
            state.tables = true
            return cursor([])
          }
          if (query.startsWith('SELECT name FROM sqlite_master')) {
            return cursor(state.tables ? [{ name: 'meta' }] : [])
          }
          // Like SQLite: deleteAll() drops the tables with the rows.
          if (!state.tables) throw new Error('no such table')
          if (query === 'DELETE FROM events') {
            state.events = []
            return cursor([])
          }
          if (query === 'SELECT v FROM meta WHERE k = ?') {
            const value = state.meta.get(String(args[0]))
            return cursor(value == null ? [] : [{ v: value }])
          }
          if (query.startsWith('INSERT OR REPLACE INTO meta')) {
            state.meta.set(String(args[0]), String(args[1]))
            return cursor([])
          }
          if (query === 'DELETE FROM meta WHERE k = ?') {
            state.meta.delete(String(args[0]))
            return cursor([])
          }
          if (query.startsWith('SELECT seq, data FROM events WHERE seq > ?')) {
            return cursor(
              state.events
                .filter((event) => event.seq > Number(args[0]))
                .map(({ seq, data }) => ({ seq, data }))
            )
          }
          if (query.startsWith('INSERT INTO events')) {
            const seq = state.events.length + 1
            state.events.push({
              seq,
              type: String(args[0]),
              data: String(args[1]),
            })
            return cursor([{ seq }])
          }
          throw new Error(`Unexpected SQL in test: ${query}`)
        },
      },
      setAlarm: vi.fn(async (at: number) => {
        state.alarms.push(at)
      }),
      deleteAll: vi.fn(async () => {
        state.meta.clear()
        state.events = []
        state.tables = false
      }),
    },
    waitUntil: vi.fn(),
  }) as unknown as DurableObjectState

const makeRun = async (
  recordUsage: ReturnType<typeof vi.fn>,
  extraEnv: Partial<Environment> = {}
) => {
  const state: FakeRunState = {
    meta: new Map(),
    events: [],
    alarms: [],
    tables: false,
  }
  const index = {
    recordUsage,
    release: vi.fn(async () => undefined),
  }
  const env = {
    APP_ATTEST_ENVIRONMENT: 'production',
    OPENROUTER_API_KEY: 'openrouter-key',
    REVENUECAT_API_KEY: 'revenuecat-key',
    NOTES_KV: { get: vi.fn(async () => null) },
    NOTES_IMPORT_INDEX: {
      idFromName: vi.fn(() => ({ toString: () => 'index-id' })),
      get: vi.fn(() => index),
    },
    ...extraEnv,
  } as unknown as Environment
  const { NotesImportRun } = await import('./runDO')
  return { run: new NotesImportRun(fakeContext(state), env), state, index }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.runModel.mockResolvedValue({
    result: EMPTY_RESULT,
    usage: { reasoningTokens: 0 },
    resolvedProvider: 'test-provider',
  })
})

describe('NotesImportRun cancellation and destruction settlement', () => {
  it('lets cancellation during terminal refresh win without charging', async () => {
    const refresh = deferred<boolean>()
    mocks.resolveTerminalSupporter.mockReturnValue(refresh.promise)
    const recordUsage = vi.fn()
    const { run, state } = await makeRun(recordUsage)
    await run.start(INPUT)

    const alarm = run.alarm()
    await vi.waitFor(() =>
      expect(mocks.resolveTerminalSupporter).toHaveBeenCalledOnce()
    )

    await expect(run.cancel()).resolves.toEqual({ status: 'cancelled' })
    refresh.resolve(false)
    await alarm

    expect(recordUsage).not.toHaveBeenCalled()
    expect(run.getResult()).toEqual({ status: 'cancelled' })
    expect(state.events.map((event) => event.type)).toContain('cancelled')
    expect(state.events.map((event) => event.type)).not.toContain('done')
  })

  it('serializes cancellation behind an in-flight index settlement RPC', async () => {
    mocks.resolveTerminalSupporter.mockResolvedValue(false)
    const usage = deferred<{ credits: CreditsSnapshot; emptyCharged: boolean }>()
    const recordUsage = vi.fn(() => usage.promise)
    const { run, state } = await makeRun(recordUsage)
    await run.start(INPUT)

    const alarm = run.alarm()
    await vi.waitFor(() => expect(recordUsage).toHaveBeenCalledOnce())

    let cancelSettled = false
    const cancellation = run.cancel().finally(() => {
      cancelSettled = true
    })
    await Promise.resolve()
    expect(cancelSettled).toBe(false)
    expect(run.getResult().status).not.toBe('cancelled')

    usage.resolve({ credits: CREDITS, emptyCharged: false })
    await alarm
    await expect(cancellation).resolves.toMatchObject({
      status: 'done',
      payload: { credits: CREDITS },
    })

    expect(recordUsage).toHaveBeenCalledOnce()
    expect(state.events.map((event) => event.type)).toContain('done')
    expect(state.events.map((event) => event.type)).not.toContain('cancelled')
  })

  it('lets destruction before settlement win without a usage or terminal write', async () => {
    const refresh = deferred<boolean>()
    mocks.resolveTerminalSupporter.mockReturnValue(refresh.promise)
    const recordUsage = vi.fn()
    const { run, state } = await makeRun(recordUsage)
    await run.start(INPUT)

    const alarm = run.alarm()
    await vi.waitFor(() =>
      expect(mocks.resolveTerminalSupporter).toHaveBeenCalledOnce()
    )

    await run.destroy()
    refresh.resolve(false)
    await alarm

    expect(recordUsage).not.toHaveBeenCalled()
    expect(run.getResult()).toEqual({ status: null })
    expect(state.meta.size).toBe(0)
    expect(state.events).toEqual([])
  })

  it('waits for deferred usage settlement before destroying terminal state', async () => {
    mocks.resolveTerminalSupporter.mockResolvedValue(false)
    const usage = deferred<{ credits: CreditsSnapshot; emptyCharged: boolean }>()
    const recordUsage = vi.fn(() => usage.promise)
    const { run, state } = await makeRun(recordUsage)
    await run.start(INPUT)

    const alarm = run.alarm()
    await vi.waitFor(() => expect(recordUsage).toHaveBeenCalledOnce())

    let destroySettled = false
    const destruction = run.destroy().finally(() => {
      destroySettled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(destroySettled).toBe(false)

    usage.resolve({ credits: CREDITS, emptyCharged: false })
    await Promise.all([alarm, destruction])

    expect(recordUsage).toHaveBeenCalledOnce()
    expect(run.getResult()).toEqual({ status: null })
    expect(state.meta.size).toBe(0)
    expect(state.events).toEqual([])
  })
})

describe('NotesImportRun storage', () => {
  it('stores nothing when asked about an import that never started', async () => {
    const { run, state } = await makeRun(vi.fn())
    expect(run.getResult()).toEqual({ status: null })
    await expect(run.cancel()).resolves.toEqual({ status: null })
    await run.alarm()
    expect(state.tables).toBe(false)
  })

  it('starts the same import again on the instance that destroyed it', async () => {
    const recordUsage = vi.fn(async () => ({
      credits: CREDITS,
      emptyCharged: false,
    }))
    mocks.resolveTerminalSupporter.mockResolvedValue(false)
    const { run, state } = await makeRun(recordUsage)
    await run.start(INPUT)
    await run.destroy()
    expect(state.tables).toBe(false)

    await expect(run.start(INPUT)).resolves.toBe('started')
    await run.alarm()
    expect(run.getResult()).toMatchObject({ status: 'done' })
  })

  it('starts again after the retention alarm wiped a finished run', async () => {
    const recordUsage = vi.fn(async () => ({
      credits: CREDITS,
      emptyCharged: false,
    }))
    mocks.resolveTerminalSupporter.mockResolvedValue(false)
    const { run } = await makeRun(recordUsage)
    await run.start(INPUT)
    await run.alarm()
    await run.alarm()
    expect(run.getResult()).toEqual({ status: null })

    await expect(run.start(INPUT)).resolves.toBe('started')
  })
})

describe('NotesImportRun analytics', () => {
  const TRACKED = { POSTHOG_PROJECT_TOKEN: 'phc_test' }
  const ANALYTICS = {
    distinctId: 'ww_test',
    platform: 'ios' as const,
    transport: 'stream' as const,
    refinement: false,
    supporter: false,
    hasAccount: true,
    notesChars: 5,
    startedAt: Date.now(),
  }
  const TRACKED_INPUT: StartImportInput = { ...INPUT, analytics: ANALYTICS }
  const finishedEvents = () =>
    (mocks.capture.mock.calls as unknown as Array<[unknown, { event: string; properties: Record<string, unknown> }]>)
      .map(([, event]) => event)
      .filter((event) => event.event === 'api_notes_import_finished')

  it('reports a successful run with structural counts and token usage', async () => {
    mocks.resolveTerminalSupporter.mockResolvedValue(false)
    mocks.runModel.mockResolvedValue({
      result: {
        ...EMPTY_RESULT,
        contacts: [{ tempId: 'c1', name: 'Ana' }],
        visits: [{ date: '2026-07-01', isBibleStudy: false }],
      },
      usage: { inputTokens: 900, outputTokens: 300, reasoningTokens: 120 },
      resolvedProvider: 'fireworks',
    })
    const recordUsage = vi.fn(async () => ({ credits: CREDITS, emptyCharged: false }))
    const { run } = await makeRun(recordUsage, TRACKED)
    await run.start(TRACKED_INPUT)
    await run.alarm()

    const events = finishedEvents()
    expect(events).toHaveLength(1)
    expect(events[0].properties).toMatchObject({
      outcome: 'success',
      platform: 'ios',
      empty: false,
      empty_charged: false,
      contacts: 1,
      visits: 1,
      time_entries: 0,
      publisher_detected: false,
      imports_remaining: 4,
      provider: 'fireworks',
      input_tokens: 900,
      output_tokens: 300,
      reasoning_tokens: 120,
    })
    expect(events[0].properties.duration_ms).toEqual(expect.any(Number))
    // Never the notes, the model output's text, or ids.
    expect(JSON.stringify(events[0])).not.toContain('Ana')
    expect(JSON.stringify(events[0])).not.toContain('meter-id')
  })

  it('reports a model error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.runModel.mockRejectedValue(new Error('provider down'))
    const { run } = await makeRun(vi.fn(), TRACKED)
    await run.start(TRACKED_INPUT)
    await run.alarm()
    error.mockRestore()

    expect(finishedEvents().map((e) => e.properties.outcome)).toEqual([
      'model_error',
    ])
  })

  it('reports a cancelled run once', async () => {
    const refresh = deferred<boolean>()
    mocks.resolveTerminalSupporter.mockReturnValue(refresh.promise)
    const { run } = await makeRun(vi.fn(), TRACKED)
    await run.start(TRACKED_INPUT)

    const alarm = run.alarm()
    await vi.waitFor(() =>
      expect(mocks.resolveTerminalSupporter).toHaveBeenCalledOnce()
    )
    await run.cancel()
    refresh.resolve(false)
    await alarm

    expect(finishedEvents().map((e) => e.properties.outcome)).toEqual([
      'cancelled',
    ])
  })

  it('reports a run interrupted by eviction', async () => {
    const { run, state } = await makeRun(vi.fn(), TRACKED)
    await run.start(TRACKED_INPUT)
    state.meta.set('status', 'thinking')
    await run.alarm()

    expect(finishedEvents().map((e) => e.properties.outcome)).toEqual([
      'interrupted',
    ])
    expect(mocks.runModel).not.toHaveBeenCalled()
  })

  it('stays silent for runs started before analytics shipped', async () => {
    mocks.resolveTerminalSupporter.mockResolvedValue(false)
    const recordUsage = vi.fn(async () => ({ credits: CREDITS, emptyCharged: false }))
    const { run } = await makeRun(recordUsage, TRACKED)
    await run.start(INPUT)
    await run.alarm()

    expect(mocks.capture).not.toHaveBeenCalled()
  })
})

describe('NotesImportRun SSE heartbeat', () => {
  const decoder = new TextDecoder()
  const subscribe = async (run: { fetch(request: Request): Promise<Response> }) => {
    const response = await run.fetch(new Request('https://do/events'))
    return response.body!.getReader()
  }
  const text = async (
    reader: ReadableStreamDefaultReader<Uint8Array>
  ): Promise<string | null> => {
    const { value, done } = await reader.read()
    return done ? null : decoder.decode(value)
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends an SSE comment every 15 s while the run is live, then stops', async () => {
    vi.useFakeTimers()
    const { run } = await makeRun(vi.fn())
    const { SSE_HEARTBEAT_MS } = await import('./runDO')
    expect(SSE_HEARTBEAT_MS).toBe(15_000)
    await run.start(INPUT)
    const reader = await subscribe(run)

    vi.advanceTimersByTime(SSE_HEARTBEAT_MS - 1)
    vi.advanceTimersByTime(1)
    expect(await text(reader)).toBe(':\n\n')
    vi.advanceTimersByTime(SSE_HEARTBEAT_MS)
    expect(await text(reader)).toBe(':\n\n')

    // A terminal event closes the stream and the timer with it.
    await run.cancel()
    expect(await text(reader)).toContain('event: cancelled')
    expect(await text(reader)).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops the heartbeat when the last subscriber hangs up', async () => {
    vi.useFakeTimers()
    const { run } = await makeRun(vi.fn())
    await run.start(INPUT)
    const reader = await subscribe(run)
    expect(vi.getTimerCount()).toBe(1)
    await reader.cancel()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('closes after the replay when nothing is live to tail', async () => {
    vi.useFakeTimers()
    const { run } = await makeRun(vi.fn())
    // No run at all.
    expect(await text(await subscribe(run))).toBeNull()
    // A cancelled run replays its terminal event, then closes.
    await run.start(INPUT)
    await run.cancel()
    const reader = await subscribe(run)
    const replay = (await text(reader)) ?? ''
    expect(replay + ((await text(reader)) ?? '')).toContain('event: cancelled')
    expect(vi.getTimerCount()).toBe(0)
  })
})

