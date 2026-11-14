import { z } from 'zod'
import { resolver, type DescribeRouteOptions } from 'hono-openapi'

/**
 * Building blocks for the OpenAPI document served at `/openapi.json` and
 * rendered by Scalar at `/docs`. These schemas describe the wire format for
 * readers; they don't validate anything. Each handler keeps its own parsing,
 * so when a contract changes, update its `openapi.ts` beside it.
 */

type Responses = NonNullable<DescribeRouteOptions['responses']>
type Schema = z.ZodType

/** A JSON body or response. */
export const json = (schema: Schema) => ({
  'application/json': { schema: resolver(schema) },
})

/** A response with a JSON body. */
export const jsonResponse = (description: string, schema: Schema) => ({
  description,
  content: json(schema),
})

/** A required JSON request body. */
export const jsonBody = (schema: Schema, description?: string) => ({
  required: true,
  description,
  content: json(schema),
})

/** The shared error envelope (`src/errors.ts`). */
export const apiErrorSchema = z
  .object({
    ok: z.literal(false),
    error: z.string().meta({
      description:
        'The same as `code`, except on attestation, Notes Import, and route planning, where it is a human-readable message.',
    }),
    code: z
      .string()
      .meta({ description: 'Stable, machine-readable code. Read this first.' }),
    retryAfter: z.number().int().positive().optional().meta({
      description:
        'Seconds; repeats the `Retry-After` header. Sent on every 429 and 503 except quotas a wait cannot free.',
    }),
  })
  .loose()
  .meta({
    id: 'ApiError',
    description:
      'Every JSON error. Routes may add their own fields (`reason`, `action`, …).',
  })

/** Schemas with a `.meta({ id })` that responses refer to by `$ref`. */
const componentSchemas = new Map<string, Schema>()

/**
 * `#/components/schemas/<id>` for a schema with a `.meta({ id })`, which
 * `componentSchemaObjects` then publishes once. Error bodies repeat on nearly
 * every response, and hono-openapi inlines a schema used as a whole body.
 */
const schemaRef = (schema: Schema) => {
  const id = z.globalRegistry.get(schema)?.id
  if (!id) return resolver(schema)
  componentSchemas.set(id, schema)
  return { $ref: `#/components/schemas/${id}` }
}

/** The JSON Schemas behind every `schemaRef`, for `components.schemas`. */
export const componentSchemaObjects = () => {
  const objects: Record<string, object> = {}
  for (const [id, schema] of componentSchemas) {
    const {
      $schema: _,
      $defs,
      ...object
    } = z.toJSONSchema(schema, {
      unrepresentable: 'any',
    }) as Record<string, unknown>
    Object.assign(objects, $defs, { [id]: object })
  }
  // Nested ids land in `$defs`; they're published beside their parents.
  return JSON.parse(
    JSON.stringify(objects).replaceAll('"#/$defs/', '"#/components/schemas/')
  ) as Record<string, object>
}

/**
 * An error response in the shared envelope. `codes` lists the `code` values
 * this status can carry on this route; `schema` overrides the body when the
 * route adds fields (give it a `.meta({ id })` to publish it once).
 */
