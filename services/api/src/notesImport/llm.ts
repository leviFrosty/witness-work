import {
  streamText,
  Output,
  jsonSchema,
  type LanguageModelUsage,
} from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { NOTES_IMPORT_INSTRUCTIONS, buildNotesImportContext } from './prompt'
import {
  type NotesImportContext,
  type NotesImportResult,
} from './schema'
import type { NotesImportConfig } from './config'
import { NOTES_IMPORT_MODEL_SCHEMA, parseNotesImportModelResult } from './modelSchema'

export interface RefinementInput {
  /** The model's previous full result, as the JSON string the client cached. */
  previousResultJSON: string
  /** The user's natural-language correction (e.g. "Maria's visit was Tuesday"). */
  instruction: string
}

/**
 * A best-effort signal emitted WHILE the model streams, purely so the client can
 * show that work is happening. Never affects the returned result — the
 * structured object always comes from `result.output`, never assembled from
 * these deltas (see ADR / docs/notes-import-streaming-durable-objects.md).
 */
export type ModelProgress =
  | { kind: 'phase'; phase: 'starting' | 'thinking' | 'structuring' }
  | { kind: 'reasoning'; text: string }
  | { kind: 'progress'; chars: number }

export interface RunModelArgs {
  apiKey: string
  config: NotesImportConfig
  /** The notes being parsed (original notes for a refinement). */
  notesText: string
  context: NotesImportContext
  refinement?: RefinementInput
  abortSignal?: AbortSignal
  /** Optional live progress sink. Absent on the legacy synchronous path. */
  onProgress?: (p: ModelProgress) => void
}

export interface RunModelOutput {
  result: NotesImportResult
  usage: LanguageModelUsage
  /** Which underlying provider OpenRouter actually used (for ZDR audit logs). */
  resolvedProvider?: string
}

/** Keep the same notes prefix for an initial import and every refinement. */
const buildUserPrompt = (
  notesText: string,
  refinement?: RefinementInput
): string => {
  const notes = `<ORIGINAL NOTES>\n${notesText}\n</ORIGINAL NOTES>`
  if (!refinement) return notes
  return `${notes}

You previously produced this structured result for the notes above:

<PREVIOUS RESULT>
${refinement.previousResultJSON}
</PREVIOUS RESULT>

The user has a correction. Apply it and return a FRESH, COMPLETE structured
result for the ORIGINAL notes above — not a diff, the whole object — with the
correction incorporated. Keep everything else the same unless the correction
implies otherwise.

<USER CORRECTION>
${refinement.instruction}
</USER CORRECTION>`
}

/** Emit a `progress` tick at most every N streamed output chars. */
const PROGRESS_CHAR_STRIDE = 400

/** Include the failed thinking attempt in the run's billed token totals. */
const combinedUsage = (first: LanguageModelUsage, second: LanguageModelUsage): LanguageModelUsage => {
  const sum = (a: number | undefined, b: number | undefined) =>
    a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0)
  const cacheReadTokens = sum(first.inputTokenDetails.cacheReadTokens, second.inputTokenDetails.cacheReadTokens)
  const reasoningTokens = sum(first.outputTokenDetails.reasoningTokens, second.outputTokenDetails.reasoningTokens)
  return {
    inputTokens: sum(first.inputTokens, second.inputTokens),
    outputTokens: sum(first.outputTokens, second.outputTokens),
    totalTokens: sum(first.totalTokens, second.totalTokens),
    inputTokenDetails: {
      noCacheTokens: sum(first.inputTokenDetails.noCacheTokens, second.inputTokenDetails.noCacheTokens),
      cacheReadTokens,
      cacheWriteTokens: sum(first.inputTokenDetails.cacheWriteTokens, second.inputTokenDetails.cacheWriteTokens),
    },
    outputTokenDetails: {
      textTokens: sum(first.outputTokenDetails.textTokens, second.outputTokenDetails.textTokens),
      reasoningTokens,
    },
    cachedInputTokens: cacheReadTokens,
    reasoningTokens,
  }
}

