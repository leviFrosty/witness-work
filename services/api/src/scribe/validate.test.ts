import { describe, expect, it } from 'vitest'
import { SCRIBE_TOOLS, scribeContext, stepBody, ulid, userMessage } from '../test/scribeFixture'
import { DEFAULT_SCRIBE_LIMITS } from './config'
import { SCRIBE_SYSTEM_PROMPT } from './prompt'
import {
  checkInputSchema,
  estimateInputTokens,
  readBodyText,
  utf8Bytes,
  validateMessages,
  validateStepRequest,
  validateTools,
} from './validate'

const LIMITS = DEFAULT_SCRIBE_LIMITS

const schema = (properties: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
  ...extra,
})

const tool = (fields: Record<string, unknown> = {}) => ({
  name: 'time_log',
  description: 'Proposes a Time Entry.',
  access: 'write',
  inputSchema: schema({ minutes: { type: 'integer', minimum: 1 } }),
  ...fields,
})

const toolRule = (tools: unknown) => {
  const result = validateTools(tools, LIMITS)
  return result.ok ? null : result.rule
}

describe('validateTools', () => {
  it('accepts the realistic 16-tool manifest', () => {
    const result = validateTools(SCRIBE_TOOLS, LIMITS)
    expect(result.ok).toBe(true)
    expect(utf8Bytes(JSON.stringify(SCRIBE_TOOLS))).toBeLessThan(LIMITS.maxToolsBytes)
  })

  it('drops unknown fields and keeps returnsUntrustedText only when true', () => {
    const result = validateTools(
      [tool({ extra: 'x', returnsUntrustedText: false }), tool({ name: 'visits_read_notes', access: 'read', returnsUntrustedText: true })],
      LIMITS
    )
    if (!result.ok) throw new Error(result.rule)
    expect(result.value[0]).not.toHaveProperty('extra')
    expect(result.value[0]).not.toHaveProperty('returnsUntrustedText')
    expect(result.value[1].returnsUntrustedText).toBe(true)
  })

  it.each([
    ['not an array', {}, 'tools_array'],
    ['too many', Array.from({ length: 25 }, (_, i) => tool({ name: `tool_n${i}` })), 'tools_count'],
    ['a non-object', ['time_log'], 'tool_shape'],
    ['an uppercase name', [tool({ name: 'Time_log' })], 'tool_name'],
    ['a name with no underscore', [tool({ name: 'timelog' })], 'tool_name'],
    ['a name over 48 chars', [tool({ name: `a_${'b'.repeat(47)}` })], 'tool_name'],
    ['a duplicate name', [tool(), tool()], 'tool_name_unique'],
    ['an empty description', [tool({ description: '' })], 'tool_description'],
    ['a long description', [tool({ description: 'x'.repeat(1_025) })], 'tool_description'],
    ['an unknown access', [tool({ access: 'admin' })], 'tool_access'],
    ['a non-boolean untrusted flag', [tool({ returnsUntrustedText: 'yes' })], 'tool_untrusted'],
  ])('refuses %s', (_, tools, rule) => {
    expect(toolRule(tools)).toBe(rule)
  })

  it('refuses a manifest over maxToolsBytes', () => {
    const big = Array.from({ length: 20 }, (_, i) =>
      tool({ name: `tool_n${i}`, description: 'd'.repeat(1_000), inputSchema: schema({ a: { type: 'string', description: 'e'.repeat(800) } }) })
    )
    expect(toolRule(big)).toBe('tools_bytes')
  })
})

