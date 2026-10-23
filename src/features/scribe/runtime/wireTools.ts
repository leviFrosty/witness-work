import { z } from 'zod/v4'
import type {
  JsonSchema,
  JsonValue,
  ToolDefinitionWire,
} from '@/features/scribe/lib/wire'
import type { ScribeTool } from '@/features/scribe/tools/types'

/**
 * The protocol's keyword allowlist ([Tool
 * definitions](docs/scribe-ai-protocol.md#tool-definitions)).
 */
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

export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/
export const MAX_SCHEMA_DEPTH = 8

const isObject = (value: JsonValue | undefined): value is JsonSchema =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const PRIMITIVES = new Set(['string', 'number', 'integer', 'boolean'])

/**
 * Shrinks zod's output to what the model needs, in the protocol's subset: drops
 * `$schema` and keywords outside the allowlist, drops a `pattern` beside a
 * `format` (the device validates the exact rule), and writes a nullable
 * primitive as `"type": [T, "null"]` instead of an `anyOf`.
 */
function compact(node: JsonValue): JsonValue {
  if (Array.isArray(node)) return node.map(compact)
  if (!isObject(node)) return node
  const out: JsonSchema = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === '$schema' || !ALLOWED_SCHEMA_KEYWORDS.has(key)) continue
    if (key === 'pattern' && typeof node.format === 'string') continue
    if (key === 'properties' && isObject(value)) {
      const properties: JsonSchema = {}
      for (const [name, property] of Object.entries(value))
        properties[name] = compact(property)
      out[key] = properties
      continue
    }
    out[key] = compact(value)
  }
  const anyOf = out.anyOf
  if (Array.isArray(anyOf) && anyOf.length === 2) {
    const [first, second] = anyOf
    if (
      isObject(first) &&
      isObject(second) &&
      second.type === 'null' &&
      Object.keys(second).length === 1 &&
      typeof first.type === 'string' &&
      PRIMITIVES.has(first.type)
    ) {
      const { anyOf: _anyOf, ...rest } = out
      const merged: JsonSchema = {
        ...rest,
        ...first,
        type: [first.type, 'null'],
      }
      if (Array.isArray(first.enum)) merged.enum = [...first.enum, null]
      return merged
    }
  }
  return out
}

/** A tool's input schema on the wire: JSON Schema 2020-12, strict shape. */
export function toWireSchema(input: z.ZodObject): JsonSchema {
  const generated = z.toJSONSchema(input, {
    target: 'draft-2020-12',
    io: 'input',
  }) as unknown as JsonValue
  const schema = compact(generated)
  if (!isObject(schema)) throw new Error('Tool input must be an object schema')
  return schema
}

/**
 * Every protocol rule a server applies to one schema; empty when it passes: the
 * keyword allowlist, `additionalProperties: false` and every property required
 * on every object, nullable optionals, and depth ≤ 8.
 */
export function schemaViolations(schema: JsonSchema): string[] {
  const problems: string[] = []
  const walk = (node: JsonValue, path: string, depth: number) => {
    if (!isObject(node)) return
    if (depth > MAX_SCHEMA_DEPTH) problems.push(`${path}: deeper than 8`)
    for (const key of Object.keys(node))
      if (!ALLOWED_SCHEMA_KEYWORDS.has(key))
        problems.push(`${path}: keyword ${key}`)
    const types = Array.isArray(node.type) ? node.type : [node.type]
    if (types.includes('object') || isObject(node.properties)) {
      if (node.additionalProperties !== false)
        problems.push(`${path}: additionalProperties must be false`)
      const properties = isObject(node.properties) ? node.properties : {}
      const required = Array.isArray(node.required) ? node.required : []
      for (const name of Object.keys(properties)) {
        if (!required.includes(name))
          problems.push(`${path}.${name}: not required`)
        walk(properties[name], `${path}.${name}`, depth + 1)
      }
    }
    if (isObject(node.items)) walk(node.items, `${path}[]`, depth + 1)
    if (Array.isArray(node.anyOf))
      node.anyOf.forEach((option, index) =>
        walk(option, `${path}|${index}`, depth + 1)
      )
  }
  walk(schema, '$', 1)
  if (schema.type !== 'object') problems.push('$: root must be an object')
  return problems
}

const definitionCache = new WeakMap<ScribeTool, ToolDefinitionWire>()

/** One tool's definition, generated once. */
export function toolDefinition(tool: ScribeTool): ToolDefinitionWire {
  const cached = definitionCache.get(tool)
  if (cached) return cached
  const definition: ToolDefinitionWire = {
    name: tool.name,
    description: tool.description,
    access: tool.access,
    inputSchema: toWireSchema(tool.input),
    ...(tool.returnsUntrustedText ? { returnsUntrustedText: true } : {}),
  }
  definitionCache.set(tool, definition)
  return definition
}

/**
 * The definitions sent with every step, in registry order: every tool, in every
 * mode, so every User and every step shares one cached prefix. A tool that's
 * off in data protection mode stays listed; the device refuses its calls.
 */
export function toolDefinitions(
  tools: readonly ScribeTool[]
): ToolDefinitionWire[] {
  return tools.map(toolDefinition)
}
