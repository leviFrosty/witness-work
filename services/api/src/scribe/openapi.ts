import { z } from 'zod'
import { describeRoute } from 'hono-openapi'
import {
  apiErrorSchema,
  errorResponse,
  jsonBody,
  jsonResponse,
  rateLimitedResponse,
} from '../openapi/schemas'
import { DEFAULT_SCRIBE_LIMITS, DEFAULT_SCRIBE_MODEL } from './config'
import { TRANSCRIBE_MAX_BYTES } from './transcribe'
import {
  DOOR_OUTCOMES,
  RANGE_SIDES,
  STREET_NUMBERINGS,
  TERRITORY_NOTES_MAX_CHARS,
  TERRITORY_NOTES_MAX_LINES,
  TERRITORY_NOTES_MAX_RANGE,
  TERRITORY_NOTES_MAX_STREETS,
  TERRITORY_NOTES_MAX_STREET_CHARS,
} from './territoryNotes'
import { SCRIBE_APP_PLATFORMS } from './wire'

/**
 * OpenAPI descriptions for Scribe AI (`src/scribe/route.ts`). Doc-only: the
 * handlers parse for themselves. The normative contract is witness-work's
 * `docs/scribe-ai-protocol.md`; keep these in step with it.
 */

const TAG = 'Scribe AI'
const PROTOCOL_URL =
  'https://github.com/leviFrosty/witness-work/blob/main/docs/scribe-ai-protocol.md'

const ULID = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  .meta({ description: 'A 26-character ULID minted on the device.' })

// --- Shared --------------------------------------------------------------------

const usageWindowSchema = z
  .object({
    id: z.enum(['session', 'weekly', 'monthly']),
    percentUsed: z.number().int().meta({
      description: 'Floor(used × 100 / limit): at least 1 once anything is used, at most 100.',
    }),
    resetsAt: z.number().int().nullable().meta({
      description: 'Epoch ms the window ends; null before the first charge of a new window.',
    }),
    units: z
      .object({ used: z.number().int(), limit: z.number().int() })
      .meta({ description: 'Developer tools only; the app never shows units. `-1` is unlimited.' }),
  })
  .meta({ id: 'ScribeUsageWindow' })

const usageSnapshotShape = {
  plan: z.enum(['free', 'supporter']),
  supporterCheckFailed: z.boolean().meta({
    description: 'RevenueCat was unreachable while the account’s record was stale: metered as free.',
  }),
  windows: z.array(usageWindowSchema).meta({
    description:
      'The windows that limit this plan, shortest first: free → `weekly`; Supporter → `session`, `weekly`. A free account also gets `monthly`, a copy of its weekly window for apps before 1.47.0.',
  }),
  limited: z.boolean().meta({ description: 'A window is at or over its limit.' }),
  resetsAt: z.number().int().nullable().meta({
    description: 'When limited: when the latest-resetting full window resets (Scribe AI works again). Else null.',
  }),
  asOf: z.number().int().meta({ description: 'Epoch ms of this snapshot; keep the newest.' }),
}

const usageSnapshotSchema = z.object(usageSnapshotShape).meta({ id: 'ScribeUsageSnapshot' })

const scribeErrorSchema = apiErrorSchema
  .extend({
    usage: usageSnapshotSchema
      .optional()
      .meta({ description: 'On `limit_reached`, and on a territory-notes `model_error` that was charged.' }),
    detail: z.string().optional().meta({ description: 'Development sessions only.' }),
  })
  .meta({
    id: 'ScribeError',
    description: 'The shared error envelope; `error` is English for logs and never shown.',
  })

const scribeError = (description: string, codes: readonly string[]) =>
  errorResponse(description, codes, scribeErrorSchema)

const bearerOnly = [{ bearerAuth: [] }]

const authResponses = {
  401: scribeError(
    'A missing, expired, or invalid access token. Sends `WWW-Authenticate`: refresh once and retry.',
    ['unauthorized']
  ),
}

const unavailable = scribeError(
  '`disabled`: the kill switch (KV `scribe:enabled`) is off. `unavailable`: no allowlisted host serves the model with tool calls, or accounts are off on this worker. Both send `Retry-After: 60`.',
  ['disabled', 'unavailable']
)

// --- GET /scribe/v1/status -----------------------------------------------------

const limitsSchema = z.object({
  maxInputTokens: z.number().int(),
  maxOutputTokens: z.number().int(),
  maxStepsPerTurn: z.number().int(),
  maxTools: z.number().int(),
  maxToolsBytes: z.number().int(),
  maxToolSchemaBytes: z.number().int(),
  maxToolDescriptionChars: z.number().int(),
  maxRequestBytes: z.number().int(),
  maxContextBytes: z.number().int(),
  maxUserTextChars: z.number().int(),
  maxToolResultBytes: z.number().int(),
  transcribe: z.object({
    maxBytes: z.number().int(),
    mimeTypes: z.array(z.string()),
  }),
})

