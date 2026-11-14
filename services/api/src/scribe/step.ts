import {
  jsonSchema,
  stepCountIs,
  streamText,
  tool,
  type JSONSchema7,
  type JSONValue,
  type LanguageModelUsage,
  type ToolSet,
} from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { sha256Hex } from '../crypto'
import type { ScribeModelConfig, ScribeModelTarget, ReasoningEffort } from './config'
import type { ModelInput } from './render'
import { isInjectionBlock } from './errors'
import { CALL_ID } from './validate'
import type { StepFinish, ToolCallEvent, ToolDefinition } from './wire'

/**
 * One Scribe AI step: one `streamText` call with the offered tools and no
 * `execute` (the device runs them), streamed to the caller as it arrives.
 * Never logs or returns content: only counts, the finish, and usage.
 */

/** Token usage of a step, reported by the provider or estimated after an abort. */
export interface RawUsage {
  inputTokens: number
  cachedInputTokens: number
  cacheWriteTokens: number
  outputTokens: number
  reasoningTokens: number
  /** OpenRouter's billed USD (`usage.cost`), for logs only; null when unreported. */
  costUsd: number | null
  /** True when the provider reported nothing and these are the server's estimate. */
  estimated: boolean
}

export const ZERO_USAGE: RawUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  costUsd: null,
  estimated: false,
}

export interface StepCounts {
  /** Names of the tool calls sent, in order. */
  emitted: string[]
  /** Model calls to a tool not offered. */
  unknownTool: number
  /** Calls whose arguments weren't a JSON object. */
  invalidArgs: number
  textChars: number
  /** Every generated char seen (text, reasoning, tool arguments). */
  streamedChars: number
}

export type StepOutcome =
  | {
      kind: 'finished'
      finish: StepFinish
      usage: RawUsage
      resolvedProvider: string | null
      counts: StepCounts
      /** A blank completion was retried once with reasoning off. */
      retriedWithoutReasoning: boolean
      /**
       * The host blocked the input as a prompt injection: `withheld` when a
       * retry without the untrusted text answered, `refused` when the step
       * ended as `refused` instead.
       */
      injectionBlock: 'withheld' | 'refused' | null
      ttftMs: number | null
    }
  | {
      kind: 'aborted'
      reason: 'client' | 'timeout'
      usage: RawUsage
      resolvedProvider: string | null
      counts: StepCounts
      ttftMs: number | null
    }
  | {
      kind: 'failed'
      error: unknown
      /** Null when the provider failed before any output (nothing is charged). */
      usage: RawUsage | null
      resolvedProvider: string | null
      counts: StepCounts
      ttftMs: number | null
    }

export interface StepCallbacks {
  onText(delta: string): Promise<unknown> | unknown
  onToolCall(call: Omit<ToolCallEvent, 'type'>): Promise<unknown> | unknown
}

/**
 * The `user` OpenRouter gets for an account. Without one, OpenRouter sends the
 * whole API key's identity upstream, so one User's provider policy block
 * (GPT-6's `bio_policy`/`cyber_policy` 403s) would block every User. A hash
 * under its own label: it can't be turned back into the account id, and it
 * differs from the analytics id. OpenRouter hashes it again before it leaves.
 */
export const providerUserId = async (accountId: string): Promise<string> =>
  `ww_${(await sha256Hex(`ww-api:openrouter-user:${accountId}`)).slice(0, 32)}`

export interface RunStepArgs {
  apiKey: string
  /** {@link providerUserId} of the caller. */
  user: string
  target: ScribeModelTarget
  model: Pick<ScribeModelConfig, 'reasoningEffort' | 'maxOutputTokens' | 'strictTools'>
  input: ModelInput
  /**
   * The same input with every untrusted result withheld, when it has any: sent
   * once if the host blocks `input` as a prompt injection.
   */
  withheldInput?: ModelInput
  /** The offered set, in order. */
  tools: ToolDefinition[]
  toolChoice: 'auto' | 'none'
  /** The server's input estimate, charged as uncached input after an abort. */
  inputEstimate: number
  /** `prompt_cache_key` to send (`cacheKeyFor`); none when undefined. */
  cacheKey?: string
  stepTimeoutMs: number
  /** Aborts when the client goes away. */
  signal: AbortSignal
  callbacks: StepCallbacks
  now?: () => number
  /** Test seam for the model call. */
  streamTextFn?: typeof streamText
}

