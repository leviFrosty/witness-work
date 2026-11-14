import { afterEach, describe, expect, it, vi } from 'vitest'
import { runNotesImportModel, type ModelProgress } from './llm'
import { getNotesImportConfig } from './config'
import { NOTES_IMPORT_INSTRUCTIONS, buildNotesImportContext } from './prompt'
import { NOTES_IMPORT_MODEL_SCHEMA } from './modelSchema'
import type { Environment } from '../types'

const context = {
  now: '2026-10-12T09:00:00-04:00',
  timeZone: 'America/New_York',
  existingContacts: [{ id: 'existing-jane', name: 'Jane Doe' }],
  existingCategories: [],
}
const config = getNotesImportConfig({ APP_ATTEST_ENVIRONMENT: 'production' } as Environment)
const validResult = {
  contacts: [],
  visits: [{ contactId: 'existing-jane', date: '2026-10-01', isBibleStudy: false }],
  timeEntries: [{ date: '2026-10-01', hours: 1, minutes: 30 }],
  categories: [],
  publisher: null,
  warnings: [],
  summary: 'October service',
  assistantMessage: '',
}

// Exercise the real OpenRouter adapter and AI SDK parser over a synthetic SSE
// response, so assertions cover the outbound wire contract as well as parsing.
const mockStream = (content: string, reasoning = '', finishReason = 'stop') => {
  const chunks = [
    { delta: { role: 'assistant', reasoning } },
    { delta: { content } },
    { delta: {}, finish_reason: finishReason },
  ].map((choice) => `data: ${JSON.stringify({
    id: 'test-completion',
    model: config.model,
    provider: 'Fireworks',
    choices: [{ index: 0, ...choice }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150,
      completion_tokens_details: { reasoning_tokens: 20 },
      prompt_tokens_details: { cached_tokens: 40 } },
  })}\n\n`).join('') + 'data: [DONE]\n\n'
  const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(chunks, {
    headers: { 'content-type': 'text/event-stream' },
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
const run = (overrides = {}) => runNotesImportModel({
  apiKey: 'synthetic-key', config, context,
  notesText: 'October 1: 90 min. Visited Jane Doe.',
  ...overrides,
})

afterEach(() => vi.unstubAllGlobals())

describe('OpenRouter Notes Import structured output', () => {
  it('sends strict schema and retains reasoning, ZDR, and the host allowlist', async () => {
    const fetchMock = mockStream(JSON.stringify(validResult), 'Resolve the date.')
    const progress: ModelProgress[] = []
    const out = await run({ onProgress: (event: ModelProgress) => progress.push(event) })
    expect(out.result).toEqual(validResult)
    expect(out.resolvedProvider).toBe('Fireworks')
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string)
    expect(body.model).toBe('openai/gpt-6-luna')
    expect(body.max_tokens).toBe(32_000)
    // Azure rejects temperature when strict parameter routing is enabled.
    expect(body).not.toHaveProperty('temperature')
    expect(body.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { name: 'NotesImport', strict: true, schema: NOTES_IMPORT_MODEL_SCHEMA },
    })
    expect(body.provider).toEqual({
      only: ['azure'], order: ['azure'],
      zdr: true, data_collection: 'deny', allow_fallbacks: true, require_parameters: true,
    })
    expect(body.reasoning).toEqual({ enabled: true, effort: 'low' })
    expect(body.messages[0].content).toEqual([{ type: 'text', text:
      `${NOTES_IMPORT_INSTRUCTIONS}\n\n${buildNotesImportContext(context)}`,
    }])
    expect(body.messages[1].content).toBe('<ORIGINAL NOTES>\nOctober 1: 90 min. Visited Jane Doe.\n</ORIGINAL NOTES>')
    expect(progress).toContainEqual({ kind: 'phase', phase: 'thinking' })
    expect(progress).toContainEqual({ kind: 'phase', phase: 'structuring' })
  })

  it('explicitly disables model-default thinking for an off override', async () => {
    const fetchMock = mockStream(JSON.stringify(validResult))
    await run({ config: { ...config, reasoningEffort: null } })
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string).reasoning).toEqual({ enabled: false })
  })

  it('normalizes nullable Azure output on both normal and reasoning-recovery paths', async () => {
    const nullable = { ...validResult,
      contacts: [{ tempId: 'c1', name: 'Jordan', phone: null, address: null }],
      visits: [{ ...validResult.visits[0], contactTempId: null, followUp: null }],
    }
    const expected = { ...validResult, contacts: [{ tempId: 'c1', name: 'Jordan' }] }
    mockStream(JSON.stringify(nullable))
    expect((await run()).result).toEqual(expected)
    mockStream('', JSON.stringify(nullable))
    expect((await run()).result).toEqual(expected)
  })

  it('keeps the initial prompt as the refinement prefix and returns the whole object', async () => {
    const fetchMock = mockStream(JSON.stringify(validResult))
    await run()
    await run({ refinement: { previousResultJSON: JSON.stringify(validResult), instruction: 'It was October 2.' } })
    const [initial, refined] = fetchMock.mock.calls.map((call) => JSON.parse(call[1]!.body as string))
    expect(refined.messages[0]).toEqual(initial.messages[0])
    expect(refined.messages[1].content).toContain(initial.messages[1].content + '\n\n')
    expect(refined.messages[1].content).toContain('<PREVIOUS RESULT>')
    expect(refined.messages[1].content).toContain('<USER CORRECTION>\nIt was October 2.\n</USER CORRECTION>')
  })

  it('recovers schema-valid JSON only from a completed blank response', async () => {
    mockStream('', `<think>${JSON.stringify(validResult)}</think>`)
    expect((await run()).result).toEqual(validResult)
  })

  it.each([
    { ...validResult, timeEntries: [{ date: '2026-10-01', hours: 0, minutes: 90 }] },
    { ...validResult, contacts: [{ tempId: 'c1' }] },
    { ...validResult, publisher: { role: 'invented' } },
    { ...validResult, unexpected: true },
  ])('rejects schema-invalid normal and recovered output', async (invalid) => {
    mockStream(JSON.stringify(invalid))
    await expect(run()).rejects.toThrow()
    mockStream('', JSON.stringify(invalid))
    await expect(run()).rejects.toThrow()
  })

  it('keeps model content out of errors reported by the routes', async () => {
    mockStream(JSON.stringify({ ...validResult, privateField: 'private-notes-marker' }))
    const error = await run().catch(error => error as Error)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('Invalid Notes Import structured output')
    expect((error as Error).cause).toBeUndefined()
    expect((error as Error).stack).not.toContain('private-notes-marker')
  })

  it('does not use a reasoning draft when a completion is nonblank or truncated', async () => {
    mockStream('{"broken": true}', JSON.stringify(validResult))
    await expect(run()).rejects.toThrow()
    mockStream('', JSON.stringify(validResult), 'length')
    await expect(run({ config: { ...config, reasoningEffort: null } })).rejects.toThrow()
  })

  it('retries blank reasoning-only exhaustion once with thinking off and sums usage', async () => {
    const first = mockStream('', 'Thinking but no answer', 'length')
    const second = mockStream(JSON.stringify(validResult))
    const fetchMock = vi.fn().mockImplementationOnce(first).mockImplementationOnce(second)
    vi.stubGlobal('fetch', fetchMock)
    const out = await run()
    expect(out.result).toEqual(validResult)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).reasoning).toEqual({ enabled: false })
    expect(out.usage.inputTokens).toBe(200)
    expect(out.usage.outputTokens).toBe(100)
    expect(out.usage.outputTokenDetails.reasoningTokens).toBe(40)
  })

  it('never retries truncated nonblank output or a cancelled run', async () => {
    let fetchMock = mockStream('{"contacts": [', 'draft', 'length')
    await expect(run()).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const controller = new AbortController()
    fetchMock = mockStream('', 'draft', 'length')
    fetchMock.mockImplementationOnce(async () => { controller.abort(); return new Response('') })
    await expect(run({ abortSignal: controller.signal })).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps missing presentation-string defaults for otherwise valid recovery', async () => {
    const { summary: _summary, assistantMessage: _message, ...records } = validResult
    mockStream('', JSON.stringify(records))
    expect((await run()).result).toEqual({ ...records, summary: '', assistantMessage: '' })
  })
})
