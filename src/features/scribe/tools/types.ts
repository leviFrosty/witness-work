import type { z } from 'zod/v4'
import type { ScribeActivityArea } from '@/features/scribe/types'
import type { ScribeContextWire } from '@/features/scribe/lib/wire'
import type { RefRegistry } from '@/features/scribe/runtime/refs'
import type { ScribeStores } from '@/features/scribe/runtime/snapshot'
import type { DraftEffect } from '@/features/scribe/proposals/model'
import type { ScribeMemoryEdit } from '@/features/scribe/lib/memory'

/**
 * The turn's Proposal as a write tool sees it: what's already proposed, and the
 * pending Refs it may mint. Read-only but for `mintRef`.
 */
export interface DraftView {
  proposalId: string
  /** Effects proposed so far this turn, in call order. */
  effects: readonly DraftEffect[]
  /**
   * The pending Ref of a Contact this Proposal already creates under the same
   * normalized name (not an `askBetween` one), so a second mention merges.
   */
  pendingContactRef(name: string): string | null
  pendingCategoryRef(name: string): string | null
  /** The name a pending Ref of this Proposal creates, or null. */
  pendingName(ref: string): string | null
  /** A new pending Ref for a record this call creates. */
  mintRef(kind: 'n' | 'nk'): string
}

export interface ToolContext {
  now: Date
  /** Local `YYYY-MM-DD`. */
  today: string
  /** The conversation's pinned context. */
  context: ScribeContextWire
  refs: RefRegistry
  stores: ScribeStores
  dataProtection: boolean
  draft: DraftView
}

export type ReadResult =
  | { ok: true; data: unknown; trust: 'app' | 'untrusted_text' }
  | { ok: false; error: string }

export type ProposeResult =
  | { ok: true; effects: DraftEffect[]; ref?: string }
  | { ok: false; error: string }

interface ToolDefinitionBase<S extends z.ZodObject> {
  /** Protocol tool name, `noun_verb` with underscores. */
  name: string
  /** What the "Looking at your …" line says while it runs. */
  area: ScribeActivityArea
  /** Model-facing English, 2–4 sentences: when to use, when not, returns. */
  description: string
  /** `z.strictObject`; every key present, optionals `.nullable()`. */
  input: S
  /**
   * Refused on the device in data protection mode. Still offered, so the tool
   * list (a prompt-cache prefix every User shares) is the same in both modes.
   */
  offInDataProtection?: boolean
}

export interface ReadToolDefinition<S extends z.ZodObject>
  extends ToolDefinitionBase<S> {
  returnsUntrustedText?: boolean
  run(input: z.output<S>, ctx: ToolContext): ReadResult | Promise<ReadResult>
}

export interface WriteToolDefinition<S extends z.ZodObject>
  extends ToolDefinitionBase<S> {
  /**
   * The pending Ref it returns is mostly for other calls (a new Category for
   * the time logged in it). When no other call in the same step uses it, the
   * turn takes one more step so the model can.
   */
  refForLaterCalls?: boolean
  /**
   * Removes a record (protocol access `destructive`): proposed and reviewed
   * like any write, but ww-api withdraws it once the turn read untrusted text.
   */
  destructive?: boolean
  propose(input: z.output<S>, ctx: ToolContext): ProposeResult
}

/** Memory holds no householder text, so it works in data protection mode. */
export interface MemoryToolDefinition<S extends z.ZodObject>
  extends Omit<ToolDefinitionBase<S>, 'area' | 'offInDataProtection'> {
  /** The edit a call asks for; the runner applies it to the step's memory. */
  edit(input: z.output<S>): ScribeMemoryEdit
}

