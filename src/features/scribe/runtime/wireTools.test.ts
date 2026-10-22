import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import {
  ALLOWED_SCHEMA_KEYWORDS,
  schemaViolations,
  toolDefinition,
  toolDefinitions,
  toWireSchema,
} from '@/features/scribe/runtime/wireTools'
import { defineReadTool, defineWriteTool } from '@/features/scribe/tools/types'
import type { JsonSchema, JsonValue } from '@/features/scribe/lib/wire'

const keywords = (node: JsonValue, found = new Set<string>()): Set<string> => {
  if (Array.isArray(node)) node.forEach((child) => keywords(child, found))
  else if (typeof node === 'object' && node !== null)
    for (const [key, value] of Object.entries(node)) {
      found.add(key)
      // Property names aren't keywords.
      if (key === 'properties' && typeof value === 'object' && value !== null)
        Object.values(value).forEach((child) => keywords(child, found))
      else keywords(value, found)
    }
  return found
}

const readTool = (hidden: boolean) =>
  defineReadTool({
    name: hidden ? 'notes_read' : 'notes_list',
    area: 'visits',
    description: 'A test tool. It reads.',
    input: z.strictObject({ ref: z.string() }),
    offInDataProtection: hidden,
    returnsUntrustedText: hidden,
    run: () => ({ ok: true, trust: 'untrusted_text', data: null }),
  })

describe('toWireSchema', () => {
  it('drops $schema and keeps the strict object shape', () => {
    const schema = toWireSchema(z.strictObject({ name: z.string().max(80) }))
    expect(schema).toEqual({
      type: 'object',
      properties: { name: { type: 'string', maxLength: 80 } },
      required: ['name'],
      additionalProperties: false,
    })
  })

  it('drops a pattern beside a format', () => {
    const schema = toWireSchema(z.strictObject({ date: z.iso.date() }))
    expect(schema.properties).toEqual({
      date: { type: 'string', format: 'date' },
    })
  })

  it('keeps a pattern without a format', () => {
    const schema = toWireSchema(
      z.strictObject({ month: z.string().regex(/^\d{4}-\d{2}$/) })
    )
    expect(schema.properties).toEqual({
      month: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
    })
  })

  it('writes a nullable primitive as a type array', () => {
    const schema = toWireSchema(
      z.strictObject({
        note: z.string().max(500).nullable(),
        minutes: z.int().min(0).max(1440).nullable(),
        day: z.iso.date().nullable(),
        anytime: z.boolean().nullable(),
      })
    )
    expect(schema.properties).toEqual({
      note: { type: ['string', 'null'], maxLength: 500 },
      minutes: { type: ['integer', 'null'], minimum: 0, maximum: 1440 },
      day: { type: ['string', 'null'], format: 'date' },
      anytime: { type: ['boolean', 'null'] },
    })
    expect(schema.required).toEqual(['note', 'minutes', 'day', 'anytime'])
  })

  it('adds null to a nullable enum', () => {
    const schema = toWireSchema(
      z.strictObject({ part: z.enum(['m', 'a', 'e']).nullable() })
    )
    expect(schema.properties).toEqual({
      part: { type: ['string', 'null'], enum: ['m', 'a', 'e', null] },
    })
  })

  it('keeps a nullable object as anyOf with a null branch', () => {
    const schema = toWireSchema(
      z.strictObject({
        followUp: z.strictObject({ date: z.iso.date() }).nullable(),
      })
    )
    expect(schema.properties).toEqual({
      followUp: {
        anyOf: [
          {
            type: 'object',
            properties: { date: { type: 'string', format: 'date' } },
            required: ['date'],
            additionalProperties: false,
          },
          { type: 'null' },
        ],
      },
    })
    expect(schemaViolations(schema)).toEqual([])
  })

  it('drops keywords outside the allowlist', () => {
    const schema = toWireSchema(
      z.strictObject({
        count: z.number().positive(),
        tags: z.array(z.string()).max(3),
      })
    )
    for (const key of keywords(schema))
      expect(ALLOWED_SCHEMA_KEYWORDS.has(key)).toBe(true)
    expect(schema.properties).toMatchObject({
      count: { type: 'number' },
      tags: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    })
  })
})

