import type { AnalyticsEvent, AnalyticsValue } from '../analytics'
import type { DropReason, ScribePlan, StepFinish, WireMessage } from './wire'

/**
 * Scribe AI's server events (protocol: Logging and privacy). One JSON log
 * line per step and per page, and the same fields to PostHog as
 * `api_scribe_step` / `api_scribe_transcribe` (no person profile).
 *
 * Structural only: tool **names**, counts, finishes, usage, billed cost,
 * routing, timing, the validation rule, the error code, the conversation and
 * turn ULIDs, and a coarse gap since the previous turn.
 * Never message text, the context, tool descriptions or schemas, tool-call
 * arguments, tool results, Refs, names, the Authorization header, images, or
 * transcribed text, or territory notes (counts only).
 */

export const SCRIBE_EVENTS = {
  step: 'api_scribe_step',
  transcribe: 'api_scribe_transcribe',
  territoryNotes: 'api_scribe_territory_notes',
} as const

export type ScribePlatform = 'ios' | 'android' | 'dev' | 'web'

export interface StepLogFields {
  protocol: number | null
  step: number | null
  plan: ScribePlan | null
  platform: ScribePlatform
  appVersion: string | null
  conversationId: string | null
  turnId: string | null
  offered: string[]
  dropped: { name: string; reason: DropReason }[]
  /** Names of the tool calls sent, in order. */
  toolCalls: string[]
  unknownToolCalls: number
  invalidArgsCalls: number
  finish: StepFinish | null
  inputTokens: number
  cachedInputTokens: number
  cacheWriteTokens: number
  outputTokens: number
  reasoningTokens: number
  units: number
  usageEstimated: boolean
  /** OpenRouter's billed USD for the step's calls; null when unreported. */
  costUsd: number | null
  /** Step 0 of a turn after the first: the gap since the previous turn (`turnGap`). */
  turnGap: TurnGap | null
  model: string | null
  provider: string | null
  latencyMs: number
  ttftMs: number | null
  tainted: boolean
  grace: boolean
  retriedWithoutReasoning: boolean
  /**
   * The host blocked the input as a prompt injection: `withheld` (answered
   * without the untrusted text) or `refused`.
   */
  injectionBlock: 'withheld' | 'refused' | null
  /** The validation rule that refused the request. */
  rule: string | null
  /** The refusal or stream error code; null for a `done` step. */
  errorCode: string | null
}

/** Minutes since the previous turn, bucketed: does the prompt cache (≥ 30 min) outlast it? */
export type TurnGap = '<5' | '5-30' | '30-120' | '>120'

const MINUTE_MS = 60_000

/**
 * On step 0 of a turn after the first, the gap between the turn's user message
 * and the one before, from their `at` times (the previous turn ended seconds
 * after its message, so this is the cache's idle time, coarsely). Null on any
 * other step, the first turn, or times that don't parse or run backwards.
 */
export const turnGap = (messages: WireMessage[], step: number): TurnGap | null => {
  if (step !== 0) return null
  const times = messages.flatMap((message) =>
    message.role === 'user' ? [Date.parse(message.at)] : []
  )
  if (times.length < 2) return null
  const gap = times[times.length - 1] - times[times.length - 2]
  if (!Number.isFinite(gap) || gap < 0) return null
  if (gap < 5 * MINUTE_MS) return '<5'
  if (gap < 30 * MINUTE_MS) return '5-30'
  if (gap < 120 * MINUTE_MS) return '30-120'
  return '>120'
}

const stepProperties = (fields: StepLogFields): Record<string, AnalyticsValue> => ({
  protocol: fields.protocol,
  step: fields.step,
  plan: fields.plan,
  platform: fields.platform,
  app_version: fields.appVersion,
  conversation_id: fields.conversationId,
  turn_id: fields.turnId,
  offered: fields.offered.join(','),
  offered_count: fields.offered.length,
  dropped: fields.dropped.map((tool) => `${tool.name}:${tool.reason}`).join(','),
  tool_calls: fields.toolCalls.join(','),
  tool_call_count: fields.toolCalls.length,
  unknown_tool_calls: fields.unknownToolCalls,
  invalid_args_calls: fields.invalidArgsCalls,
  finish: fields.finish,
  input_tokens: fields.inputTokens,
  cached_input_tokens: fields.cachedInputTokens,
  cache_write_tokens: fields.cacheWriteTokens,
  output_tokens: fields.outputTokens,
  reasoning_tokens: fields.reasoningTokens,
  units: fields.units,
  usage_estimated: fields.usageEstimated,
  cost_usd: fields.costUsd,
  turn_gap: fields.turnGap,
  model: fields.model,
  provider: fields.provider,
  latency_ms: fields.latencyMs,
  ttft_ms: fields.ttftMs,
  tainted: fields.tainted,
  grace: fields.grace,
  retried_without_reasoning: fields.retriedWithoutReasoning,
  injection_block: fields.injectionBlock,
  rule: fields.rule,
  error_code: fields.errorCode,
})

