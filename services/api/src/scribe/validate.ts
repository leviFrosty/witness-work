import type { ScribeLimits } from './config'
import { isScribeAppPlatform } from './wire'
import type {
  ScribeAppInfo,
  ScribeStepRequest,
  ToolDefinition,
  WireMessage,
} from './wire'

/**
 * Validation of a `/scribe/v1/step` request (protocol: Request, Tool
 * definitions, Messages). Every failure names the rule that failed, which is
 * logged; the payload never is. The server checks shape and size only: the
 * app parses every tool call with its own schema before anything runs.
 */

export type ValidationFailure = {
  ok: false
  status: 400 | 413
  code: 'bad_request' | 'invalid_tools' | 'step_limit' | 'too_large'
  /** The rule that failed, for logs and analytics. */
  rule: string
}

export type Validated<T> = { ok: true; value: T } | ValidationFailure

const fail = (
  code: ValidationFailure['code'],
  rule: string,
  status: 400 | 413 = code === 'too_large' ? 413 : 400
): ValidationFailure => ({ ok: false, status, code, rule })

const encoder = new TextEncoder()
export const utf8Bytes = (text: string): number => encoder.encode(text).byteLength
const jsonBytes = (value: unknown): number => utf8Bytes(JSON.stringify(value))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value)

export const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/
export const CALL_ID = /^[A-Za-z0-9_-]{1,64}$/
export const TOOL_NAME = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/
export const TOOL_NAME_MAX = 48
const PROPOSAL_ID = /^[A-Za-z0-9_-]{1,64}$/
const APP_VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/
const LOCALE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8}){0,4}$/
const LOCAL_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/

// --- Body ----------------------------------------------------------------------

/**
 * Reads a request body as text, refusing it past `maxBytes` (declared or
 * actual) without buffering more than that.
 */
export const readBodyText = async (
  request: Request,
  maxBytes: number
): Promise<{ ok: true; text: string } | { ok: false; tooLarge: boolean }> => {
  const declared = Number(request.headers.get('content-length') ?? NaN)
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, tooLarge: true }
  if (!request.body) return { ok: false, tooLarge: false }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return { ok: false, tooLarge: true }
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, text: new TextDecoder().decode(bytes) }
}

// --- Tools -----------------------------------------------------------------------

/** The protocol's JSON Schema keyword allowlist. */
export const ALLOWED_SCHEMA_KEYWORDS = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'description',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'pattern',
  'format',
  'anyOf',
  '$schema',
])

const JSON_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])
export const MAX_SCHEMA_DEPTH = 8

const typesOf = (node: Record<string, unknown>): string[] | null => {
  const type = node.type
  if (type === undefined) return []
  if (typeof type === 'string') return JSON_TYPES.has(type) ? [type] : null
  if (Array.isArray(type) && type.length > 0 && type.every((t) => typeof t === 'string' && JSON_TYPES.has(t)))
    return type as string[]
  return null
}

/**
 * One schema node and everything under it. Objects must close
 * (`additionalProperties: false`) and list every property in `required`
 * (strict-mode shape: an optional value is a union with null).
 */