export const scribeStatusDocs = describeRoute({
  tags: [TAG],
  summary: 'Scribe AI availability and limits',
  description: `Whether Scribe AI is on, the protocol range, the advisory minimum app version, the per-tool denylist, and the effective caps (KV-resolved). No auth; the same for everyone, reused per isolate for 30 s, \`Cache-Control: no-store\`. \`enabled: false\` with \`reason\` \`disabled\` (kill switch) or \`no_provider\` (no allowlisted host serves the model with tool calls). Contract: [scribe-ai-protocol.md](${PROTOCOL_URL}).`,
  responses: {
    200: jsonResponse(
      'Status.',
      z.object({
        ok: z.literal(true),
        enabled: z.boolean(),
        reason: z.enum(['disabled', 'no_provider']).nullable(),
        protocol: z.object({ min: z.number().int(), max: z.number().int() }),
        minAppVersion: z.string().nullable(),
        disabledTools: z.array(z.string()),
        limits: limitsSchema,
      })
    ),
    429: scribeError('Too many requests from this IP. `Retry-After: 60`.', ['rate_limited']),
  },
})

// --- GET /scribe/v1/usage ------------------------------------------------------

export const scribeUsageDocs = describeRoute({
  tags: [TAG],
  summary: 'The account’s usage windows',
  description:
    'The bearer token’s account’s usage: each window that limits its plan as a percentage and a reset time. Read-only: it never charges or starts a window. A suspended account can still read it. Counts in the read edge tier (600 a minute per IP). `Cache-Control: no-store`.',
  security: bearerOnly,
  responses: {
    200: jsonResponse(
      'The account’s usage.',
      z.object({ ok: z.literal(true), ...usageSnapshotShape })
    ),
    ...authResponses,
    429: scribeError('Too many requests from this IP. `Retry-After: 60`.', ['rate_limited']),
    503: scribeError('Accounts are off on this worker. `Retry-After: 60`.', ['unavailable']),
  },
})

// --- POST /scribe/v1/step -----------------------------------------------------

const toolSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/).max(48),
  description: z.string().min(1).max(DEFAULT_SCRIBE_LIMITS.maxToolDescriptionChars),
  access: z.enum(['read', 'write', 'destructive']),
  inputSchema: z.record(z.string(), z.unknown()).meta({
    description:
      'JSON Schema (2020-12 subset): root `{type: "object", properties, required, additionalProperties: false}`, every nested object closed too, every property required (optional values are a union with null), depth ≤ 8. Keywords: `type`, `properties`, `required`, `additionalProperties`, `items`, `enum`, `const`, `description`, `minimum`, `maximum`, `minLength`, `maxLength`, `minItems`, `maxItems`, `pattern`, `format`, `anyOf`, `$schema`.',
  }),
  returnsUntrustedText: z.boolean().optional(),
})

const stepRequestSchema = z.object({
  protocol: z.literal(1),
  conversationId: ULID,
  turnId: ULID,
  step: z.number().int().min(0).meta({
    description: '0-based step in the turn; `(turnId, step)` is the idempotency key.',
  }),
  app: z.object({
    version: z.string().meta({ description: '`x.y.z`' }),
    platform: z.enum(SCRIBE_APP_PLATFORMS).meta({
      description: 'The client: `ios`, `android`, or `web` (the browser app). Analytics use the session’s platform, not this field.',
    }),
    locale: z.string().meta({ description: 'BCP-47 app Language; the model replies in it.' }),
  }),
  tools: z.array(toolSchema).meta({
    description: `At most ${DEFAULT_SCRIBE_LIMITS.maxTools} tools, ≤ ${DEFAULT_SCRIBE_LIMITS.maxToolsBytes} bytes serialized, names unique; the same across a conversation. KV \`scribe:disabled-tools\` names are never offered.`,
  }),
  context: z.record(z.string(), z.unknown()).meta({
    description: `The app’s snapshot (\`v: 1\`), ≤ ${DEFAULT_SCRIBE_LIMITS.maxContextBytes} bytes, byte-identical across a conversation.`,
  }),
  messages: z.array(z.record(z.string(), z.unknown())).meta({
    description:
      'The whole conversation: `user` (`at`, text and `proposal_outcome` blocks), `assistant` (text and `tool_call` blocks), `tool` (`tool_result` blocks answering every call of the previous message). Step 0 ends with `user`, later steps with `tool`.',
  }),
})