export const errorResponse = (
  description: string,
  codes?: readonly string[],
  schema: Schema = apiErrorSchema
) => ({
  description: codes?.length
    ? `${description}\n\n\`code\`: ${codes.map((code) => `\`${code}\``).join(', ')}`
    : description,
  content: { 'application/json': { schema: schemaRef(schema) } },
})

/** The error envelope plus `serverTime`, for ops that can answer `stale`. */
export const staleErrorSchema = apiErrorSchema
  .extend({
    serverTime: z.number().int().optional().meta({
      description:
        'On `stale` only: the server clock in epoch ms, to correct the offset and re-sign.',
    }),
  })
  .meta({ id: 'StaleError' })

/** The per-IP limit every non-Buddies family shares (`src/rateLimit.ts`). */
export const rateLimitedResponse: Responses = {
  429: errorResponse(
    'Too many requests from this IP in the last minute. `Retry-After: 60`.',
    ['rate_limited']
  ),
}

/** The catch-all for an unexpected failure. */
export const serverErrorResponse: Responses = {
  500: errorResponse('Unexpected failure.', ['server_error']),
}

/** A base64url string without padding. */
export const b64u = (description: string) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]*$/)
    .meta({ description: `${description} (base64url, no padding)` })

/** The Buddies relay's 22-character random ids (16 bytes, base64url). */
export const buddiesId = (description: string) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]{22}$/)
    .meta({ description: `${description} (22-character base64url id)` })

/** An envelope's `payload` field. */
export const envelopePayload = () =>
  b64u('The request’s fields as UTF-8 JSON, then base64url-encoded')

/**
 * The signed envelope Buddies and accounts ops send: `payload` is the request
 * JSON, `signature` an Ed25519 signature over the op's signing context, the
 * op, and `payload`'s decoded bytes. Older app builds send them as `p` and
 * `s`, which the server still accepts; they aren't documented as fields.
 */
export const signedEnvelopeSchema = z
  .object({
    payload: envelopePayload(),
    signature: b64u(
      'Ed25519 signature over `<context>\\n<op>\\n` followed by the decoded `payload` bytes'
    ),
  })
  .strict()
  .meta({ id: 'SignedEnvelope' })

/** The envelope unsigned Buddies ops send: `payload` only. */
export const unsignedEnvelopeSchema = z
  .object({ payload: envelopePayload() })
  .strict()
  .meta({ id: 'UnsignedEnvelope' })

type JsonSchema = {
  type?: string | string[]
  const?: unknown
  enum?: unknown[]
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
}

const typeLabel = (schema: JsonSchema): string => {
  if (schema.const !== undefined) return `\`${JSON.stringify(schema.const)}\``
  if (schema.enum)
    return schema.enum.map((v) => `\`${JSON.stringify(v)}\``).join(' \\| ')
  const variants = schema.anyOf ?? schema.oneOf
  if (variants) return variants.map(typeLabel).join(' \\| ')
  if (schema.type === 'array' && schema.items)
    return `${typeLabel(schema.items)}[]`
  return Array.isArray(schema.type)
    ? schema.type.join(' \\| ')
    : (schema.type ?? 'any')
}

const fieldRows = (schema: JsonSchema, prefix = ''): string[] =>
  Object.entries(schema.properties ?? {}).flatMap(([name, field]) => {
    const path = `${prefix}${name}`
    const required = schema.required?.includes(name) ? 'yes' : ''
    const description = (field.description ?? '')
      .replace(/\n+/g, ' ')
      .replace(/\|/g, '\\|')
    const row = `| \`${path}\` | ${typeLabel(field)} | ${required} | ${description} |`
    const nested = field.type === 'array' ? field.items : field
    return nested?.properties
      ? [
          row,
          ...fieldRows(nested, `${path}${field.type === 'array' ? '[]' : ''}.`),
        ]
      : [row]
  })

/** A markdown table of an object schema's fields, nested ones by dotted path. */
export const fieldTable = (schema: Schema): string =>
  [
    '| Field | Type | Required | Description |',
    '| --- | --- | --- | --- |',
    ...fieldRows(
      z.toJSONSchema(schema, {
        unrepresentable: 'any',
        io: 'input',
      }) as JsonSchema
    ),
  ].join('\n')

/**
 * A signed envelope whose decoded `payload` must match `payload`. Its
 * fields are listed as a table in the body's description, since the
 * envelope hides them inside base64.
 */
export const signedBody = (payload: Schema, description: string) =>
  jsonBody(
    signedEnvelopeSchema,
    `${description}\n\n**Decoded \`payload\`:**\n\n${fieldTable(payload)}`
  )