describe('schemaViolations', () => {
  const strict = (properties: JsonSchema): JsonSchema => ({
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  })

  it('passes a strict schema', () => {
    expect(schemaViolations(strict({ a: { type: 'string' } }))).toEqual([])
  })

  it('finds an optional property, an open object and a foreign keyword', () => {
    expect(
      schemaViolations({
        type: 'object',
        properties: { a: { type: 'string' }, b: { $ref: '#/x' } },
        required: ['a'],
      })
    ).toEqual([
      '$: additionalProperties must be false',
      '$.b: not required',
      '$.b: keyword $ref',
    ])
  })

  it('checks nested objects too', () => {
    expect(
      schemaViolations(
        strict({
          inner: { type: 'object', properties: { x: { type: 'string' } } },
        })
      )
    ).toEqual([
      '$.inner: additionalProperties must be false',
      '$.inner.x: not required',
    ])
  })

  it('rejects a schema deeper than 8 levels', () => {
    let node: JsonSchema = { type: 'string' }
    for (let level = 0; level < 9; level++) node = strict({ child: node })
    expect(schemaViolations(node)).toContain(
      '$.child.child.child.child.child.child.child.child: deeper than 8'
    )
  })

  it('rejects a root that is not an object', () => {
    expect(schemaViolations({ type: 'string' })).toEqual([
      '$: root must be an object',
    ])
  })

  it('accepts what zod generates for the tool shapes', () => {
    const schema = toWireSchema(
      z.strictObject({
        newContact: z
          .strictObject({
            name: z.string().min(1).max(80),
            address: z
              .strictObject({ line1: z.string().nullable() })
              .nullable(),
          })
          .nullable(),
        refs: z.array(z.string().min(2)).min(2).max(5),
      })
    )
    expect(schemaViolations(schema)).toEqual([])
  })
})

describe('offered tools', () => {
  const shown = readTool(false)
  const hidden = readTool(true)
  const write = defineWriteTool({
    name: 'notes_write',
    area: 'visits',
    description: 'A test tool. It writes.',
    input: z.strictObject({ text: z.string() }),
    propose: () => ({ ok: true, effects: [] }),
  })

  it('offers every tool in registry order, offInDataProtection ones too', () => {
    expect(
      toolDefinitions([shown, hidden, write]).map(
        (definition) => definition.name
      )
    ).toEqual(['notes_list', 'notes_read', 'notes_write'])
  })

  it('generates each definition once and marks untrusted text', () => {
    expect(toolDefinition(hidden)).toBe(toolDefinition(hidden))
    expect(toolDefinition(hidden)).toMatchObject({
      name: 'notes_read',
      access: 'read',
      returnsUntrustedText: true,
    })
    expect(toolDefinition(write)).toEqual({
      name: 'notes_write',
      description: 'A test tool. It writes.',
      access: 'write',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
        additionalProperties: false,
      },
    })
  })

  it("downgrades untrusted text from a tool that didn't declare it", async () => {
    await expect(shown.run({ ref: 'c1' }, {} as never)).resolves.toEqual({
      ok: true,
      trust: 'app',
      data: null,
    })
    await expect(hidden.run({ ref: 'c1' }, {} as never)).resolves.toEqual({
      ok: true,
      trust: 'untrusted_text',
      data: null,
    })
  })

  it('answers bad arguments with one instructive sentence, never running the tool', async () => {
    const result = await shown.run({ ref: 1, extra: true }, {} as never)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/^Invalid arguments \(/)
    expect(result.error).toMatch(/use null for values you don't have\.$/)
    expect(result.error.length).toBeLessThanOrEqual(400)
    expect(write.propose({}, {} as never)).toMatchObject({ ok: false })
  })
})
