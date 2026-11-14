/**
 * Scribe AI's wire contract (witness-work `docs/scribe-ai-protocol.md`,
 * protocol 1): every request, response, and SSE event the app and ww-api
 * exchange. That document is normative; change it first, then these types.
 */

/** The highest protocol this code serves. The floor is KV `scribe:protocol-min`. */
export const SCRIBE_PROTOCOL_MAX = 1

// --- Errors -----------------------------------------------------------------

export type ScribeErrorCode =
  | 'bad_request'
  | 'invalid_tools'
  | 'step_limit'
  | 'unauthorized'
  | 'limit_reached'
  | 'suspended'
  | 'step_in_progress'
  | 'step_retry_limit'
  | 'too_large'
  | 'context_full'
  | 'upgrade_required'
  | 'rate_limited'
  | 'active_cap'
  | 'transcribe_limit'
  | 'server_error'
  | 'model_error'
  | 'disabled'
  | 'unavailable'

/** Codes an `error` event can carry once the stream started. */
export type ScribeStreamErrorCode = 'model_error' | 'model_timeout' | 'server_error'

export interface ScribeErrorBody {
  ok: false
  /** English, for logs; the app never shows it. */
  error: string
  code: ScribeErrorCode
  /** Seconds; mirrored in `Retry-After`. */
  retryAfter?: number
  /** On `limit_reached`, and on a territory-notes `model_error` that was charged. */
  usage?: UsageSnapshot
  /** Dev-bypass callers only. */
  detail?: string
}

// --- Usage ------------------------------------------------------------------

export type ScribePlan = 'free' | 'supporter'
export type UsageWindowId = 'session' | 'weekly' | 'monthly'

export interface UsageWindow {
  id: UsageWindowId
  /** Floor(used * 100 / limit), at least 1 when used > 0, at most 100. */
  percentUsed: number
  /** StartedAt + length while running; null before the first charge of a new window. */
  resetsAt: number | null
  /** Developer Tools only. The app never shows units. */
  units: { used: number; limit: number }
}

export interface UsageSnapshot {
  plan: ScribePlan
  /** RevenueCat unreachable while the account's record was stale: metered as free. */
  supporterCheckFailed: boolean
  /** The windows that limit this plan, shortest first. */
  windows: UsageWindow[]
  /** True when any window is at or over its limit. */
  limited: boolean
  /** When `limited`: when the latest-resetting full window resets. Else null. */
  resetsAt: number | null
  asOf: number
}

export type UsageResponse = { ok: true } & UsageSnapshot

// --- Status -----------------------------------------------------------------

export interface ScribeStatusLimits {
  maxInputTokens: number
  maxOutputTokens: number
  maxStepsPerTurn: number
  maxTools: number
  maxToolsBytes: number
  maxToolSchemaBytes: number
  maxToolDescriptionChars: number
  maxRequestBytes: number
  maxContextBytes: number
  maxUserTextChars: number
  maxToolResultBytes: number
  transcribe: { maxBytes: number; mimeTypes: string[] }
}

export interface ScribeStatusResponse {
  ok: true
  enabled: boolean
  reason: 'disabled' | 'no_provider' | null
  protocol: { min: number; max: number }
  minAppVersion: string | null
  disabledTools: string[]
  limits: ScribeStatusLimits
}

// --- Step request -----------------------------------------------------------

export type ToolAccess = 'read' | 'write' | 'destructive'

/** A JSON Schema object in the protocol's 2020-12 subset. */
export type JsonSchemaObject = Record<string, unknown>

export interface ToolDefinition {
  /** ^[a-z][a-z0-9]*(_[a-z0-9]+)+$, ≤ 48 chars, unique. */
  name: string
  /** Model-facing, English, 1..maxToolDescriptionChars. */
  description: string
  access: ToolAccess
  /** ≤ maxToolSchemaBytes serialized. */
  inputSchema: JsonSchemaObject
  /** True when results may carry text a person wrote. */
  returnsUntrustedText?: boolean
}

/** The client platform in `app.platform`; `web` is the browser app. */
export const SCRIBE_APP_PLATFORMS = ['ios', 'android', 'web'] as const
export type ScribeAppPlatform = (typeof SCRIBE_APP_PLATFORMS)[number]