/** A tool in the registry, its input type erased behind `parse`. */
export type ScribeTool =
  | {
      access: 'read'
      name: string
      area: ScribeActivityArea
      description: string
      input: z.ZodObject
      returnsUntrustedText: boolean
      offInDataProtection: boolean
      run(args: unknown, ctx: ToolContext): Promise<ReadResult>
    }
  | {
      access: 'write' | 'destructive'
      name: string
      area: ScribeActivityArea
      description: string
      input: z.ZodObject
      returnsUntrustedText: false
      offInDataProtection: boolean
      refForLaterCalls: boolean
      propose(args: unknown, ctx: ToolContext): ProposeResult
    }
  /**
   * Edits Scribe AI's memory on the device at once, never the User's records,
   * so it isn't reviewed. `write` on the wire.
   */
  | {
      access: 'memory'
      name: string
      description: string
      input: z.ZodObject
      returnsUntrustedText: false
      offInDataProtection: false
      edit(
        args: unknown
      ): { ok: true; edit: ScribeMemoryEdit } | { ok: false; error: string }
    }

export type ReadTool = Extract<ScribeTool, { access: 'read' }>
export type WriteTool = Exclude<ScribeTool, { access: 'read' | 'memory' }>
export type MemoryTool = Extract<ScribeTool, { access: 'memory' }>

const MAX_ERROR_CHARS = 400

/** A zod failure as one sentence the model can act on. */
export function argumentError(error: z.ZodError): string {
  const parts = error.issues.slice(0, 4).map((issue) => {
    const path = issue.path.map(String).join('.') || 'arguments'
    return `${path}: ${issue.message}`
  })
  const text = `Invalid arguments (${parts.join('; ')}). Send every field; use null for values you don't have.`
  return text.length > MAX_ERROR_CHARS
    ? `${text.slice(0, MAX_ERROR_CHARS - 1)}…`
    : text
}

/** A read tool: runs on the device between steps and returns data. */
export function defineReadTool<S extends z.ZodObject>(
  definition: ReadToolDefinition<S>
): ReadTool {
  return {
    access: 'read',
    name: definition.name,
    area: definition.area,
    description: definition.description,
    input: definition.input,
    returnsUntrustedText: definition.returnsUntrustedText ?? false,
    offInDataProtection: definition.offInDataProtection ?? false,
    run: async (args, ctx) => {
      const parsed = definition.input.safeParse(args)
      if (!parsed.success)
        return { ok: false, error: argumentError(parsed.error) }
      const result = await definition.run(parsed.data, ctx)
      // Only a tool that declares it may label text as a person's.
      if (
        result.ok &&
        result.trust === 'untrusted_text' &&
        !definition.returnsUntrustedText
      )
        return { ...result, trust: 'app' }
      return result
    },
  }
}

/**
 * A write tool: proposes effects for review; never writes during the loop.
 * `destructive` ones too.
 */
export function defineWriteTool<S extends z.ZodObject>(
  definition: WriteToolDefinition<S>
): WriteTool {
  return {
    access: definition.destructive ? 'destructive' : 'write',
    name: definition.name,
    area: definition.area,
    description: definition.description,
    input: definition.input,
    returnsUntrustedText: false,
    offInDataProtection: definition.offInDataProtection ?? false,
    refForLaterCalls: definition.refForLaterCalls ?? false,
    propose: (args, ctx) => {
      const parsed = definition.input.safeParse(args)
      if (!parsed.success)
        return { ok: false, error: argumentError(parsed.error) }
      return definition.propose(parsed.data, ctx)
    },
  }
}

/** A memory tool: edits Scribe AI's memory as its call arrives. */
export function defineMemoryTool<S extends z.ZodObject>(
  definition: MemoryToolDefinition<S>
): MemoryTool {
  return {
    access: 'memory',
    name: definition.name,
    description: definition.description,
    input: definition.input,
    returnsUntrustedText: false,
    offInDataProtection: false,
    edit: (args) => {
      const parsed = definition.input.safeParse(args)
      if (!parsed.success)
        return { ok: false, error: argumentError(parsed.error) }
      return { ok: true, edit: definition.edit(parsed.data) }
    },
  }
}