describe('checkInputSchema', () => {
  const check = (value: unknown) => checkInputSchema(value, LIMITS.maxToolSchemaBytes)

  it('accepts strict-shaped schemas with the allowed keywords', () => {
    expect(
      check(
        schema(
          {
            date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', format: 'date' },
            minutes: { type: ['integer', 'null'], minimum: 1, maximum: 1440 },
            kind: { enum: ['a', 'b'] },
            fixed: { const: 'x' },
            tags: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 5 },
            followUp: {
              anyOf: [schema({ date: { type: 'string' } }), { type: 'null' }],
            },
          },
          { $schema: 'https://json-schema.org/draft/2020-12/schema', description: 'Args.' }
        )
      )
    ).toBeNull()
  })

  it.each([
    ['a non-object root', 'x', 'schema_root'],
    ['a non-object root type', { type: 'string' }, 'schema_root'],
    ['an open root', { ...schema(), additionalProperties: true }, 'schema_root'],
    ['a disallowed keyword', schema({ a: { type: 'string', default: 'x' } }), 'schema_keyword'],
    ['$ref', schema({ a: { $ref: '#/x' } }), 'schema_keyword'],
    ['oneOf', schema({ a: { oneOf: [{ type: 'string' }] } }), 'schema_keyword'],
    ['an unknown type', schema({ a: { type: 'date' } }), 'schema_type'],
    ['a bad pattern', schema({ a: { type: 'string', pattern: '(' } }), 'schema_pattern'],
    ['a non-numeric minimum', schema({ a: { type: 'integer', minimum: '1' } }), 'schema_keyword_value'],
    ['an empty enum', schema({ a: { enum: [] } }), 'schema_keyword_value'],
    [
      'a nested object without additionalProperties: false',
      schema({ a: { type: 'object', properties: {}, required: [] } }),
      'schema_additional_properties',
    ],
    [
      'an optional property (not in required)',
      { ...schema({ a: { type: 'string' } }), required: [] },
      'schema_strict',
    ],
    [
      'a nested optional property',
      schema({ a: { type: 'object', properties: { b: { type: 'string' } }, required: [], additionalProperties: false } }),
      'schema_strict',
    ],
    ['a required name with no property', { ...schema(), required: ['ghost'] }, 'schema_required'],
    ['an empty anyOf', schema({ a: { anyOf: [] } }), 'schema_any_of'],
  ])('refuses %s', (_, value, rule) => {
    expect(check(value)).toBe(rule)
  })

  it('refuses nesting past depth 8', () => {
    let node: Record<string, unknown> = { type: 'string' }
    for (let i = 0; i < 9; i++) node = schema({ a: node })
    expect(check(node)).toBe('schema_depth')
  })

  it('refuses a schema over maxToolSchemaBytes', () => {
    expect(check(schema({ a: { type: 'string', description: 'x'.repeat(4_100) } }))).toBe(
      'schema_bytes'
    )
  })
})

const call = (callId: string, name = 'plans_list', args: Record<string, unknown> = {}) => ({
  type: 'tool_call',
  callId,
  name,
  args,
})
const result = (callId: string, fields: Record<string, unknown> = {}) => ({
  type: 'tool_result',
  callId,
  name: 'plans_list',
  ok: true,
  trust: 'app',
  data: { plans: [] },
  ...fields,
})
const assistant = (...content: unknown[]) => ({ role: 'assistant', content })
const toolMessage = (...content: unknown[]) => ({ role: 'tool', content })

const messageRule = (messages: unknown, step = 0) => {
  const validated = validateMessages(messages, step, LIMITS)
  return validated.ok ? null : validated.rule
}