const toolSet = (tools: ToolDefinition[]): ToolSet =>
  Object.fromEntries(
    tools.map((definition) => [
      definition.name,
      // No `execute` and no validation: the app parses every call itself.
      tool({
        description: definition.description,
        inputSchema: jsonSchema(definition.inputSchema as JSONSchema7),
      }),
    ])
  )

/** The tools as OpenRouter sends them, with `strict` (the provider has no setting for it). */
const strictWireTools = (tools: ToolDefinition[]): JSONValue[] =>
  tools.map((definition) => ({
    type: 'function',
    function: {
      name: definition.name,
      description: definition.description,
      parameters: definition.inputSchema as JSONValue,
      strict: true,
    },
  }))

/** OpenRouter's billed USD from a call's provider metadata, or null. */
export const billedCost = (providerMetadata: unknown): number | null => {
  const cost = (providerMetadata as { openrouter?: { usage?: { cost?: unknown } } } | undefined)
    ?.openrouter?.usage?.cost
  return typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? cost : null
}

export const fromSdkUsage = (
  usage: LanguageModelUsage | undefined,
  costUsd: number | null = null
): RawUsage | null => {
  if (!usage || usage.inputTokens == null) return null
  return {
    inputTokens: usage.inputTokens ?? 0,
    cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens ?? 0,
    cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens ?? 0,
    costUsd,
    estimated: false,
  }
}

const addCost = (a: number | null, b: number | null) =>
  a == null && b == null ? null : (a ?? 0) + (b ?? 0)

/** Both attempts of a blank-completion retry are charged. */
export const addUsage = (a: RawUsage, b: RawUsage): RawUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  reasoningTokens: a.reasoningTokens + b.reasoningTokens,
  costUsd: addCost(a.costUsd, b.costUsd),
  estimated: a.estimated || b.estimated,
})

/** The protocol's estimate for an unreported call: input as uncached, chars ÷ 3 as output. */
export const estimatedUsage = (inputEstimate: number, streamedChars: number): RawUsage => ({
  inputTokens: inputEstimate,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: Math.ceil(streamedChars / 3),
  reasoningTokens: 0,
  costUsd: null,
  estimated: true,
})

/**
 * A stable `prompt_cache_key` bucket for the account: FNV-1a of its id, mod
 * `buckets`. Undefined when `buckets` is 0 (none sent). The key names only the
 * bucket, never the account.
 */
export const cacheKeyFor = (accountId: string, buckets: number): string | undefined => {
  if (!(buckets > 0)) return undefined
  let hash = 0x811c9dc5
  for (let i = 0; i < accountId.length; i++) {
    hash ^= accountId.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `scribe-${(hash >>> 0) % buckets}`
}

/**
 * AI SDK finish → wire `finish`: `length` and `content-filter` map through;
 * otherwise `tool_calls` when at least one call was sent, else `end`.
 */
export const mapFinish = (finishReason: string | undefined, emitted: number): StepFinish => {
  if (finishReason === 'length') return 'length'
  if (finishReason === 'content-filter') return 'refused'
  return emitted > 0 ? 'tool_calls' : 'end'
}

/** A call id the app can echo back (`^[A-Za-z0-9_-]{1,64}$`), unique in the step. */
const wireCallId = (raw: string, used: Set<string>, index: number): string => {
  let id = CALL_ID.test(raw) ? raw : raw.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64)
  if (!id || used.has(id)) id = `call_${index}_${used.size}`
  used.add(id)
  return id
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value)

const isNoSuchTool = (error: unknown) =>
  error != null &&
  typeof error === 'object' &&
  (error as { name?: unknown }).name === 'AI_NoSuchToolError'

