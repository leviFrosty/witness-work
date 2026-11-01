import type { ScribeContextBudgetState } from '@/features/scribe/types'
import {
  SCRIBE_BUDGET_FULL,
  SCRIBE_BUDGET_NEAR_FULL,
} from '@/features/scribe/constants'
import type {
  ScribeContextWire,
  ToolDefinitionWire,
  WireMessage,
} from '@/features/scribe/lib/wire'

export const SYSTEM_PROMPT_TOKEN_ESTIMATE = 2_000

const encoder = new TextEncoder()
export const jsonBytes = (value: unknown): number =>
  encoder.encode(JSON.stringify(value)).length

export const tokensForBytes = (bytes: number): number => Math.ceil(bytes / 3)

export interface BudgetInput {
  lastInputTokens: number | null

  messagesAtLastStep: number
  messages: readonly WireMessage[]
  context: ScribeContextWire | null
  tools: readonly ToolDefinitionWire[]
  maxInputTokens: number

  contextFull: boolean

  pendingBytes?: number
}

export function estimatedInputTokens(input: BudgetInput): number {
  const pending = tokensForBytes(
    input.messages
      .slice(input.lastInputTokens === null ? 0 : input.messagesAtLastStep)
      .reduce((sum, message) => sum + jsonBytes(message), 0) +
      (input.pendingBytes ?? 0)
  )
  if (input.lastInputTokens !== null) return input.lastInputTokens + pending
  return (
    SYSTEM_PROMPT_TOKEN_ESTIMATE +
    tokensForBytes(jsonBytes(input.tools) + jsonBytes(input.context)) +
    pending
  )
}

export function budgetState(input: BudgetInput): ScribeContextBudgetState {
  if (input.contextFull) return 'full'
  if (input.maxInputTokens <= 0) return 'ok'
  const ratio = estimatedInputTokens(input) / input.maxInputTokens
  if (ratio >= SCRIBE_BUDGET_FULL) return 'full'
  if (ratio >= SCRIBE_BUDGET_NEAR_FULL) return 'nearFull'
  return 'ok'
}