export const scribeStepDocs = describeRoute({
  tags: [TAG],
  summary: 'Run one model step (SSE)',
  description: `One stateless model step over the whole conversation, streamed as SSE: \`start\` (offered and dropped tools) as soon as the step is admitted, then \`text\` deltas and complete \`tool_call\`s, then exactly one \`done\` (\`finish\`, \`usage\`, \`meter\`) or \`error\` (\`model_error\`, \`model_timeout\`, \`server_error\`). Frames are \`event: <type>\` plus \`data: <JSON with type>\`; a \`:\` comment every 15 s while the model works. The device runs the tools and sends the next step. ww-api stores no conversation content.

Pre-flight, in order: per-IP limit (\`scribe\`, 60 a minute) → bearer token (active account) → kill switch and provider → \`protocol\` → body, tool, and message validation → context estimate (\`ceil(bytes / 3)\` over \`maxInputTokens\`) → usage windows (with turn grace) → step key → active-step cap → model. The last allowed step runs with \`toolChoice: none\`.

Model: \`${DEFAULT_SCRIBE_MODEL.model}\` through OpenRouter, pinned to the Western zero-data-retention allowlist (\`${DEFAULT_SCRIBE_MODEL.providers.join(', ')}\`) with \`require_parameters\`, reasoning \`${DEFAULT_SCRIBE_MODEL.reasoningEffort}\`, ${DEFAULT_SCRIBE_MODEL.maxOutputTokens} output tokens; KV \`scribe:model\` overrides. Contract: [scribe-ai-protocol.md](${PROTOCOL_URL}).`,
  security: bearerOnly,
  requestBody: jsonBody(stepRequestSchema),
  responses: {
    200: {
      description: 'An SSE stream (`text/event-stream`).',
      content: { 'text/event-stream': { schema: { type: 'string' } } },
    },
    400: scribeError(
      'A malformed body or broken message sequence (`bad_request`), tool definitions that break a rule (`invalid_tools`), or `step ≥ maxStepsPerTurn` (`step_limit`).',
      ['bad_request', 'invalid_tools', 'step_limit']
    ),
    ...authResponses,
    402: scribeError(
      'A usage window is full. `usage` is the snapshot; `retryAfter` is the seconds until it resets.',
      ['limit_reached']
    ),
    403: scribeError('The account is suspended.', ['suspended']),
    409: scribeError(
      '`step_in_progress`: the same `(turnId, step)` is running (wait 2 s, retry once). `step_retry_limit`: it was attempted 3 times.',
      ['step_in_progress', 'step_retry_limit']
    ),
    413: scribeError(
      '`too_large`: the body or context over its byte cap. `context_full`: the estimate is over `maxInputTokens`.',
      ['too_large', 'context_full']
    ),
    426: scribeError('`protocol` below KV `scribe:protocol-min`.', ['upgrade_required']),
    429: scribeError(
      '`rate_limited`: the per-IP family limit (`Retry-After: 60`). `active_cap`: the account already has its running steps (`Retry-After: 5`).',
      ['rate_limited', 'active_cap']
    ),
    500: scribeError('Unexpected failure.', ['server_error']),
    503: unavailable,
  },
})

// --- POST /scribe/v1/transcribe -------------------------------------------------

export const scribeTranscribeDocs = describeRoute({
  tags: [TAG],
  summary: 'Read one paper page into text',
  description: `Import from Paper’s page reader (ADR 0025), metered in usage units: the same usage-window check as a step (402), then the page ceiling (\`transcribePagesPerDay\`: 40 free, 200 Supporter, rolling 24 h; a page counts before the model runs), then the vision call, charged from its usage. The image is never stored or logged; the text goes back for the User to edit before sending it as a message. Rate-limited per IP in the \`scribe\` family.`,
  security: bearerOnly,
  requestBody: jsonBody(
    z.object({
      protocol: z.literal(1),
      image: z.string().meta({
        description: `Canonical base64 of a JPEG or PNG, ≤ ${TRANSCRIBE_MAX_BYTES} bytes decoded.`,
      }),
      mimeType: z.enum(['image/jpeg', 'image/png']),
    })
  ),
  responses: {
    200: jsonResponse(
      'The page’s text.',
      z.object({
        ok: z.literal(true),
        text: z.string(),
        truncated: z.boolean().meta({ description: 'The model hit its output cap.' }),
        usage: usageSnapshotSchema,
      })
    ),
    400: scribeError('A malformed body, or an image that isn’t its declared type.', ['bad_request']),
    ...authResponses,
    402: scribeError('A usage window is full; `usage` is the snapshot.', ['limit_reached']),
    403: scribeError('The account is suspended.', ['suspended']),
    413: scribeError('The image is over its byte cap.', ['too_large']),
    426: scribeError('`protocol` below KV `scribe:protocol-min`.', ['upgrade_required']),
    429: scribeError(
      '`rate_limited` (per IP) or `transcribe_limit` (the day’s pages; `Retry-After` until the oldest ages out).',
      ['rate_limited', 'transcribe_limit']
    ),
    502: scribeError('The model failed; nothing is charged.', ['model_error']),
    503: unavailable,
  },
})

