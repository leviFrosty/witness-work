import { describe, expect, it, vi } from 'vitest'
import type { streamText } from 'ai'
import { SCRIBE_TOOLS } from '../test/scribeFixture'
import { DEFAULT_SCRIBE_MODEL } from './config'
import { cacheKeyFor, mapFinish, runScribeStep, type RunStepArgs } from './step'
import type { ToolDefinition } from './wire'

type Part = Record<string, unknown>

const usage = (input: number, cached = 0, output = 20, reasoning = 0, writes = 0) => ({
  inputTokens: input,
  outputTokens: output,
  totalTokens: input + output,
  inputTokenDetails: { cacheReadTokens: cached, noCacheTokens: input - cached, cacheWriteTokens: writes },
  outputTokenDetails: { reasoningTokens: reasoning, textTokens: output - reasoning },
})

const finish = (
  finishReason: string,
  used: unknown = usage(1_000, 0, 20),
  cost?: number
): Part[] => [
  {
    type: 'finish-step',
    finishReason,
    usage: used,
    providerMetadata: {
      openrouter: { provider: 'Azure', ...(cost === undefined ? {} : { usage: { cost } }) },
    },
  },
  { type: 'finish', finishReason, totalUsage: used },
]

/** A `streamText` stand-in playing one list of parts per call. */
const model = (...calls: Part[][]) => {
  const fn = vi.fn((_args: Record<string, unknown>) => {
    const parts = calls.shift() ?? []
    return {
      fullStream: (async function* () {
        for (const part of parts) yield part
      })(),
    }
  })
  return fn
}

const run = (fn: ReturnType<typeof model>, overrides: Partial<RunStepArgs> = {}) => {
  const texts: string[] = []
  const calls: unknown[] = []
  const outcome = runScribeStep({
    apiKey: 'or-test',
    user: 'ww_user',
    target: { model: 'openai/gpt-6-luna', providers: ['azure'] },
    model: DEFAULT_SCRIBE_MODEL,
    input: { system: 'PROMPT', messages: [{ role: 'user', content: 'hi' }] },
    tools: SCRIBE_TOOLS as unknown as ToolDefinition[],
    toolChoice: 'auto',
    inputEstimate: 900,
    stepTimeoutMs: 5_000,
    signal: new AbortController().signal,
    callbacks: {
      onText: (delta) => texts.push(delta),
      onToolCall: (call) => calls.push(call),
    },
    streamTextFn: fn as unknown as typeof streamText,
    ...overrides,
  })
  return { outcome, texts, calls }
}

describe('mapFinish', () => {
  it.each([
    ['tool-calls', 1, 'tool_calls'],
    ['tool-calls', 0, 'end'],
    ['stop', 0, 'end'],
    ['stop', 2, 'tool_calls'],
    ['length', 1, 'length'],
    ['content-filter', 0, 'refused'],
    ['other', 0, 'end'],
    [undefined, 0, 'end'],
  ])('%s with %i calls → %s', (reason, emitted, finish) => {
    expect(mapFinish(reason, emitted)).toBe(finish)
  })
})

describe('cacheKeyFor', () => {
  it('sends no key with 0 buckets', () => {
    expect(cacheKeyFor('acct_1', 0)).toBeUndefined()
  })

  it('maps an account to a stable bucket that never names it', () => {
    const key = cacheKeyFor('01J9ZQ3K7M4N5P6Q7R8S9T0V1W', 8)
    expect(key).toMatch(/^scribe-[0-7]$/)
    expect(cacheKeyFor('01J9ZQ3K7M4N5P6Q7R8S9T0V1W', 8)).toBe(key)
    expect(cacheKeyFor('anything', 1)).toBe('scribe-0')
  })

  it('spreads accounts across the buckets', () => {
    const buckets = new Set(Array.from({ length: 200 }, (_, i) => cacheKeyFor(`account-${i}`, 8)))
    expect(buckets.size).toBe(8)
  })
})

