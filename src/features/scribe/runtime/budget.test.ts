import { describe, expect, it } from 'vitest'
import {
  budgetState,
  estimatedInputTokens,
  jsonBytes,
  SYSTEM_PROMPT_TOKEN_ESTIMATE,
  tokensForBytes,
  type BudgetInput,
} from '@/features/scribe/runtime/budget'
import type {
  ScribeContextWire,
  ToolDefinitionWire,
  WireMessage,
} from '@/features/scribe/lib/wire'

const context = {
  v: 1,
  now: '2026-10-21T09:30:00-05:00',
  tz: 'America/Chicago',
  locale: 'en-US',
  weekStart: 0,
  clock: '12h',
  days: ['Wed 2026-10-21'],
  publisher: {
    role: 'regularPioneer',
    entryMode: 'hours',
    showsTimeEntry: true,
    monthlyGoalMinutes: 3000,
    creditCapMinutes: 3300,
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
} satisfies ScribeContextWire

const tools: ToolDefinitionWire[] = [
  {
    name: 'time_log',
    description: 'Log time.',
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
]

const user = (text: string): WireMessage => ({
  role: 'user',
  at: '2026-10-21T09:30:00-05:00',
  content: [{ type: 'text', text }],
})

const input = (change: Partial<BudgetInput> = {}): BudgetInput => ({
  lastInputTokens: null,
  messagesAtLastStep: 0,
  messages: [],
  context,
  tools,
  maxInputTokens: 10_000,
  contextFull: false,
  ...change,
})

describe('estimatedInputTokens', () => {
  it('counts bytes / 3, rounded up', () => {
    expect(tokensForBytes(0)).toBe(0)
    expect(tokensForBytes(1)).toBe(1)
    expect(tokensForBytes(3)).toBe(1)
    expect(tokensForBytes(4)).toBe(2)
    expect(jsonBytes({ a: 'é' })).toBe(10)
  })

  it('before any step: system prompt + tools and context + every message', () => {
    const messages = [user('Log an hour for today')]
    expect(estimatedInputTokens(input({ messages }))).toBe(
      SYSTEM_PROMPT_TOKEN_ESTIMATE +
        tokensForBytes(jsonBytes(tools) + jsonBytes(context)) +
        tokensForBytes(jsonBytes(messages[0]))
    )
  })

  it('after a step: its input tokens + messages since + the pending text', () => {
    const messages = [user('first'), user('second'), user('third')]
    const estimate = estimatedInputTokens(
      input({
        lastInputTokens: 4_000,
        messagesAtLastStep: 2,
        messages,
        pendingBytes: 30,
      })
    )
    expect(estimate).toBe(4_000 + tokensForBytes(jsonBytes(messages[2]) + 30))
  })

  it('counts the pending text before the first step too', () => {
    const base = estimatedInputTokens(input())
    expect(estimatedInputTokens(input({ pendingBytes: 300 }))).toBe(base + 100)
  })
})

describe('budgetState', () => {
  const at = (tokens: number) =>
    budgetState(input({ lastInputTokens: tokens, messagesAtLastStep: 0 }))

  it('is ok below 75 % of maxInputTokens', () => {
    expect(at(7_499)).toBe('ok')
  })

  it('is nearFull from 75 %', () => {
    expect(at(7_500)).toBe('nearFull')
    expect(at(8_999)).toBe('nearFull')
  })

  it('is full from 90 %', () => {
    expect(at(9_000)).toBe('full')
    expect(at(20_000)).toBe('full')
  })

  it('includes what is about to be sent', () => {
    expect(
      budgetState(
        input({
          lastInputTokens: 8_900,
          messagesAtLastStep: 0,
          pendingBytes: 300,
        })
      )
    ).toBe('full')
  })

  it('is full after a 413 context_full, whatever the estimate', () => {
    expect(budgetState(input({ contextFull: true }))).toBe('full')
  })

  it('stays ok with no known limit', () => {
    expect(
      budgetState(input({ lastInputTokens: 50_000, maxInputTokens: 0 }))
    ).toBe('ok')
  })
})