const checkSchemaNode = (node: unknown, depth: number): string | null => {
  if (!isRecord(node)) return 'schema_node'
  if (depth > MAX_SCHEMA_DEPTH) return 'schema_depth'
  for (const keyword of Object.keys(node)) {
    if (!ALLOWED_SCHEMA_KEYWORDS.has(keyword)) return 'schema_keyword'
  }
  const types = typesOf(node)
  if (types == null) return 'schema_type'
  for (const keyword of ['description', 'pattern', 'format', '$schema'] as const) {
    if (keyword in node && typeof node[keyword] !== 'string') return 'schema_keyword_value'
  }
  for (const keyword of ['minimum', 'maximum'] as const) {
    if (keyword in node && (typeof node[keyword] !== 'number' || !Number.isFinite(node[keyword])))
      return 'schema_keyword_value'
  }
  for (const keyword of ['minLength', 'maxLength', 'minItems', 'maxItems'] as const) {
    if (keyword in node && !(Number.isInteger(node[keyword]) && (node[keyword] as number) >= 0))
      return 'schema_keyword_value'
  }
  if (typeof node.pattern === 'string') {
    try {
      new RegExp(node.pattern, 'u')
    } catch {
      return 'schema_pattern'
    }
  }
  if ('enum' in node && !(Array.isArray(node.enum) && node.enum.length > 0)) return 'schema_keyword_value'

  const isObject = types.includes('object') || 'properties' in node
  if (isObject) {
    if (node.additionalProperties !== false) return 'schema_additional_properties'
    const properties = node.properties ?? {}
    if (!isRecord(properties)) return 'schema_properties'
    const required = node.required ?? []
    if (!Array.isArray(required) || !required.every((name) => typeof name === 'string'))
      return 'schema_required'
    const names = Object.keys(properties)
    if (names.some((name) => !required.includes(name))) return 'schema_strict'
    if (required.some((name) => !names.includes(name as string))) return 'schema_required'
    for (const child of Object.values(properties)) {
      const failure = checkSchemaNode(child, depth + 1)
      if (failure) return failure
    }
  } else if ('additionalProperties' in node || 'required' in node) {
    return 'schema_keyword_value'
  }
  if ('items' in node) {
    const failure = checkSchemaNode(node.items, depth + 1)
    if (failure) return failure
  }
  if ('anyOf' in node) {
    if (!Array.isArray(node.anyOf) || node.anyOf.length === 0) return 'schema_any_of'
    for (const option of node.anyOf) {
      const failure = checkSchemaNode(option, depth + 1)
      if (failure) return failure
    }
  }
  return null
}

/** A tool's input schema: the root rule, then every node. Null when valid. */
export const checkInputSchema = (schema: unknown, maxBytes: number): string | null => {
  if (!isRecord(schema)) return 'schema_root'
  if (jsonBytes(schema) > maxBytes) return 'schema_bytes'
  if (
    schema.type !== 'object' ||
    !isRecord(schema.properties) ||
    !Array.isArray(schema.required) ||
    schema.additionalProperties !== false
  )
    return 'schema_root'
  return checkSchemaNode(schema, 1)
}

/** The protocol's tool rules; `invalid_tools` names the first one that fails. */
export const validateTools = (
  tools: unknown,
  limits: Pick<
    ScribeLimits,
    'maxTools' | 'maxToolsBytes' | 'maxToolSchemaBytes' | 'maxToolDescriptionChars'
  >
): Validated<ToolDefinition[]> => {
  const invalid = (rule: string) => fail('invalid_tools', rule)
  if (!Array.isArray(tools)) return invalid('tools_array')
  if (tools.length > limits.maxTools) return invalid('tools_count')
  if (jsonBytes(tools) > limits.maxToolsBytes) return invalid('tools_bytes')
  const seen = new Set<string>()
  const definitions: ToolDefinition[] = []
  for (const tool of tools) {
    if (!isRecord(tool)) return invalid('tool_shape')
    // Unknown fields are ignored (protocol: Conventions) and never forwarded.
    const { name, description, access, inputSchema, returnsUntrustedText } = tool
    if (typeof name !== 'string' || name.length > TOOL_NAME_MAX || !TOOL_NAME.test(name))
      return invalid('tool_name')
    if (seen.has(name)) return invalid('tool_name_unique')
    seen.add(name)
    if (
      typeof description !== 'string' ||
      description.length < 1 ||
      description.length > limits.maxToolDescriptionChars
    )
      return invalid('tool_description')
    if (access !== 'read' && access !== 'write' && access !== 'destructive')
      return invalid('tool_access')
    if (returnsUntrustedText !== undefined && typeof returnsUntrustedText !== 'boolean')
      return invalid('tool_untrusted')
    const schemaFailure = checkInputSchema(inputSchema, limits.maxToolSchemaBytes)
    if (schemaFailure) return invalid(schemaFailure)
    definitions.push({
      name,
      description,
      access,
      inputSchema: inputSchema as Record<string, unknown>,
      ...(returnsUntrustedText === true ? { returnsUntrustedText: true } : {}),
    })
  }
  return { ok: true, value: definitions }
}

