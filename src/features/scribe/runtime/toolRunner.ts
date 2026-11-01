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
import {
  editMemory,
  type ScribeMemoryChange,
  type ScribeMemoryEdit,
} from '@/features/scribe/lib/memory'

export const READ_TIMEOUT_ERROR =
  'The app took too long; try a narrower request.'

export interface ToolRunOutcome {
  results: ToolResultBlock[]
  readCalls: number
  writeCalls: number

  failed: { name: string; write: boolean }[]

  proposed: string[]

  areas: ScribeActivityArea[]

  untrusted: boolean

  awaitsRef: boolean
  memoryCalls: number

  memoryEdits: ScribeMemoryEdit[]
  memoryChanges: ScribeMemoryChange[]
  memoryText: string
}

export const MEMORY_OFF_ERROR =
  "Memory is off, so carry on without saving and don't mention it."
export const MEMORY_TAINTED_ERROR =
  "Memory can't change in a turn that read a person's notes, so carry on without saving and don't mention it."

export const RESULT_TOO_LARGE_ERROR =
  'That result is too large. Ask for fewer items or a shorter range.'

export const truncatedHint = (shown: number, total: number) =>
  `Only the first ${shown} of ${total} fit. To see the rest, ask for a shorter range or fewer items.`

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

export const unusedRefNote = (ref: string) =>
  `Use ${ref} now in the calls that need it; the User adds them all together.`

function mentionsRef(args: unknown, ref: string): boolean {
  if (typeof args === 'string') return args === ref
  if (Array.isArray(args)) return args.some((item) => mentionsRef(item, ref))
  if (args && typeof args === 'object')
    return Object.values(args).some((value) => mentionsRef(value, ref))
  return false
}

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

  memory: { enabled: boolean; text: string }

  tainted: boolean
}

export interface ToolCallRun {
  add(call: ToolCallBlock): void

  finish(): Promise<ToolRunOutcome>
}

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
    memoryCalls: 0,
    memoryEdits: [],
    memoryChanges: [],
    memoryText: deps.memory.text,
  }
  const timeoutMs = deps.readTimeoutMs ?? SCRIBE_READ_TIMEOUT_MS
  const calls: ToolCallBlock[] = []

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
        tool.access !== 'read'
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
    if (tool.access === 'memory') {
      outcome.memoryCalls++
      if (!deps.memory.enabled) return fail(call, MEMORY_OFF_ERROR, false)

      if (deps.tainted) return fail(call, MEMORY_TAINTED_ERROR, false)
      const parsed = tool.edit(call.args)
      if (!parsed.ok) return fail(call, parsed.error, false)
      const result = editMemory(outcome.memoryText, parsed.edit)
      if (!result.ok) return fail(call, result.error, false)
      outcome.memoryText = result.text
      if (result.change) {
        outcome.memoryEdits.push(parsed.edit)
        outcome.memoryChanges.push(result.change)
      }
      settled.set(call.callId, {
        type: 'tool_result',
        callId: call.callId,
        name: call.name,
        ok: true,
        trust: 'app',
        data: { status: 'saved' },
      })
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

    for (const { call, ref } of refWrites) {
      const used =
        calls.some(
          (other) =>
            other.callId !== call.callId && mentionsRef(other.args, ref)
        ) || deps.draft.effects.some((effect) => usesPendingRef(effect, ref))
      if (used) continue
      outcome.awaitsRef = true
      const block = settled.get(call.callId)

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

export async function runToolCalls(
  calls: readonly ToolCallBlock[],
  deps: ToolRunDeps
): Promise<ToolRunOutcome> {
  const run = startToolCalls(deps)
  for (const call of calls) run.add(call)
  return run.finish()
}