// --- POST /scribe/v1/territory-notes ----------------------------------------------

const noteLine = z.number().int().min(0).meta({
  description: 'Index of the source line: the notes with `\\r\\n?` → `\\n`, split on `\\n`.',
})
const noteStreet = z.string().nullable().meta({
  description: 'A name from `streets` exactly, a street written in the notes, or null when none is named.',
})
const doorOutcome = z.enum(DOOR_OUTCOMES)

export const scribeTerritoryNotesDocs = describeRoute({
  tags: [TAG],
  summary: 'Read territory notes into door results',
  description: `Turns a publisher’s door-to-door notes, in any language and shorthand, into door results for the app’s review step; nothing is saved until the User reviews them on the device. Pre-flight like a page: bearer token (active account) → kill switch and provider → \`protocol\` → body → usage windows (402); then one model call, charged from its usage (an abort or the 45 s timeout is charged as the input estimate). The answer is validated: every number is written on its line, a street is the territory’s or written in the notes, ranges cover at most ${TERRITORY_NOTES_MAX_RANGE} houses, and nothing but doors, streets, and outcomes is returned (no names or reasons). A malformed answer is charged and answered 502 \`model_error\` with \`usage\`. The notes are never stored or logged. Rate-limited per IP in the \`scribe\` family.`,
  security: bearerOnly,
  requestBody: jsonBody(
    z.object({
      protocol: z.literal(1),
      notes: z.string().meta({
        description: `The notes as typed or scanned, ≤ ${TERRITORY_NOTES_MAX_CHARS} characters and ${TERRITORY_NOTES_MAX_LINES} lines.`,
      }),
      streets: z
        .array(
          z.object({
            name: z.string().meta({ description: `≤ ${TERRITORY_NOTES_MAX_STREET_CHARS} characters.` }),
            numbering: z.enum(STREET_NUMBERINGS).meta({
              description: '`none`: houses have no numbers; doors are counted.',
            }),
          })
        )
        .meta({ description: `The territory’s streets, ≤ ${TERRITORY_NOTES_MAX_STREETS}.` }),
      locale: z.string().meta({ description: 'The User’s app language (BCP 47).' }),
    })
  ),
  responses: {
    200: jsonResponse(
      'The door results.',
      z.object({
        ok: z.literal(true),
        doors: z.array(
          z.object({ line: noteLine, street: noteStreet, door: z.string(), outcome: doorOutcome })
        ),
        ranges: z.array(
          z.object({
            line: noteLine,
            street: noteStreet,
            from: z.number().int(),
            to: z.number().int(),
            side: z.enum(RANGE_SIDES).meta({ description: '`odd` or `even` only when the notes say so.' }),
            outcome: doorOutcome,
          })
        ),
        unread: z.array(noteLine).meta({ description: 'Lines that record a house the model couldn’t read.' }),
        usage: usageSnapshotSchema,
      })
    ),
    400: scribeError('A malformed body.', ['bad_request']),
    ...authResponses,
    402: scribeError('A usage window is full; `usage` is the snapshot.', ['limit_reached']),
    403: scribeError('The account is suspended.', ['suspended']),
    413: scribeError('The notes or streets are over their caps.', ['too_large']),
    426: scribeError('`protocol` below KV `scribe:protocol-min`.', ['upgrade_required']),
    429: scribeError('`rate_limited` (per IP).', ['rate_limited']),
    502: scribeError(
      'The model failed, timed out, or answered malformed JSON; `usage` is present when it was charged.',
      ['model_error']
    ),
    503: unavailable,
  },
})

// --- POST /admin/scribe/reset ----------------------------------------------------

export const scribeAdminResetDocs = describeRoute({
  tags: ['Admin'],
  summary: 'Reset an account’s Scribe AI usage',
  description:
    'Sets every Scribe AI usage window of one account back to unused, and its paper pages for the day. Used by `pnpm run admin:reset-usage`.',
  security: [{ adminToken: [] }],
  requestBody: jsonBody(
    z.object({
      accountId: z
        .string()
        .regex(/^[A-Za-z0-9_-]{8,64}$/)
        .meta({ description: 'The account id (`meterId` is accepted too).' }),
    })
  ),
  responses: {
    200: jsonResponse(
      'Reset.',
      z.object({
        ok: z.literal(true),
        previous: z.record(z.string(), z.number().int()).meta({
          description: 'Units each window held before the reset.',
        }),
      })
    ),
    400: errorResponse('Invalid JSON or account id.', ['bad_request']),
    404: errorResponse('Missing or wrong admin token.', ['not_found']),
    ...rateLimitedResponse,
  },
})