// --- Messages ------------------------------------------------------------------

const OUTCOMES = new Set([
  'applied',
  'partially_applied',
  'dismissed',
  'superseded',
  'undone',
  'failed',
])

const isCallIdList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= 256 && value.every((id) => typeof id === 'string' && CALL_ID.test(id))

const REF = /^[a-z]{1,2}\d{1,6}$/

/** `created`: absent, or Refs each named by one of the `applied` calls. */
const isCreatedList = (value: unknown, applied: string[]): boolean =>
  value === undefined ||
  (Array.isArray(value) &&
    value.length <= 256 &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.callId === 'string' &&
        applied.includes(entry.callId) &&
        typeof entry.ref === 'string' &&
        REF.test(entry.ref)
    ))

/**
 * The message rules (protocol: Messages): shapes; a user message has at least
 * one block and ≤ `maxUserTextChars` of text; every `tool_call` is answered
 * by exactly one `tool_result` with its `callId` in the very next message,
 * which is a `tool` message; each result ≤ `maxToolResultBytes`; step 0 ends
 * with the user's message and a later step with tool results.
 */
export const validateMessages = (
  messages: unknown,
  step: number,
  limits: Pick<ScribeLimits, 'maxUserTextChars' | 'maxToolResultBytes'>
): Validated<WireMessage[]> => {
  const bad = (rule: string) => fail('bad_request', rule)
  if (!Array.isArray(messages) || messages.length === 0) return bad('messages')
  const out: WireMessage[] = []
  let pending: Set<string> | null = null
  for (const message of messages) {
    if (!isRecord(message) || !Array.isArray(message.content)) return bad('message_shape')
    const { role, content } = message
    if (pending && role !== 'tool') return bad('tool_result_missing')
    if (role === 'user') {
      if (typeof message.at !== 'string' || !LOCAL_ISO.test(message.at)) return bad('user_at')
      if (content.length === 0) return bad('user_empty')
      let chars = 0
      for (const [index, block] of content.entries()) {
        if (!isRecord(block)) return bad('user_block')
        if (block.type === 'text') {
          if (typeof block.text !== 'string') return bad('user_block')
          chars += block.text.length
        } else if (block.type === 'proposal_outcome') {
          if (
            index !== 0 ||
            typeof block.proposalId !== 'string' ||
            !PROPOSAL_ID.test(block.proposalId) ||
            !OUTCOMES.has(block.outcome as string) ||
            !isCallIdList(block.applied) ||
            !isCallIdList(block.notApplied) ||
            !isCreatedList(block.created, block.applied)
          )
            return bad('proposal_outcome')
        } else return bad('user_block')
      }
      if (chars > limits.maxUserTextChars) return bad('user_text_chars')
      out.push(message as WireMessage)
    } else if (role === 'assistant') {
      const calls = new Set<string>()
      for (const block of content) {
        if (!isRecord(block)) return bad('assistant_block')
        if (block.type === 'text') {
          if (typeof block.text !== 'string') return bad('assistant_block')
        } else if (block.type === 'tool_call') {
          if (
            typeof block.callId !== 'string' ||
            !CALL_ID.test(block.callId) ||
            typeof block.name !== 'string' ||
            !TOOL_NAME.test(block.name) ||
            !isRecord(block.args)
          )
            return bad('tool_call')
          if (calls.has(block.callId)) return bad('tool_call_duplicate')
          calls.add(block.callId)
        } else return bad('assistant_block')
      }
      pending = calls.size > 0 ? calls : null
      out.push(message as WireMessage)
    } else if (role === 'tool') {
      if (!pending) return bad('tool_result_orphan')
      for (const block of content) {
        if (
          !isRecord(block) ||
          block.type !== 'tool_result' ||
          typeof block.callId !== 'string' ||
          typeof block.name !== 'string'
        )
          return bad('tool_result')
        if (block.ok === true) {
          if (block.trust !== 'app' && block.trust !== 'untrusted_text') return bad('tool_result')
          if (!('data' in block)) return bad('tool_result')
        } else if (block.ok === false) {
          if (typeof block.error !== 'string') return bad('tool_result')
        } else return bad('tool_result')
        if (!pending.delete(block.callId)) return bad('tool_result_unmatched')
        if (jsonBytes(block) > limits.maxToolResultBytes) return bad('tool_result_bytes')
      }
      if (pending.size > 0) return bad('tool_result_missing')
      pending = null
      out.push(message as WireMessage)
    } else return bad('message_role')
  }
  if (pending) return bad('tool_result_missing')
  const last = out[out.length - 1]
  if (step === 0 ? last.role !== 'user' : last.role !== 'tool') return bad('last_message')
  return { ok: true, value: out }
}