interface AttemptResult {
  finishReason: string | undefined
  usage: RawUsage | null
  resolvedProvider: string | null
  error: unknown
  aborted: boolean
  /** Generated chars and calls seen in this attempt. */
  chars: number
  calls: number
}

export const runScribeStep = async (args: RunStepArgs): Promise<StepOutcome> => {
  const now = args.now ?? Date.now
  const started = now()
  const controller = new AbortController()
  let abortReason: 'client' | 'timeout' | null = null
  const abort = (reason: 'client' | 'timeout') => {
    if (abortReason) return
    abortReason = reason
    controller.abort()
  }
  const onClientAbort = () => abort('client')
  if (args.signal.aborted) abort('client')
  else args.signal.addEventListener('abort', onClientAbort, { once: true })
  const timer = setTimeout(() => abort('timeout'), args.stepTimeoutMs)

  const counts: StepCounts = {
    emitted: [],
    unknownTool: 0,
    invalidArgs: 0,
    textChars: 0,
    streamedChars: 0,
  }
  const usedIds = new Set<string>()
  let ttftMs: number | null = null
  const sawOutput = () => {
    if (ttftMs == null) ttftMs = now() - started
  }
  const run = args.streamTextFn ?? streamText
  const tools = args.tools.length ? toolSet(args.tools) : undefined

  const attempt = async (
    reasoningEffort: ReasoningEffort,
    input: ModelInput
  ): Promise<AttemptResult> => {
    const openrouter = createOpenRouter({ apiKey: args.apiKey })
    const result = run({
      // No `parallel_tool_calls`: Azure doesn't list it, so with
      // `require_parameters` OpenRouter would find no host. OpenAI models
      // make parallel calls by default.
      model: openrouter(args.target.model),
      system: input.system,
      messages: input.messages,
      ...(tools ? { tools, toolChoice: args.toolChoice } : {}),
      stopWhen: stepCountIs(1),
      maxOutputTokens: args.model.maxOutputTokens,
      maxRetries: 2,
      abortSignal: controller.signal,
      // The SDK's default logs the whole error, provider body included.
      onError: () => undefined,
      providerOptions: {
        openrouter: {
          // HARD ZDR INVARIANT (ADR 0008): only allowlisted Western hosts that
          // retain nothing, and only those serving every parameter we send
          // (tools included). Fail closed: never widened automatically.
          provider: {
            only: args.target.providers,
            order: args.target.providers,
            data_collection: 'deny',
            zdr: true,
            allow_fallbacks: true,
            require_parameters: true,
          },
          user: args.user,
          reasoning: reasoningEffort
            ? { enabled: true, effort: reasoningEffort }
            : { enabled: false },
          ...(args.model.strictTools && args.tools.length
            ? { tools: strictWireTools(args.tools) }
            : {}),
          ...(args.cacheKey ? { prompt_cache_key: args.cacheKey } : {}),
        },
      },
    })
    const charsBefore = counts.streamedChars
    const callsBefore = counts.emitted.length + counts.unknownTool + counts.invalidArgs
    let finishReason: string | undefined
    let usage: RawUsage | null = null
    let resolvedProvider: string | null = null
    let error: unknown = null
    let aborted = false
    try {
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            sawOutput()
            counts.textChars += part.text.length
            counts.streamedChars += part.text.length
            await args.callbacks.onText(part.text)
            break
          case 'reasoning-delta':
            sawOutput()
            counts.streamedChars += part.text.length
            break
          case 'tool-input-delta':
            sawOutput()
            counts.streamedChars += part.delta.length
            break
          case 'tool-call': {
            sawOutput()
            const offered = args.tools.some((definition) => definition.name === part.toolName)
            if (part.invalid && isNoSuchTool(part.error)) counts.unknownTool += 1
            else if (!offered) counts.unknownTool += 1
            else if (part.invalid || !isPlainObject(part.input)) counts.invalidArgs += 1
            else {
              const callId = wireCallId(part.toolCallId, usedIds, counts.emitted.length)
              counts.emitted.push(part.toolName)
              await args.callbacks.onToolCall({
                callId,
                name: part.toolName,
                args: part.input,
              })
            }
            break
          }
          case 'finish-step':
            finishReason = part.finishReason
            usage = fromSdkUsage(part.usage, billedCost(part.providerMetadata))
            resolvedProvider =
              (part.providerMetadata?.openrouter as { provider?: string } | undefined)
                ?.provider ?? null
            break
          case 'finish':
            finishReason = part.finishReason
            usage = usage ?? fromSdkUsage(part.totalUsage)
            break
          case 'abort':
            aborted = true
            break
          case 'error':
            error = part.error
            break
        }
      }
    } catch (thrown) {
      if (controller.signal.aborted) aborted = true
      else error = thrown
    }
    if (controller.signal.aborted) aborted = true
    return {
      finishReason,
      usage,
      resolvedProvider,
      error,
      aborted,
      chars: counts.streamedChars - charsBefore,
      calls: counts.emitted.length + counts.unknownTool + counts.invalidArgs - callsBefore,
    }
  }

  /** What one attempt is charged: its reported usage, else the estimate (or nothing). */
  const chargeOf = (result: AttemptResult): RawUsage | null => {
    if (result.usage) return result.usage
    const outputSeen = result.chars > 0 || result.calls > 0
    if (result.error && !result.aborted && !outputSeen) return null
    return estimatedUsage(args.inputEstimate, result.chars)
  }
  const total = (results: AttemptResult[]): RawUsage | null =>
    results
      .map(chargeOf)
      .reduce<RawUsage | null>(
        (sum, usage) => (usage ? (sum ? addUsage(sum, usage) : usage) : sum),
        null
      )

  try {
    let input = args.input
    const attempts = [await attempt(args.model.reasoningEffort, input)]
    let injectionBlock: 'withheld' | 'refused' | null = null
    if (!attempts[0].aborted && isInjectionBlock(attempts[0].error)) {
      // Nothing was generated or charged. A person's text (a Visit note) is
      // the likely trigger; without it the model can still answer.
      injectionBlock = 'refused'
      if (args.withheldInput) {
        input = args.withheldInput
        attempts.push(await attempt(args.model.reasoningEffort, input))
      }
    }
    const first = attempts[attempts.length - 1]
    const blank =
      !first.aborted &&
      !first.error &&
      first.finishReason === 'stop' &&
      counts.textChars === 0 &&
      first.calls === 0
    if (blank && args.model.reasoningEffort) {
      // Notes Import's lesson: a host can spend the turn on reasoning and
      // return nothing. Retry once with reasoning off; both are charged.
      attempts.push(await attempt(null, input))
    }
    const last = attempts[attempts.length - 1]
    const resolvedProvider =
      attempts.map((result) => result.resolvedProvider).filter(Boolean).pop() ?? null
    if (last.aborted || abortReason) {
      return {
        kind: 'aborted',
        reason: abortReason ?? 'client',
        usage: total(attempts) ?? estimatedUsage(args.inputEstimate, 0),
        resolvedProvider,
        counts,
        ttftMs,
      }
    }
    if (last.error && isInjectionBlock(last.error)) {
      // Blocked again: no retry can pass, so end the step instead of
      // offering Try again.
      return {
        kind: 'finished',
        finish: 'refused',
        usage: total(attempts) ?? ZERO_USAGE,
        resolvedProvider,
        counts,
        retriedWithoutReasoning: false,
        injectionBlock: 'refused',
        ttftMs,
      }
    }
    if (last.error) {
      return {
        kind: 'failed',
        error: last.error,
        usage: total(attempts),
        resolvedProvider,
        counts,
        ttftMs,
      }
    }
    return {
      kind: 'finished',
      finish: mapFinish(last.finishReason, counts.emitted.length),
      usage: total(attempts) ?? ZERO_USAGE,
      resolvedProvider,
      counts,
      retriedWithoutReasoning: attempts.length > (injectionBlock ? 2 : 1),
      injectionBlock: injectionBlock && 'withheld',
      ttftMs,
    }
  } finally {
    clearTimeout(timer)
    args.signal.removeEventListener('abort', onClientAbort)
  }
}
