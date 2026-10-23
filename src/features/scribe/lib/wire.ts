/**
 * The Scribe AI wire contract, protocol 1 (docs/scribe-ai-protocol.md). Types
 * only: what the app sends to `/scribe/v1/*` and what ww-api answers. Unknown
 * fields are ignored on both sides, so every response type here lists only what
 * the app reads.
 */

export const SCRIBE_PROTOCOL = 1

// ---------------------------------------------------------------- tools

export type ToolAccess = 'read' | 'write' | 'destructive'

/** A JSON Schema object in the protocol's 2020-12 subset. */
export type JsonSchema = { [keyword: string]: JsonValue }
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export interface ToolDefinitionWire {
  name: string
  description: string
  access: ToolAccess
  inputSchema: JsonSchema
  returnsUntrustedText?: boolean
}

// ---------------------------------------------------------------- context

export interface ScribeContextWire {
  v: 1
  now: string
  tz: string
  locale: string
  weekStart: 0 | 1 | 2 | 3 | 4 | 5 | 6
  clock: '12h' | '24h'
  days: string[]
  publisher: {
    role: string
    entryMode: 'hours' | 'checkbox'
    showsTimeEntry: boolean
    monthlyGoalMinutes: number | null
    creditCapMinutes: number | null
  }
  month: {
    month: string
    loggedMinutes: number
    creditMinutes: number
    plannedRemainingMinutes: number
    studies: number
  }
  categories: string[]
  plans: string[]
  contacts: string[]
  contactsTruncated: boolean
  buddies: string[]
  dataProtection: boolean
  /**
   * Scribe AI's memory, one note a line (`lib/memory.ts`); null when the User
   * turned it off. Absent from contexts pinned before it existed.
   */
  memory?: string[] | null
}

// ---------------------------------------------------------------- messages

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
  /**
   * `applied`/`partially_applied`: the pending Refs (`n1`, `nk1`) that now name
   * a record, each with the applied call that proposed it.
   */
  created?: { callId: string; ref: string }[]
}

export type UserMessage = {
  role: 'user'
  at: string
  content: (TextBlock | ProposalOutcomeBlock)[]
}
export type AssistantMessage = {
  role: 'assistant'
  content: (TextBlock | ToolCallBlock)[]
}
export type ToolMessage = { role: 'tool'; content: ToolResultBlock[] }

export type WireMessage = UserMessage | AssistantMessage | ToolMessage

// ---------------------------------------------------------------- step

export interface StepRequest {
  protocol: typeof SCRIBE_PROTOCOL
  conversationId: string
  turnId: string
  step: number
  app: { version: string; platform: 'ios' | 'android'; locale: string }
  tools: ToolDefinitionWire[]
  context: ScribeContextWire
  messages: WireMessage[]
}

export interface UsageWindowWire {
  id: 'session' | 'weekly' | 'monthly'
  percentUsed: number
  resetsAt: number | null
  /** Developer Tools only. */
  units?: { used: number; limit: number }
}

export interface UsageSnapshotWire {
  plan: 'free' | 'supporter'
  supporterCheckFailed: boolean
  windows: UsageWindowWire[]
  limited: boolean
  resetsAt: number | null
  asOf: number
}

export interface StepUsageWire {
  inputTokens: number
  cachedInputTokens: number
  /**
   * Cache writes, part of the uncached input; 0 from servers that don't send
   * it.
   */
  cacheWriteTokens: number
  outputTokens: number
  reasoningTokens: number
  units: number
}

export type StepFinish = 'tool_calls' | 'end' | 'length' | 'refused'

export type StepStreamEvent =
  | {
      type: 'start'
      offered: string[]
      dropped: { name: string; reason: 'disabled' | 'tainted' }[]
    }
  | { type: 'text'; delta: string }
  | {
      type: 'tool_call'
      callId: string
      name: string
      args: Record<string, unknown>
    }
  | {
      type: 'done'
      finish: StepFinish
      usage: StepUsageWire
      meter: UsageSnapshotWire | null
    }
  | {
      type: 'error'
      code: string
      message: string
      retryable: boolean
      meter: UsageSnapshotWire | null
    }

export type StepTerminalEvent = Extract<
  StepStreamEvent,
  { type: 'done' } | { type: 'error' }
>

// ---------------------------------------------------------------- status

export interface ScribeLimitsWire {
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

export interface ScribeStatusWire {
  enabled: boolean
  reason: 'disabled' | 'no_provider' | null
  protocol: { min: number; max: number }
  minAppVersion: string | null
  disabledTools: string[]
  limits: ScribeLimitsWire
}

/** The protocol's defaults, used until the first status read succeeds. */
export const DEFAULT_SCRIBE_LIMITS: ScribeLimitsWire = {
  maxInputTokens: 48_000,
  maxOutputTokens: 4096,
  maxStepsPerTurn: 6,
  maxTools: 24,
  maxToolsBytes: 32_768,
  maxToolSchemaBytes: 4096,
  maxToolDescriptionChars: 1024,
  maxRequestBytes: 393_216,
  maxContextBytes: 16_384,
  maxUserTextChars: 32_000,
  maxToolResultBytes: 8192,
  transcribe: { maxBytes: 4_194_304, mimeTypes: ['image/jpeg', 'image/png'] },
}

// ---------------------------------------------------------------- transcribe

export interface TranscribeRequest {
  protocol: typeof SCRIBE_PROTOCOL
  image: string
  mimeType: 'image/jpeg' | 'image/png'
}

export interface TranscribeResponse {
  text: string
  truncated: boolean
  usage: UsageSnapshotWire | null
}

// ---------------------------------------------------------------- errors

/** Every `code` the protocol documents for a non-2xx envelope or `error` event. */
export type ScribeServerCode =
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
  | 'model_timeout'
  | 'disabled'
  | 'unavailable'
