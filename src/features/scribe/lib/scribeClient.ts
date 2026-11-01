import { HttpError, request, retryAfterMs } from '@/lib/http/request'
import { kindForStatus } from '@/lib/http/networkError'
import {
  ScribeClientError,
  toScribeClientError,
} from '@/features/scribe/lib/errors'
import { parseUsageSnapshot } from '@/features/scribe/lib/usageSnapshot'
import {
  DEFAULT_SCRIBE_LIMITS,
  SCRIBE_PROTOCOL,
  type ScribeLimitsWire,
  type ScribeStatusWire,
  type StepFinish,
  type StepRequest,
  type StepStreamEvent,
  type StepTerminalEvent,
  type TranscribeRequest,
  type TranscribeResponse,
  type UsageSnapshotWire,
} from '@/features/scribe/lib/wire'

export interface ScribeClient {
  status(signal?: AbortSignal): Promise<ScribeStatusWire>
  usage(signal?: AbortSignal): Promise<UsageSnapshotWire>

  step(
    body: StepRequest,
    options: {
      signal?: AbortSignal
      onEvent: (event: StepStreamEvent) => void
    }
  ): Promise<StepTerminalEvent>
  transcribe(
    image: Omit<TranscribeRequest, 'protocol'>,
    signal?: AbortSignal
  ): Promise<TranscribeResponse>
}

export interface ScribeSessions {
  withSession<T>(
    run: (authorization: string) => Promise<T>,
    call?: { signal?: AbortSignal }
  ): Promise<T>
}

export interface ScribeClientDeps {
  urls: { status: string; usage: string; step: string; transcribe: string }

  streamFetch: typeof fetch

  fetchImpl?: typeof fetch
  sessions: ScribeSessions

  linkBeforePaidCall: () => Promise<void>
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  idleTimeoutMs?: number
}

export const SCRIBE_SSE_IDLE_TIMEOUT_MS = 45_000

export const STEP_DROP_RETRY_DELAYS_MS = [1_000, 3_000] as const

export const STEP_IN_PROGRESS_RETRY_MS = 2_000

export const ACTIVE_CAP_DEFAULT_RETRY_MS = 5_000

const STATUS_TIMEOUT_MS = 10_000
const USAGE_TIMEOUT_MS = 15_000
const TRANSCRIBE_TIMEOUT_MS = 60_000

