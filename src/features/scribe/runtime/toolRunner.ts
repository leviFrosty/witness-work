import type { ScribeActivityArea } from '@/features/scribe/types'
import type {
  ScribeContextWire,
  ToolCallBlock,
  ToolResultBlock,
} from '@/features/scribe/lib/wire'
import { SCRIBE_READ_TIMEOUT_MS } from '@/features/scribe/constants'
import type {
  ReadResult,
  ScribeTool,
  ToolContext,
} from '@/features/scribe/tools/types'
import type { TurnDraft } from '@/features/scribe/proposals/draft'
import type { DraftEffect } from '@/features/scribe/proposals/model'
import type { ScribeStores } from '@/features/scribe/runtime/snapshot'
import { jsonBytes } from '@/features/scribe/runtime/budget'

export const READ_TIMEOUT_ERROR =
  'The app took too long; try a narrower request.'

export interface ToolRunOutcome {
  /** One result per call, in call order. */
  results: ToolResultBlock[]
  readCalls: number
  writeCalls: number
  /** Calls that failed: their names, and whether each was a write. */
  failed: { name: string; write: boolean }[]
  /** Write tools whose call succeeded, in order. */
  proposed: string[]
  /** Areas of the read tools that ran, in call order. */
  areas: ScribeActivityArea[]
  /** A read returned a person's text this step. */
  untrusted: boolean
  /**
   * A `refForLaterCalls` write returned a pending Ref that no other call in
   * this step used, so the model needs a step to use it.
   */
  awaitsRef: boolean
}

export const RESULT_TOO_LARGE_ERROR =
  'That result is too large. Ask for fewer items or a shorter range.'

/** What a result trimmed to fit says, beside `truncated: true`. */
export const truncatedHint = (shown: number, total: number) =>
  `Only the first ${shown} of ${total} fit. To see the rest, ask for a shorter range or fewer items.`

/**
 * A read result that fits in `maxBytes`: as it is, or with its longest list cut
 * from the end (lists come most relevant first) and `truncated: true` plus a
 * hint. Null when even an empty list doesn't fit.
 */
export function fitResult(
  block: Extract<ToolResultBlock, { ok: true }>,
  maxBytes: number
): Extract<ToolResultBlock, { ok: true }> | null {
  if (jsonBytes(block) <= maxBytes) return block
  const data = block.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const record = data as Record<string, unknown>
  let key: string | null = null
  for (const [name, value] of Object.entries(record))
    if (
      Array.isArray(value) &&
      (key === null || jsonBytes(value) > jsonBytes(record[key]))
    )
      key = name
  if (key === null) return null
  const list = record[key] as unknown[]
  const withCount = (count: number) => ({
    ...block,
    data: {
      ...record,
      [key]: list.slice(0, count),
      truncated: true,
      hint: truncatedHint(count, list.length),
    },
  })
  // The most items that fit: fits(low) holds, fits(high) doesn't.
  let low = 0
  let high = list.length
  if (jsonBytes(withCount(0)) > maxBytes) return null
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (jsonBytes(withCount(middle)) <= maxBytes) low = middle
    else high = middle
  }
  return withCount(low)
}

/** What a pending Ref's result says when no call in its step used it. */
export const unusedRefNote = (ref: string) =>
  `Use ${ref} now in the calls that need it; the User adds them all together.`

/** Whether any string in `args`, at any depth, is exactly `ref`. */
function mentionsRef(args: unknown, ref: string): boolean {
  if (typeof args === 'string') return args === ref
  if (Array.isArray(args)) return args.some((item) => mentionsRef(item, ref))
  if (args && typeof args === 'object')
    return Object.values(args).some((value) => mentionsRef(value, ref))
  return false
}

/** Whether a drafted effect saves into the record a pending Ref creates. */
const usesPendingRef = (effect: DraftEffect, ref: string): boolean =>
  ((effect.kind === 'time.create' || effect.kind === 'plan.create') &&
    effect.category.type === 'pending' &&
    effect.category.ref === ref) ||
  (effect.kind === 'visit.create' &&
    effect.contact.type === 'pending' &&
    effect.contact.ref === ref)

const withTimeout = (
  run: Promise<ReadResult>,
  timeoutMs: number
): Promise<ReadResult> =>
  new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ ok: false, error: READ_TIMEOUT_ERROR }),
      timeoutMs
    )
    run
      .then(resolve, () =>
        resolve({
          ok: false,
          error: 'The app could not read that. Try again another way.',
        })
      )
      .finally(() => clearTimeout(timer))
  })

export interface ToolRunDeps {
  tool: (name: string) => ScribeTool | null
  ctx: ToolContext
  draft: TurnDraft
  stores: ScribeStores
  context: ScribeContextWire
  maxResultBytes: number
  readTimeoutMs?: number
}

