import type { z } from 'zod/v4'
import type { ScribeActivityArea } from '@/features/scribe/types'
import type { ScribeContextWire } from '@/features/scribe/lib/wire'
import type { RefRegistry } from '@/features/scribe/runtime/refs'
import type { ScribeStores } from '@/features/scribe/runtime/snapshot'
import type { DraftEffect } from '@/features/scribe/proposals/model'
import type { ScribeMemoryEdit } from '@/features/scribe/lib/memory'

export interface DraftView {
  proposalId: string

  effects: readonly DraftEffect[]

  pendingContactRef(name: string): string | null
  pendingCategoryRef(name: string): string | null

  pendingName(ref: string): string | null

  mintRef(kind: 'n' | 'nk'): string
}

export interface ToolContext {
  now: Date

  today: string

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
  name: string

  area: ScribeActivityArea

  description: string

  input: S

  offInDataProtection?: boolean
}

export interface ReadToolDefinition<S extends z.ZodObject>
  extends ToolDefinitionBase<S> {
  returnsUntrustedText?: boolean
  run(input: z.output<S>, ctx: ToolContext): ReadResult | Promise<ReadResult>
}

export interface WriteToolDefinition<S extends z.ZodObject>
  extends ToolDefinitionBase<S> {
  refForLaterCalls?: boolean

  destructive?: boolean
  propose(input: z.output<S>, ctx: ToolContext): ProposeResult
}

export interface MemoryToolDefinition<S extends z.ZodObject>
  extends Omit<ToolDefinitionBase<S>, 'area' | 'offInDataProtection'> {
  edit(input: z.output<S>): ScribeMemoryEdit
}

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