describe('runScribeStep', () => {
  it('reports cache writes and OpenRouter’s billed cost, summed over a retry', async () => {
    const fn = model(finish('stop', usage(4_808, 0, 300, 300, 4_805), 0.0008), [
      { type: 'text-delta', text: 'Done.' },
      ...finish('stop', usage(4_808, 4_805, 10, 0, 0), 0.0001),
    ])
    const result = await run(fn).outcome
    expect(result).toMatchObject({
      kind: 'finished',
      usage: { inputTokens: 9_616, cachedInputTokens: 4_805, cacheWriteTokens: 4_805 },
    })
    expect(result.usage!.costUsd).toBeCloseTo(0.0009, 10)
  })

  it('leaves the cost null when OpenRouter reports none', async () => {
    const result = await run(model(finish('stop', usage(1_000, 0, 20, 0, 900)))).outcome
    expect(result.usage).toMatchObject({ cacheWriteTokens: 900, costUsd: null })
  })

  it('sends prompt_cache_key only when given one', async () => {
    const plain = model(finish('stop'))
    await run(plain).outcome
    expect((plain.mock.calls[0][0] as any).providerOptions.openrouter).not.toHaveProperty(
      'prompt_cache_key'
    )
    const keyed = model(finish('stop'))
    await run(keyed, { cacheKey: 'scribe-3' }).outcome
    expect((keyed.mock.calls[0][0] as any).providerOptions.openrouter).toMatchObject({
      prompt_cache_key: 'scribe-3',
      provider: { only: ['azure'], zdr: true, require_parameters: true },
    })
  })

  it('retries a blank completion once without reasoning and charges both', async () => {
    const fn = model(finish('stop', usage(1_000, 0, 300, 300)), [
      { type: 'text-delta', text: 'Done.' },
      ...finish('stop', usage(1_000, 900, 10)),
    ])
    const { outcome, texts } = run(fn)
    const result = await outcome
    expect(fn).toHaveBeenCalledTimes(2)
    expect((fn.mock.calls[0][0].providerOptions as any).openrouter.reasoning).toEqual({ enabled: true, effort: 'medium' })
    expect((fn.mock.calls[1][0].providerOptions as any).openrouter.reasoning).toEqual({ enabled: false })
    expect(texts).toEqual(['Done.'])
    expect(result).toMatchObject({
      kind: 'finished',
      finish: 'end',
      retriedWithoutReasoning: true,
      usage: { inputTokens: 2_000, cachedInputTokens: 900, outputTokens: 310, reasoningTokens: 300 },
    })
  })

  it('doesn’t retry when reasoning is already off', async () => {
    const fn = model(finish('stop'))
    const result = await run(fn, { model: { ...DEFAULT_SCRIBE_MODEL, reasoningEffort: null } }).outcome
    expect(fn).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ kind: 'finished', retriedWithoutReasoning: false })
  })

  describe('a prompt-injection block', () => {
    /** OpenRouter's guardrail, as the AI SDK reports it. */
    const blocked = () =>
      Object.assign(new Error('Request blocked: prompt injection patterns detected'), {
        name: 'AI_APICallError',
        statusCode: 403,
        responseBody:
          '{"error":{"message":"Request blocked: prompt injection patterns detected","code":403}}',
      })
    const withheldInput = {
      system: 'PROMPT',
      messages: [{ role: 'user' as const, content: 'hi (withheld)' }],
    }

    it('retries once without the untrusted text, charging only the answer', async () => {
      const fn = model(
        [{ type: 'error', error: blocked() }],
        [{ type: 'text-delta', text: 'I couldn’t read that note.' }, ...finish('stop')]
      )
      const { outcome, texts } = run(fn, { withheldInput })
      const result = await outcome
      expect(fn).toHaveBeenCalledTimes(2)
      expect(fn.mock.calls[1][0].messages).toBe(withheldInput.messages)
      expect(texts).toEqual(['I couldn’t read that note.'])
      expect(result).toMatchObject({
        kind: 'finished',
        finish: 'end',
        injectionBlock: 'withheld',
        retriedWithoutReasoning: false,
        usage: { inputTokens: 1_000 },
      })
    })

    it('ends the step as refused when there is nothing to withhold', async () => {
      const fn = model([{ type: 'error', error: blocked() }])
      const result = await run(fn).outcome
      expect(fn).toHaveBeenCalledTimes(1)
      expect(result).toMatchObject({
        kind: 'finished',
        finish: 'refused',
        injectionBlock: 'refused',
        usage: { inputTokens: 0, outputTokens: 0 },
      })
    })

    it('ends the step as refused when the retry is blocked too', async () => {
      const fn = model([{ type: 'error', error: blocked() }], [{ type: 'error', error: blocked() }])
      const result = await run(fn, { withheldInput }).outcome
      expect(fn).toHaveBeenCalledTimes(2)
      expect(result).toMatchObject({ kind: 'finished', finish: 'refused', injectionBlock: 'refused' })
    })

    it('leaves other failures alone', async () => {
      const forbidden = Object.assign(new Error('Forbidden'), { name: 'AI_APICallError', statusCode: 403 })
      const fn = model([{ type: 'error', error: forbidden }])
      const result = await run(fn, { withheldInput }).outcome
      expect(fn).toHaveBeenCalledTimes(1)
      expect(result).toMatchObject({ kind: 'failed', usage: null })
    })
  })

  it('charges nothing when the provider fails before any output', async () => {
    const fn = model([{ type: 'error', error: new Error('503') }])
    const result = await run(fn).outcome
    expect(result).toMatchObject({ kind: 'failed', usage: null })
  })

  it('estimates usage the provider didn’t report after output', async () => {
    const fn = model([{ type: 'text-delta', text: 'abcdefg' }, { type: 'error', error: new Error('reset') }])
    const result = await run(fn).outcome
    expect(result).toMatchObject({
      kind: 'failed',
      usage: {
        inputTokens: 900,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 3,
        costUsd: null,
        estimated: true,
      },
    })
  })

  it('makes call ids safe and unique', async () => {
    const fn = model([
      { type: 'tool-call', toolCallId: 'call:1', toolName: 'plans_list', input: {} },
      { type: 'tool-call', toolCallId: 'call_1', toolName: 'time_summary', input: {} },
      ...finish('tool-calls'),
    ])
    const { outcome, calls } = run(fn)
    await outcome
    const ids = (calls as { callId: string }[]).map((call) => call.callId)
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
  })

  it('sends tools without execute, no parallel_tool_calls, and strict tools only when configured', async () => {
    const plain = model(finish('stop'))
    await run(plain).outcome
    const args = plain.mock.calls[0][0] as any
    expect(Object.values(args.tools).every((tool: any) => tool.execute === undefined)).toBe(true)
    expect(args).not.toHaveProperty('parallelToolCalls')
    expect(args.providerOptions.openrouter).not.toHaveProperty('tools')
    expect(args.providerOptions.openrouter).not.toHaveProperty('parallel_tool_calls')

    const strict = model(finish('stop'))
    await run(strict, { model: { ...DEFAULT_SCRIBE_MODEL, strictTools: true } }).outcome
    const wire = (strict.mock.calls[0][0] as any).providerOptions.openrouter.tools
    expect(wire).toHaveLength(SCRIBE_TOOLS.length)
    expect(wire[0]).toMatchObject({ type: 'function', function: { name: SCRIBE_TOOLS[0].name, strict: true } })
  })

  it('sends no tools when none are offered', async () => {
    const fn = model(finish('stop'))
    await run(fn, { tools: [] }).outcome
    expect(fn.mock.calls[0][0]).not.toHaveProperty('tools')
    expect(fn.mock.calls[0][0]).not.toHaveProperty('toolChoice')
  })
})