const CALL_ID = /^[A-Za-z0-9_-]{1,64}$/
const FINISHES = new Set<StepFinish>(['tool_calls', 'end', 'length', 'refused'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0

export function parseStepEvent(value: unknown): StepStreamEvent | null {
  if (!isRecord(value)) return null
  switch (value.type) {
    case 'start':
      return {
        type: 'start',
        offered: Array.isArray(value.offered)
          ? value.offered.filter((name) => typeof name === 'string')
          : [],
        dropped: Array.isArray(value.dropped)
          ? value.dropped
              .filter(isRecord)
              .filter(
                (entry) =>
                  typeof entry.name === 'string' &&
                  (entry.reason === 'disabled' || entry.reason === 'tainted')
              )
              .map((entry) => ({
                name: entry.name as string,
                reason: entry.reason as 'disabled' | 'tainted',
              }))
          : [],
      }
    case 'text':
      return typeof value.delta === 'string'
        ? { type: 'text', delta: value.delta }
        : null
    case 'tool_call':
      if (
        typeof value.callId !== 'string' ||
        !CALL_ID.test(value.callId) ||
        typeof value.name !== 'string' ||
        !isRecord(value.args)
      )
        return null
      return {
        type: 'tool_call',
        callId: value.callId,
        name: value.name,
        args: value.args,
      }
    case 'done': {
      if (!FINISHES.has(value.finish as StepFinish)) return null
      const usage = isRecord(value.usage) ? value.usage : {}
      return {
        type: 'done',
        finish: value.finish as StepFinish,
        usage: {
          inputTokens: count(usage.inputTokens),
          cachedInputTokens: count(usage.cachedInputTokens),
          cacheWriteTokens: count(usage.cacheWriteTokens),
          outputTokens: count(usage.outputTokens),
          reasoningTokens: count(usage.reasoningTokens),
          units: count(usage.units),
        },
        meter: parseUsageSnapshot(value.meter),
      }
    }
    case 'error':
      return {
        type: 'error',
        code: typeof value.code === 'string' ? value.code : 'server_error',
        message: typeof value.message === 'string' ? value.message : '',
        retryable: value.retryable !== false,
        meter: parseUsageSnapshot(value.meter),
      }
    default:
      return null
  }
}

export function frameData(frame: string): string | null {
  let data = ''
  for (const line of frame.split('\n')) {
    if (!line.startsWith('data:')) continue
    const value = line.slice(5)
    data +=
      (data ? '\n' : '') + (value.startsWith(' ') ? value.slice(1) : value)
  }
  return data || null
}

class StreamIdleError extends Error {
  constructor() {
    super('Scribe AI step went quiet')
    this.name = 'StreamIdleError'
  }
}

type StreamOutcome =
  | { kind: 'terminal'; event: StepTerminalEvent }
  | { kind: 'closed' }

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new ScribeClientError('cancelled'))
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new ScribeClientError('cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })

async function refusal(res: Response): Promise<HttpError> {
  let body: unknown = null
  try {
    const text = await res.text()
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  const envelope = isRecord(body) ? body : null
  const code =
    typeof envelope?.code === 'string'
      ? envelope.code
      : typeof envelope?.error === 'string'
        ? envelope.error
        : null
  const bodyRetryAfter =
    typeof envelope?.retryAfter === 'number' ? envelope.retryAfter * 1000 : null
  return new HttpError(
    kindForStatus(res.status),
    res.status,
    code,
    retryAfterMs(res.headers.get('retry-after')) ?? bodyRetryAfter,
    undefined,
    body
  )
}

const parseLimits = (value: unknown): ScribeLimitsWire => {
  const limits = isRecord(value) ? value : {}
  const number = (key: keyof ScribeLimitsWire, fallback: number) =>
    typeof limits[key] === 'number' && Number.isFinite(limits[key])
      ? (limits[key] as number)
      : fallback
  const transcribe = isRecord(limits.transcribe) ? limits.transcribe : {}
  return {
    maxInputTokens: number(
      'maxInputTokens',
      DEFAULT_SCRIBE_LIMITS.maxInputTokens
    ),
    maxOutputTokens: number(
      'maxOutputTokens',
      DEFAULT_SCRIBE_LIMITS.maxOutputTokens
    ),
    maxStepsPerTurn: number(
      'maxStepsPerTurn',
      DEFAULT_SCRIBE_LIMITS.maxStepsPerTurn
    ),
    maxTools: number('maxTools', DEFAULT_SCRIBE_LIMITS.maxTools),
    maxToolsBytes: number('maxToolsBytes', DEFAULT_SCRIBE_LIMITS.maxToolsBytes),
    maxToolSchemaBytes: number(
      'maxToolSchemaBytes',
      DEFAULT_SCRIBE_LIMITS.maxToolSchemaBytes
    ),
    maxToolDescriptionChars: number(
      'maxToolDescriptionChars',
      DEFAULT_SCRIBE_LIMITS.maxToolDescriptionChars
    ),
    maxRequestBytes: number(
      'maxRequestBytes',
      DEFAULT_SCRIBE_LIMITS.maxRequestBytes
    ),
    maxContextBytes: number(
      'maxContextBytes',
      DEFAULT_SCRIBE_LIMITS.maxContextBytes
    ),
    maxUserTextChars: number(
      'maxUserTextChars',
      DEFAULT_SCRIBE_LIMITS.maxUserTextChars
    ),
    maxToolResultBytes: number(
      'maxToolResultBytes',
      DEFAULT_SCRIBE_LIMITS.maxToolResultBytes
    ),
    transcribe: {
      maxBytes:
        typeof transcribe.maxBytes === 'number'
          ? transcribe.maxBytes
          : DEFAULT_SCRIBE_LIMITS.transcribe.maxBytes,
      mimeTypes: Array.isArray(transcribe.mimeTypes)
        ? transcribe.mimeTypes.filter((type) => typeof type === 'string')
        : DEFAULT_SCRIBE_LIMITS.transcribe.mimeTypes,
    },
  }
}

export function parseStatus(value: unknown): ScribeStatusWire {
  const body = isRecord(value) ? value : {}
  const protocol = isRecord(body.protocol) ? body.protocol : {}
  return {
    enabled: body.enabled !== false,
    reason:
      body.reason === 'disabled' || body.reason === 'no_provider'
        ? body.reason
        : null,
    protocol: {
      min: typeof protocol.min === 'number' ? protocol.min : SCRIBE_PROTOCOL,
      max: typeof protocol.max === 'number' ? protocol.max : SCRIBE_PROTOCOL,
    },
    minAppVersion:
      typeof body.minAppVersion === 'string' ? body.minAppVersion : null,
    disabledTools: Array.isArray(body.disabledTools)
      ? body.disabledTools.filter((name) => typeof name === 'string')
      : [],
    limits: parseLimits(body.limits),
  }
}

export function createScribeClient(deps: ScribeClientDeps): ScribeClient {
  const sleep = deps.sleep ?? defaultSleep
  const idleTimeoutMs = deps.idleTimeoutMs ?? SCRIBE_SSE_IDLE_TIMEOUT_MS
  let linked: Promise<void> | null = null

  const linkOnce = () =>
    (linked ??= deps.linkBeforePaidCall().catch(() => undefined))

  async function consumeStep(
    authorization: string,
    body: StepRequest,
    onEvent: (event: StepStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<StreamOutcome> {
    const controller = new AbortController()
    const onCallerAbort = () => controller.abort()
    if (signal?.aborted) controller.abort()
    signal?.addEventListener('abort', onCallerAbort)

    let idleTimer: ReturnType<typeof setTimeout> | undefined
    let rejectIdle: (error: StreamIdleError) => void = () => {}
    const idle = new Promise<never>((_, reject) => {
      rejectIdle = reject
    })
    idle.catch(() => {})
    const armIdle = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        rejectIdle(new StreamIdleError())
        controller.abort()
      }, idleTimeoutMs)
    }

    let responded = false
    try {
      armIdle()
      const res = await Promise.race([
        deps.streamFetch(deps.urls.step, {
          method: 'POST',
          headers: {
            Authorization: authorization,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }),
        idle,
      ])
      responded = true
      if (!res.ok) throw await refusal(res)
      if (!res.body) return { kind: 'closed' }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await Promise.race([reader.read(), idle])
        if (done) return { kind: 'closed' }

        armIdle()
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
        let index = buffer.indexOf('\n\n')
        while (index !== -1) {
          const data = frameData(buffer.slice(0, index))
          buffer = buffer.slice(index + 2)
          index = buffer.indexOf('\n\n')
          if (!data) continue
          let parsed: unknown
          try {
            parsed = JSON.parse(data)
          } catch {
            continue
          }
          const event = parseStepEvent(parsed)
          if (!event) continue
          onEvent(event)
          if (event.type === 'done' || event.type === 'error')
            return { kind: 'terminal', event }
        }
      }
    } catch (error) {
      if (signal?.aborted) throw new ScribeClientError('cancelled')
      if (error instanceof StreamIdleError) return { kind: 'closed' }
      if (error instanceof HttpError) throw error

      if (responded) return { kind: 'closed' }
      throw new ScribeClientError('network')
    } finally {
      clearTimeout(idleTimer)
      signal?.removeEventListener('abort', onCallerAbort)
    }
  }

  const step: ScribeClient['step'] = async (body, { signal, onEvent }) => {
    await linkOnce()
    let drops = 0
    let waitedInProgress = false
    let waitedActiveCap = false
    for (;;) {
      if (signal?.aborted) throw new ScribeClientError('cancelled')
      let outcome: StreamOutcome
      try {
        outcome = await deps.sessions.withSession(
          (authorization) => consumeStep(authorization, body, onEvent, signal),
          { signal }
        )
      } catch (error) {
        if (signal?.aborted) throw new ScribeClientError('cancelled')
        const failure = toScribeClientError(error)
        if (failure.serverCode === 'step_in_progress' && !waitedInProgress) {
          waitedInProgress = true
          await sleep(STEP_IN_PROGRESS_RETRY_MS, signal)
          continue
        }
        if (failure.serverCode === 'active_cap' && !waitedActiveCap) {
          waitedActiveCap = true
          await sleep(
            failure.retryAfterMs ?? ACTIVE_CAP_DEFAULT_RETRY_MS,
            signal
          )
          continue
        }
        throw failure
      }
      if (outcome.kind === 'terminal') return outcome.event

      if (drops >= STEP_DROP_RETRY_DELAYS_MS.length)
        throw new ScribeClientError('network')
      await sleep(STEP_DROP_RETRY_DELAYS_MS[drops++], signal)
    }
  }

  const authorized = async <T>(
    run: (authorization: string) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> => {
    try {
      return await deps.sessions.withSession(run, { signal })
    } catch (error) {
      throw toScribeClientError(error)
    }
  }

  return {
    status: async (signal) => {
      try {
        const { data } = await request<unknown>({
          url: deps.urls.status,
          timeoutMs: STATUS_TIMEOUT_MS,
          signal,
          fetchImpl: deps.fetchImpl,
        })
        return parseStatus(data)
      } catch (error) {
        throw toScribeClientError(error)
      }
    },
    usage: (signal) =>
      authorized(async (authorization) => {
        const { data } = await request<unknown>({
          url: deps.urls.usage,
          headers: { authorization },
          timeoutMs: USAGE_TIMEOUT_MS,
          signal,
          fetchImpl: deps.fetchImpl,
        })
        const snapshot = parseUsageSnapshot(data)
        if (!snapshot) throw new ScribeClientError('unknown')
        return snapshot
      }, signal),
    step,
    transcribe: async (image, signal) => {
      await linkOnce()
      return authorized(async (authorization) => {
        const { data } = await request<unknown>({
          url: deps.urls.transcribe,
          method: 'POST',
          headers: { authorization },
          json: { protocol: SCRIBE_PROTOCOL, ...image },
          timeoutMs: TRANSCRIBE_TIMEOUT_MS,
          signal,
          fetchImpl: deps.fetchImpl,
        })
        if (!isRecord(data) || typeof data.text !== 'string')
          throw new ScribeClientError('unknown')
        return {
          text: data.text,
          truncated: data.truncated === true,
          usage: parseUsageSnapshot(data.usage),
        }
      }, signal)
    },
  }
}