export const isScribeAppPlatform = (value: unknown): value is ScribeAppPlatform =>
  SCRIBE_APP_PLATFORMS.includes(value as ScribeAppPlatform)

export interface ScribeAppInfo {
  version: string
  platform: ScribeAppPlatform
  locale: string
}

/**
 * The app's context snapshot. The server checks only its size and `v`; it
 * renders it verbatim as JSON in a user-role message ahead of the
 * conversation (`render.ts`).
 */
export type ScribeContextWire = { v: 1 } & Record<string, unknown>

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ToolCallBlock {
  type: 'tool_call'
  callId: string
  name: string
  args: Record<string, unknown>
}

export type ToolResultBlock =
  | {
      type: 'tool_result'
      callId: string
      name: string
      ok: true
      trust: 'app' | 'untrusted_text'
      data: unknown
    }
  | {
      type: 'tool_result'
      callId: string
      name: string
      ok: false
      error: string
    }

export type ProposalOutcome =
  | 'applied'
  | 'partially_applied'
  | 'dismissed'
  | 'superseded'
  | 'undone'
  | 'failed'

export interface ProposalOutcomeBlock {
  type: 'proposal_outcome'
  proposalId: string
  outcome: ProposalOutcome
  applied: string[]
  notApplied: string[]
  /** Pending Refs (`n1`) that now name a record, each with the applied call that proposed it. */
  created?: { callId: string; ref: string }[]
}

export type WireMessage =
  | { role: 'user'; at: string; content: (TextBlock | ProposalOutcomeBlock)[] }
  | { role: 'assistant'; content: (TextBlock | ToolCallBlock)[] }
  | { role: 'tool'; content: ToolResultBlock[] }

export interface ScribeStepRequest {
  protocol: number
  conversationId: string
  turnId: string
  step: number
  app: ScribeAppInfo
  tools: ToolDefinition[]
  context: ScribeContextWire
  messages: WireMessage[]
}

// --- Step response (SSE) ----------------------------------------------------

export type DropReason = 'disabled' | 'tainted'

export interface StartEvent {
  type: 'start'
  offered: string[]
  dropped: { name: string; reason: DropReason }[]
}

export interface TextEvent {
  type: 'text'
  delta: string
}

export interface ToolCallEvent {
  type: 'tool_call'
  callId: string
  name: string
  args: Record<string, unknown>
}

export type StepFinish = 'tool_calls' | 'end' | 'length' | 'refused'

export interface StepUsage {
  inputTokens: number
  cachedInputTokens: number
  /** Cache writes, part of the uncached input (protocol: Units). */
  cacheWriteTokens: number
  outputTokens: number
  reasoningTokens: number
  units: number
}

export interface DoneEvent {
  type: 'done'
  finish: StepFinish
  usage: StepUsage
  meter: UsageSnapshot
}

export interface ErrorEvent {
  type: 'error'
  code: ScribeStreamErrorCode
  message: string
  retryable: boolean
  /** When the call was charged. */
  meter?: UsageSnapshot
}

export type ScribeSseEvent =
  | StartEvent
  | TextEvent
  | ToolCallEvent
  | DoneEvent
  | ErrorEvent

// --- Transcribe -------------------------------------------------------------

export type TranscribeMimeType = 'image/jpeg' | 'image/png'

export interface TranscribeRequest {
  protocol: number
  /** Canonical base64. */
  image: string
  mimeType: TranscribeMimeType
}

export interface TranscribeResponse {
  ok: true
  text: string
  truncated: boolean
  usage: UsageSnapshot
}

// --- Territory notes --------------------------------------------------------

export type TerritoryDoorOutcome = 'notHome' | 'spoke' | 'doNotCall'

export interface TerritoryNotesRequestBody {
  protocol: number
  notes: string
  streets: { name: string; numbering: 'both' | 'odd' | 'even' | 'none' }[]
  locale: string
}

export interface TerritoryNotesResponse {
  ok: true
  doors: { line: number; street: string | null; door: string; outcome: TerritoryDoorOutcome }[]
  ranges: {
    line: number
    street: string | null
    from: number
    to: number
    side: 'all' | 'odd' | 'even'
    outcome: TerritoryDoorOutcome
  }[]
  unread: number[]
  usage: UsageSnapshot
}