describe('validateMessages', () => {
  it('accepts a turn with reads, results, and a proposal outcome', () => {
    const outcome = {
      type: 'proposal_outcome',
      proposalId: 'pr_1',
      outcome: 'partially_applied',
      applied: ['call_1'],
      notApplied: ['call_2'],
      created: [{ callId: 'call_1', ref: 'n1' }],
    }
    expect(
      messageRule(
        [
          userMessage('Plan Thursday'),
          assistant({ type: 'text', text: 'Looking.' }, call('call_1'), call('call_2')),
          toolMessage(result('call_2'), result('call_1', { ok: false, error: 'not_found', trust: undefined, data: undefined })),
          assistant({ type: 'text', text: 'Ready to review.' }),
          userMessage('Thanks', undefined, outcome),
        ],
        0
      )
    ).toBeNull()
    expect(
      messageRule([userMessage('Plan Thursday'), assistant(call('call_1')), toolMessage(result('call_1'))], 1)
    ).toBeNull()
  })

  it.each([
    ['no messages', [], 'messages'],
    ['a message without content', [{ role: 'user', at: '2026-10-21T09:30:00-05:00' }], 'message_shape'],
    ['an unknown role', [{ role: 'system', content: [] }], 'message_role'],
    ['a user message without at', [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], 'user_at'],
    ['a UTC-less at', [{ ...userMessage('hi'), at: '2026-10-21T09:30:00' }], 'user_at'],
    ['an empty user message', [{ ...userMessage('hi'), content: [] }], 'user_empty'],
    ['an image block', [{ ...userMessage('hi'), content: [{ type: 'image', data: 'x' }] }], 'user_block'],
    [
      'an outcome after text',
      [{ ...userMessage('hi'), content: [{ type: 'text', text: 'hi' }, { type: 'proposal_outcome', proposalId: 'p', outcome: 'applied', applied: [], notApplied: [] }] }],
      'proposal_outcome',
    ],
    [
      'a created Ref from a call not added',
      [
        userMessage('hi', undefined, {
          type: 'proposal_outcome',
          proposalId: 'p',
          outcome: 'applied',
          applied: ['call_1'],
          notApplied: ['call_2'],
          created: [{ callId: 'call_2', ref: 'n1' }],
        }),
      ],
      'proposal_outcome',
    ],
    [
      'a created entry that is not a Ref',
      [
        userMessage('hi', undefined, {
          type: 'proposal_outcome',
          proposalId: 'p',
          outcome: 'applied',
          applied: ['call_1'],
          notApplied: [],
          created: [{ callId: 'call_1', ref: 'Peter Okoye' }],
        }),
      ],
      'proposal_outcome',
    ],
    [
      'an unknown outcome',
      [userMessage('hi', undefined, { type: 'proposal_outcome', proposalId: 'p', outcome: 'saved', applied: [], notApplied: [] })],
      'proposal_outcome',
    ],
    ['a bad call id', [userMessage('hi'), assistant(call('bad id')), toolMessage(result('bad id')), userMessage('x')], 'tool_call'],
    ['a duplicate call id', [userMessage('hi'), assistant(call('a'), call('a'))], 'tool_call_duplicate'],
    ['an unanswered call', [userMessage('hi'), assistant(call('a')), userMessage('x')], 'tool_result_missing'],
    ['a partly answered call', [userMessage('hi'), assistant(call('a'), call('b')), toolMessage(result('a'))], 'tool_result_missing'],
    ['an orphan result', [userMessage('hi'), toolMessage(result('a'))], 'tool_result_orphan'],
    ['a result for another call', [userMessage('hi'), assistant(call('a')), toolMessage(result('b'))], 'tool_result_unmatched'],
    ['a result without trust', [userMessage('hi'), assistant(call('a')), toolMessage(result('a', { trust: 'user' }))], 'tool_result'],
    ['an error result without error', [userMessage('hi'), assistant(call('a')), toolMessage(result('a', { ok: false }))], 'tool_result'],
    ['a trailing assistant at step 0', [userMessage('hi'), assistant({ type: 'text', text: 'x' })], 'last_message'],
  ])('refuses %s', (_, messages, rule) => {
    expect(messageRule(messages)).toBe(rule)
  })

  it('needs a later step to end with tool results', () => {
    expect(messageRule([userMessage('hi')], 1)).toBe('last_message')
  })

  it('caps the user’s text', () => {
    expect(messageRule([userMessage('x'.repeat(32_000))])).toBeNull()
    expect(messageRule([userMessage('x'.repeat(32_001))])).toBe('user_text_chars')
  })

  it('caps each tool result', () => {
    const big = (bytes: number) => result('a', { data: 'x'.repeat(bytes) })
    expect(messageRule([userMessage('hi'), assistant(call('a')), toolMessage(big(7_900))], 1)).toBeNull()
    expect(messageRule([userMessage('hi'), assistant(call('a')), toolMessage(big(8_200))], 1)).toBe(
      'tool_result_bytes'
    )
  })
})

