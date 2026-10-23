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

/**
 * The server's static system prompt is capped at 2,000 tokens; the estimate
 * counts it at that cap so the device never thinks it has more room than it
 * does.
 */
export const SYSTEM_PROMPT_TOKEN_ESTIMATE = 2_000

const encoder = new TextEncoder()
export const jsonBytes = (value: unknown): number =>
  encoder.encode(JSON.stringify(value)).length

/** The protocol's estimate: `ceil(bytes / 3)`. */
export const tokensForBytes = (bytes: number): number => Math.ceil(bytes / 3)

export interface BudgetInput {
  /** `done.usage.inputTokens` of the last step, or null before any. */
  lastInputTokens: number | null
  /** Messages already in the last step's input. */
  messagesAtLastStep: number
  messages: readonly WireMessage[]
  context: ScribeContextWire | null
  tools: readonly ToolDefinitionWire[]
  maxInputTokens: number
  /** Ww-api answered 413 `context_full`. */
  contextFull: boolean
  /** Bytes about to be added (the composer's text). */
  pendingBytes?: number
}

/** The estimated input tokens of the next step. */
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

/**
 * Context budget (protocol: Context budget): `nearFull` from 75 % of
 * `maxInputTokens` (a banner; sending still works), `full` from 90 % or a 413
 * (the composer gives way to New conversation).
 */
export function budgetState(input: BudgetInput): ScribeContextBudgetState {
  if (input.contextFull) return 'full'
  if (input.maxInputTokens <= 0) return 'ok'
  const ratio = estimatedInputTokens(input) / input.maxInputTokens
  if (ratio >= SCRIBE_BUDGET_FULL) return 'full'
  if (ratio >= SCRIBE_BUDGET_NEAR_FULL) return 'nearFull'
  return 'ok'
}