// --- Request -----------------------------------------------------------------------

/** The fields every step body carries, before the tools and messages. */
export const validateStepEnvelope = (
  body: Record<string, unknown>,
  limits: Pick<ScribeLimits, 'maxStepsPerTurn' | 'maxContextBytes'>
): ValidationFailure | null => {
  const bad = (rule: string) => fail('bad_request', rule)
  if (typeof body.conversationId !== 'string' || !ULID.test(body.conversationId))
    return bad('conversation_id')
  if (typeof body.turnId !== 'string' || !ULID.test(body.turnId)) return bad('turn_id')
  if (!Number.isInteger(body.step) || (body.step as number) < 0) return bad('step')
  if ((body.step as number) >= limits.maxStepsPerTurn) return fail('step_limit', 'step_limit')
  const app = body.app
  if (
    !isRecord(app) ||
    typeof app.version !== 'string' ||
    !APP_VERSION.test(app.version) ||
    !isScribeAppPlatform(app.platform) ||
    typeof app.locale !== 'string' ||
    !LOCALE.test(app.locale)
  )
    return bad('app')
  if (!isRecord(body.context) || body.context.v !== 1) return bad('context')
  if (jsonBytes(body.context) > limits.maxContextBytes) return fail('too_large', 'context_bytes')
  return null
}

/**
 * Everything after the protocol check: the envelope, the tools, and the
 * messages, in that order. The body was already read under `maxRequestBytes`.
 */
export const validateStepRequest = (
  body: Record<string, unknown>,
  limits: ScribeLimits
): Validated<ScribeStepRequest> => {
  const envelope = validateStepEnvelope(body, limits)
  if (envelope) return envelope
  const tools = validateTools(body.tools, limits)
  if (!tools.ok) return tools
  const messages = validateMessages(body.messages, body.step as number, limits)
  if (!messages.ok) return messages
  const app = body.app as Record<string, string>
  return {
    ok: true,
    value: {
      protocol: body.protocol as number,
      conversationId: body.conversationId as string,
      turnId: body.turnId as string,
      step: body.step as number,
      app: {
        version: app.version,
        platform: app.platform as ScribeAppInfo['platform'],
        locale: app.locale,
      },
      tools: tools.value,
      context: body.context as ScribeStepRequest['context'],
      messages: messages.value,
    },
  }
}

// --- Estimate --------------------------------------------------------------------

/**
 * The context estimate (protocol: Enforcement):
 * `ceil(bytes(system prompt + tools + context + messages) / 3)`.
 */
export const estimateInputTokens = (
  systemPrompt: string,
  request: Pick<ScribeStepRequest, 'tools' | 'context' | 'messages'>
): number =>
  Math.ceil(
    (utf8Bytes(systemPrompt) +
      jsonBytes(request.tools) +
      jsonBytes(request.context) +
      jsonBytes(request.messages)) /
      3
  )