/**
 * Runs the notes-import model through OpenRouter, streaming. Routing is pinned to
 * the configured provider allowlist with `zdr: true` and `data_collection:
 * 'deny'`, so the request only reaches a zero-data-retention host (ADR 0008) —
 * falling back across the allowlist but never to a non-ZDR provider, and failing
 * the request rather than leaking to one.
 *
 * Uses the AI SDK v6 `streamText` + `Output.object` API (the non-deprecated
 * successor to `generateObject`): the model is still forced to the
 * NOTES_IMPORT_SCHEMA shape and `result.output` resolves to the parsed object
 * (throwing on a non-conforming response). The `fullStream` is drained ONLY to
 * surface progress via `onProgress`; the structured result is never built from
 * those deltas.
 *
 * Reasoning is ON by default at `low` (`config.reasoningEffort`). The model
 * co-emits reasoning and strict JSON, but some ZDR hosts
 * ship a buggy reasoning parser that misroutes the final JSON into the reasoning
 * channel and returns a blank completion (cf. the vLLM deepseek reasoning-parser
 * bug). When that happens `result.output` rejects, so we recover the
 * schema-shaped object from the buffered reasoning text (`recoverNotesImportJson`)
 * before giving up — the answer was complete, just on the wrong channel.
 */
export const runNotesImportModel = async ({
  apiKey,
  config,
  notesText,
  context,
  refinement,
  abortSignal,
  onProgress,
}: RunModelArgs): Promise<RunModelOutput> => {
  const openrouter = createOpenRouter({ apiKey })

  onProgress?.({ kind: 'phase', phase: 'starting' })

  const result = streamText({
    model: openrouter(config.model, { structuredOutputs: { strict: true } }),
    output: Output.object({
      schema: jsonSchema<NotesImportResult>(
        NOTES_IMPORT_MODEL_SCHEMA,
        {
          validate: (value) => {
            const parsed = parseNotesImportModelResult(value)
            return parsed.success
              ? { success: true, value: parsed.data as NotesImportResult }
              : { success: false, error: new Error('Invalid Notes Import result') }
          },
        }
      ),
      name: 'NotesImport',
      description:
        'Structured WitnessWork records parsed from free-form ministry notes.',
    }),
    // Stable instructions first, then per-user context; OpenRouter hosts can
    // reuse a prefix without provider-specific cache markers.
    system: `${NOTES_IMPORT_INSTRUCTIONS}\n\n${buildNotesImportContext(context)}`,
    prompt: buildUserPrompt(notesText, refinement),
    // Azure GPT-6 Luna does not support temperature. Strict parameter routing
    // would exclude every allowlisted endpoint if we sent it.
    maxOutputTokens: config.maxOutputTokens,
    maxRetries: 2,
    abortSignal,
    providerOptions: {
      openrouter: {
        // HARD ZDR INVARIANT (ADR 0008): `zdr: true` + `data_collection: 'deny'`
        // are global filters OpenRouter applies to every candidate (including
        // fallbacks), so routing can never reach a data-retaining host. `only`
        // pins to the vetted Western allowlist (jurisdiction bound); `order`
        // makes the SAME list a priority sequence, so the preferred host
        // (Fireworks — verified genuine reasoning) is tried first and a 429/error
        // falls back to the next Western host (DigitalOcean) WITHOUT escaping the
        // allowlist. If none can serve, the request errors.
        provider: {
          only: config.providers,
          order: config.providers,
          data_collection: 'deny',
          zdr: true,
          allow_fallbacks: true,
          require_parameters: true,
        },
        // Thinking stays on at the configured effort. An explicit off override
        // must disable the model's default thinking. If a host misroutes
        // the JSON into the reasoning channel (blank completion), the recovery
        // path below salvages it. See the function-level doc.
        reasoning: config.reasoningEffort
          ? { enabled: true, effort: config.reasoningEffort }
          : { enabled: false },
      },
    },
  })

  // Drain the stream for progress ONLY. Phases fire on first reasoning/text.
  // `reasoningBuffer` accumulates the raw reasoning text so the recovery path
  // can salvage the JSON if a buggy provider parser misroutes it there.
  let chars = 0
  let lastTickAt = 0
  let sawText = false
  let sawReasoning = false
  let reasoningBuffer = ''
  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-start') {
      if (!sawReasoning) {
        sawReasoning = true
        onProgress?.({ kind: 'phase', phase: 'thinking' })
      }
    } else if (part.type === 'reasoning-delta') {
      if (part.text) {
        reasoningBuffer += part.text
        onProgress?.({ kind: 'reasoning', text: part.text })
      }
    } else if (part.type === 'text-delta') {
      if (!sawText) {
        sawText = true
        onProgress?.({ kind: 'phase', phase: 'structuring' })
      }
      chars += part.text.length
      if (chars - lastTickAt >= PROGRESS_CHAR_STRIDE) {
        lastTickAt = chars
        onProgress?.({ kind: 'progress', chars })
      }
    }
  }

  // Usage + routing resolve independently of output parsing — read them first so
  // we can log reasoning-token spend even when the structured parse needs the
  // recovery fallback below.
  const usage = await result.usage
  const providerMetadata = await result.providerMetadata
  const resolvedProvider = (
    providerMetadata?.openrouter as { provider?: string } | undefined
  )?.provider

  const finishReason = await result.finishReason

  // The authoritative, schema-shaped object. `result.output` rejects on a
  // non-conforming (or blank) completion — which, with reasoning on, usually
  // means a buggy provider parser dumped the JSON into the reasoning channel.
  // Recover it from the reasoning buffer before surfacing the failure.
  let object: NotesImportResult
  let recovered = false
  try {
    object = await result.output
  } catch {
    // Only a completed, blank response can be the known channel-routing bug.
    // Never replace truncated or invalid nonblank output with a thinking draft.
    const salvaged =
      finishReason === 'stop' && !(await result.text).trim()
        ? recoverNotesImportJson(reasoningBuffer)
        : null
    if (!salvaged && finishReason === 'length' && config.reasoningEffort &&
      !(await result.text).trim() && !abortSignal?.aborted) {
      // The response budget was spent entirely on thinking. Retry once with
      // thinking explicitly off; a null effort prevents this branch recurring.
      // Nonblank truncated JSON and schema-invalid output never take this path.
      console.warn(
        `notes-import reasoning budget exhausted model=${config.model} ` +
          `provider=${resolvedProvider ?? 'unknown'} outputTokens=${usage.outputTokens ?? 0} retry=without-thinking`
      )
      const retry = await runNotesImportModel({
        apiKey, config: { ...config, reasoningEffort: null }, notesText, context,
        refinement, abortSignal,
        onProgress: (event) => {
          if (event.kind === 'phase' && event.phase === 'starting') return
          onProgress?.(event)
        },
      })
      return { ...retry, usage: combinedUsage(usage, retry.usage) }
    }
    if (!salvaged) {
      console.warn(
        `notes-import structured output failed model=${config.model} ` +
          `provider=${resolvedProvider ?? 'unknown'} finishReason=${finishReason} ` +
          `outputTokens=${usage.outputTokens ?? 0}`
      )
      // SDK parse/validation errors carry the raw model output in their
      // message/cause. Routes report errors to logs and Sentry, so replace that
      // exception rather than forwarding any imported content to telemetry.
      throw new Error('Invalid Notes Import structured output')
    }
    object = salvaged
    recovered = true
  }

  console.log(
    `notes-import model=${config.model} provider=${resolvedProvider ?? 'unknown'} ` +
      `finishReason=${finishReason} inputTokens=${usage.inputTokens ?? 0} ` +
      `cacheReadTokens=${usage.inputTokenDetails?.cacheReadTokens ?? 0} ` +
      `cacheWriteTokens=${usage.inputTokenDetails?.cacheWriteTokens ?? 0} ` +
      `reasoningTokens=${usage.outputTokenDetails?.reasoningTokens ?? 0} ` +
      `outputTokens=${usage.outputTokens ?? 0}` +
      (recovered ? ' recovered=reasoning-channel' : '')
  )

  return { result: object, usage, resolvedProvider }
}

/**
 * Salvage the structured result when a provider's reasoning parser misroutes the
 * final JSON into the reasoning channel (leaving the completion blank, so
 * `result.output` rejects). The reasoning buffer in that case holds the
 * complete, schema-shaped JSON. Strip any `<think>` wrapper, slice to the
 * outermost object, parse, and validate the entire schema. Returns null when
 * the buffer is not a usable result, so the caller surfaces the real error.
 */
const recoverNotesImportJson = (reasoning: string): NotesImportResult | null => {
  if (!reasoning) return null
  const unwrapped = reasoning.replace(/<\/?think>/gi, '')
  const start = unwrapped.indexOf('{')
  const end = unwrapped.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(unwrapped.slice(start, end + 1))
  } catch {
    return null
  }
  // Some misrouted completions omit the two presentation strings. Preserve the
  // existing compatibility defaults, then validate the entire nested contract.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null
  }
  const object = parsed as Record<string, unknown>
  const validated = parseNotesImportModelResult({
    ...object,
    summary: object.summary ?? '',
    assistantMessage: object.assistantMessage ?? '',
  })
  return validated.success ? validated.data as NotesImportResult : null
}