export const scribeStepEvent = (
  distinctId: string,
  fields: StepLogFields
): AnalyticsEvent => ({
  event: SCRIBE_EVENTS.step,
  distinctId,
  properties: stepProperties(fields),
})

/** The step's one log line: the event's properties as JSON. */
export const scribeStepLogLine = (fields: StepLogFields): string =>
  JSON.stringify({ event: SCRIBE_EVENTS.step, ...stepProperties(fields) })

export interface TranscribeLogFields {
  plan: ScribePlan | null
  platform: ScribePlatform
  mimeType: string | null
  /** Decoded image size, bucketed. */
  bytes: number | null
  textChars: number
  truncated: boolean
  inputTokens: number
  cachedInputTokens: number
  cacheWriteTokens: number
  outputTokens: number
  units: number
  costUsd: number | null
  model: string | null
  provider: string | null
  latencyMs: number
  errorCode: string | null
}

const bytesBucket = (bytes: number | null): string | null => {
  if (bytes == null) return null
  if (bytes < 256 * 1024) return '<256k'
  if (bytes < 1024 * 1024) return '256k-1m'
  if (bytes < 2 * 1024 * 1024) return '1-2m'
  return '2m+'
}

const transcribeProperties = (fields: TranscribeLogFields): Record<string, AnalyticsValue> => ({
  plan: fields.plan,
  platform: fields.platform,
  mime_type: fields.mimeType,
  bytes: bytesBucket(fields.bytes),
  text_chars: fields.textChars,
  truncated: fields.truncated,
  input_tokens: fields.inputTokens,
  cached_input_tokens: fields.cachedInputTokens,
  cache_write_tokens: fields.cacheWriteTokens,
  output_tokens: fields.outputTokens,
  units: fields.units,
  cost_usd: fields.costUsd,
  model: fields.model,
  provider: fields.provider,
  latency_ms: fields.latencyMs,
  error_code: fields.errorCode,
})

export const scribeTranscribeEvent = (
  distinctId: string,
  fields: TranscribeLogFields
): AnalyticsEvent => ({
  event: SCRIBE_EVENTS.transcribe,
  distinctId,
  properties: transcribeProperties(fields),
})

export const scribeTranscribeLogLine = (fields: TranscribeLogFields): string =>
  JSON.stringify({ event: SCRIBE_EVENTS.transcribe, ...transcribeProperties(fields) })

export interface TerritoryNotesLogFields {
  plan: ScribePlan | null
  platform: ScribePlatform
  /** Non-blank lines in the notes. */
  lines: number
  notesChars: number
  streets: number
  doors: number
  ranges: number
  unread: number
  /** Items the model returned that failed validation. */
  dropped: number
  /** The model answered with something other than the JSON asked for. */
  malformed: boolean
  truncated: boolean
  inputTokens: number
  cachedInputTokens: number
  cacheWriteTokens: number
  outputTokens: number
  units: number
  usageEstimated: boolean
  costUsd: number | null
  model: string | null
  provider: string | null
  latencyMs: number
  rule: string | null
  errorCode: string | null
}

const charsBucket = (chars: number): string =>
  chars < 200 ? '<200' : chars < 1_000 ? '200-1k' : chars < 4_000 ? '1-4k' : '4k+'

const territoryNotesProperties = (
  fields: TerritoryNotesLogFields
): Record<string, AnalyticsValue> => ({
  plan: fields.plan,
  platform: fields.platform,
  lines: fields.lines,
  notes_chars: charsBucket(fields.notesChars),
  streets: fields.streets,
  doors: fields.doors,
  ranges: fields.ranges,
  unread: fields.unread,
  dropped: fields.dropped,
  malformed: fields.malformed,
  truncated: fields.truncated,
  input_tokens: fields.inputTokens,
  cached_input_tokens: fields.cachedInputTokens,
  cache_write_tokens: fields.cacheWriteTokens,
  output_tokens: fields.outputTokens,
  units: fields.units,
  usage_estimated: fields.usageEstimated,
  cost_usd: fields.costUsd,
  model: fields.model,
  provider: fields.provider,
  latency_ms: fields.latencyMs,
  rule: fields.rule,
  error_code: fields.errorCode,
})

export const scribeTerritoryNotesEvent = (
  distinctId: string,
  fields: TerritoryNotesLogFields
): AnalyticsEvent => ({
  event: SCRIBE_EVENTS.territoryNotes,
  distinctId,
  properties: territoryNotesProperties(fields),
})

export const scribeTerritoryNotesLogLine = (fields: TerritoryNotesLogFields): string =>
  JSON.stringify({ event: SCRIBE_EVENTS.territoryNotes, ...territoryNotesProperties(fields) })