/** A step's tool calls, run as they stream in. */
export interface ToolCallRun {
  /** Starts a read, or proposes a write into the draft, as its call arrives. */
  add(call: ToolCallBlock): void
  /** Waits for the reads; every call's result, in call order. */
  finish(): Promise<ToolRunOutcome>
}

/**
 * Runs one step's tool calls as their `tool_call` events arrive (protocol: What
 * the app does with a step): each read starts at once, with a 5 s timeout, and
 * reads run in parallel; each write proposes effects into the turn's draft, in
 * call order. Never writes to a store. The caller keeps the draft's and Refs'
 * checkpoint, since a step that doesn't end in `tool_calls` is discarded.
 */
export function startToolCalls(deps: ToolRunDeps): ToolCallRun {
  const outcome: ToolRunOutcome = {
    results: [],
    readCalls: 0,
    writeCalls: 0,
    failed: [],
    proposed: [],
    areas: [],
    untrusted: false,
    awaitsRef: false,
  }
  const timeoutMs = deps.readTimeoutMs ?? SCRIBE_READ_TIMEOUT_MS
  const calls: ToolCallBlock[] = []
  /** Writes that returned a pending Ref for later calls. */
  const refWrites: { call: ToolCallBlock; ref: string }[] = []

  const settled = new Map<string, ToolResultBlock>()
  const fail = (call: ToolCallBlock, error: string, write: boolean) => {
    outcome.failed.push({ name: call.name, write })
    settled.set(call.callId, {
      type: 'tool_result',
      callId: call.callId,
      name: call.name,
      ok: false,
      error,
    })
  }

  const reads: Promise<void>[] = []
  const add = (call: ToolCallBlock) => {
    calls.push(call)
    const tool = deps.tool(call.name)
    if (!tool)
      return fail(
        call,
        `Unknown tool ${call.name}. Use only the tools you were given.`,
        false
      )
    if (tool.offInDataProtection && deps.ctx.dataProtection)
      return fail(
        call,
        `${call.name} is off in data protection mode.`,
        tool.access === 'write'
      )
    if (tool.access === 'read') {
      outcome.readCalls++
      outcome.areas.push(tool.area)
      reads.push(
        withTimeout(tool.run(call.args, deps.ctx), timeoutMs).then((result) => {
          if (!result.ok) return fail(call, result.error, false)
          const block = fitResult(
            {
              type: 'tool_result',
              callId: call.callId,
              name: call.name,
              ok: true,
              trust: result.trust,
              data: result.data,
            },
            deps.maxResultBytes
          )
          if (!block) return fail(call, RESULT_TOO_LARGE_ERROR, false)
          if (result.trust === 'untrusted_text') outcome.untrusted = true
          settled.set(call.callId, block)
        })
      )
      return
    }
    outcome.writeCalls++
    const result = tool.propose(call.args, deps.ctx)
    if (!result.ok) return fail(call, result.error, true)
    deps.draft.add(call.callId, result.effects, deps.stores, deps.context)
    outcome.proposed.push(call.name)
    const ref = result.ref
    if (tool.refForLaterCalls && ref !== undefined)
      refWrites.push({ call, ref })
    settled.set(call.callId, {
      type: 'tool_result',
      callId: call.callId,
      name: call.name,
      ok: true,
      trust: 'app',
      data: {
        status: 'proposed',
        proposalId: deps.draft.proposalId,
        ...(ref ? { ref } : {}),
      },
    })
  }

  const finish = async (): Promise<ToolRunOutcome> => {
    await Promise.all(reads)
    // Only now are all of the step's calls known.
    for (const { call, ref } of refWrites) {
      // A pending Ref no other call names, and nothing drafted saves into (a
      // time_log newCategory of the same name shares it).
      const used =
        calls.some(
          (other) =>
            other.callId !== call.callId && mentionsRef(other.args, ref)
        ) || deps.draft.effects.some((effect) => usesPendingRef(effect, ref))
      if (used) continue
      outcome.awaitsRef = true
      const block = settled.get(call.callId)
      // Without it the model sometimes waits for the User to add the record
      // before proposing what uses it.
      if (block?.ok)
        settled.set(call.callId, {
          ...block,
          data: { ...(block.data as object), next: unusedRefNote(ref) },
        })
    }
    outcome.results = calls.map((call) => settled.get(call.callId)!)
    return outcome
  }

  return { add, finish }
}

/** Runs one step's tool calls at once, as `startToolCalls` does. */
export async function runToolCalls(
  calls: readonly ToolCallBlock[],
  deps: ToolRunDeps
): Promise<ToolRunOutcome> {
  const run = startToolCalls(deps)
  for (const call of calls) run.add(call)
  return run.finish()
}