describe('validateStepRequest', () => {
  const body = (overrides: Record<string, unknown> = {}) =>
    stepBody(
      { conversationId: ulid(), turnId: ulid(), step: 0, messages: [userMessage('Log two hours')] },
      overrides
    ) as unknown as Record<string, unknown>

  const rule = (overrides: Record<string, unknown>) => {
    const validated = validateStepRequest(body(overrides), LIMITS)
    return validated.ok ? null : [validated.status, validated.code, validated.rule]
  }

  it('accepts a realistic request and drops unknown fields', () => {
    const validated = validateStepRequest(body({ extra: true }), LIMITS)
    if (!validated.ok) throw new Error(validated.rule)
    expect(validated.value).not.toHaveProperty('extra')
    expect(validated.value.tools).toHaveLength(SCRIBE_TOOLS.length)
  })

  it.each(['ios', 'android', 'web'])('accepts app.platform %s', (platform) => {
    const validated = validateStepRequest(
      body({ app: { version: '1.46.0', platform, locale: 'en-US' } }),
      LIMITS
    )
    if (!validated.ok) throw new Error(validated.rule)
    expect(validated.value.app.platform).toBe(platform)
  })

  it.each([
    [{ conversationId: 'abc' }, [400, 'bad_request', 'conversation_id']],
    [{ turnId: '01jaaaaaaaaaaaaaaaaaaaaaaa' }, [400, 'bad_request', 'turn_id']],
    [{ step: -1 }, [400, 'bad_request', 'step']],
    [{ step: 1.5 }, [400, 'bad_request', 'step']],
    [{ step: 6 }, [400, 'step_limit', 'step_limit']],
    [{ app: { version: '1.46', platform: 'ios', locale: 'en-US' } }, [400, 'bad_request', 'app']],
    [{ app: { version: '1.46.0', platform: 'dev', locale: 'en-US' } }, [400, 'bad_request', 'app']],
    [{ app: { version: '1.46.0', platform: 'IOS', locale: 'en-US' } }, [400, 'bad_request', 'app']],
    [{ context: { ...scribeContext(), v: 2 } }, [400, 'bad_request', 'context']],
    [{ context: { ...scribeContext(), pad: 'x'.repeat(16_384) } }, [413, 'too_large', 'context_bytes']],
    [{ tools: [tool({ access: 'admin' })] }, [400, 'invalid_tools', 'tool_access']],
    [{ messages: [] }, [400, 'bad_request', 'messages']],
  ])('refuses %j', (overrides, expected) => {
    expect(rule(overrides)).toEqual(expected)
  })
})

describe('estimateInputTokens', () => {
  it('is ceil(bytes / 3) of prompt, tools, context and messages', () => {
    const request = {
      tools: [],
      context: { v: 1 },
      messages: [userMessage('héllo')],
    } as never
    const bytes =
      utf8Bytes('ab') +
      utf8Bytes('[]') +
      utf8Bytes('{"v":1}') +
      utf8Bytes(JSON.stringify([userMessage('héllo')]))
    expect(estimateInputTokens('ab', request)).toBe(Math.ceil(bytes / 3))
  })

  it('puts a realistic first step well under maxInputTokens', () => {
    const estimate = estimateInputTokens(SCRIBE_SYSTEM_PROMPT, {
      tools: SCRIBE_TOOLS as never,
      context: scribeContext() as never,
      messages: [userMessage('Log two hours')] as never,
    })
    expect(estimate).toBeGreaterThan(5_000)
    expect(estimate).toBeLessThan(LIMITS.maxInputTokens / 4)
  })
})

describe('readBodyText', () => {
  const request = (body: string, headers: Record<string, string> = {}) =>
    new Request('https://x/', { method: 'POST', body, headers })

  it('reads a body under the cap', async () => {
    expect(await readBodyText(request('hello'), 5)).toEqual({ ok: true, text: 'hello' })
  })

  it('refuses a declared or actual body over the cap', async () => {
    expect(await readBodyText(request('hi', { 'content-length': '10' }), 5)).toEqual({
      ok: false,
      tooLarge: true,
    })
    expect(await readBodyText(request('hello!'), 5)).toEqual({ ok: false, tooLarge: true })
  })

  it('reports a missing body', async () => {
    expect(await readBodyText(new Request('https://x/', { method: 'POST' }), 5)).toEqual({
      ok: false,
      tooLarge: false,
    })
  })
})
