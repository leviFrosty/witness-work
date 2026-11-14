import { z } from 'zod'
import { describeRoute } from 'hono-openapi'
import {
  errorResponse,
  jsonBody,
  jsonResponse,
  rateLimitedResponse,
} from '../openapi/schemas'
import {
  accountId,
  appAttestV2AssertionFields,
  ATTESTATION_NOTE,
  attestationErrorSchema,
  attestationProvidersShape,
  attestationResponses,
  devBypassHeader,
  installId,
  playIntegrityFields,
  sha256Hex,
  storageUnavailable,
  V1_CODES,
} from '../attestation/openapi'
import { notesImportResultValidator } from './schema'
import { SYNC_IMPORT_DEADLINE_MS } from './cap'

/**
 * OpenAPI descriptions for the Notes Import routes (`src/notesImport/route.ts`).
 * Doc-only: the handlers keep their own parsing, so update this file with any
 * change to the wire contract.
 */

const TAG = 'Notes Import'

/** How long the synchronous path waits on the model. */
const SYNC_DEADLINE_MINUTES = SYNC_IMPORT_DEADLINE_MS / 60_000

// --- Shared bodies and responses ----------------------------------------

const creditsSchema = z
  .object({
    remaining: z.number().int().nullable().meta({
      description: 'Imports left in the current window; `null` is unlimited.',
    }),
    limit: z.number().int().nullable().meta({
      description: 'Imports allowed per window; `null` is unlimited.',
    }),
    resetsAt: z.string().nullable().meta({
      description:
        'When the current import window ends (ISO 8601). `null` before the first charged import or when unlimited.',
      format: 'date-time',
    }),
    isSupporter: z.boolean().meta({
      description:
        'The real RevenueCat entitlement. It never implies an allowance value (the dev bypass raises allowances without setting it).',
    }),
    refinements: z
      .object({
        remaining: z.number().int().nullable(),
        limit: z.number().int().nullable(),
      })
      .meta({
        description:
          'Refinements left and allowed for this content, a lifetime allowance per import; `null` is unlimited.',
      }),
  })
  .meta({
    id: 'NotesImportCredits',
    description:
      'Usage snapshot, shared by kickoff, `done`, the legacy response, and allowance denials.',
  })

const notesImportErrorSchema = attestationErrorSchema
  .extend({
    detail: z.string().optional().meta({
      description:
        'On `unavailable`, why (`disabled`, `no_provider`, or an operator message). On a local development worker, a debug detail for `server_error` and `model_error`.',
    }),
    credits: creditsSchema.optional().meta({
      description: 'On `limit_reached` and `refinement_limit`.',
    }),
  })
  .meta({
    id: 'NotesImportError',
    description:
      'The shared error envelope; `error` is a human-readable message. Attestation failures add `reason`/`action`, allowance denials add `credits`.',
  })

const niError = (description: string, codes: readonly string[]) =>
  errorResponse(description, codes, notesImportErrorSchema)

const killSwitchUnavailable =
  '`unavailable`: the kill switch is off or no allowlisted model host is healthy (`detail` says which; `Retry-After: 60`). '

// --- Bearer tokens and the legacy switch -----------------------------------

/** A bearer token, or (while the legacy switch is on) none: the legacy form. */
const bearerOrLegacy: Record<string, string[]>[] = [{ bearerAuth: [] }, {}]

const BEARER_FORM =
  '**Bearer** (`Authorization: Bearer <accessToken>`, from `POST /accounts/v1/sessions`): the session attested once, so the body carries no attestation fields and no hashes, and usage is metered by the token’s account (a fresh allowance: usage under an install id or shared account id doesn’t carry over). A request with an `Authorization` header is always a bearer request: a bad token is 401 `unauthorized`, never a fallback to the legacy form.'

const LEGACY_FORM =
  '**Legacy** (no `Authorization` header; app versions before sessions): the attested forms, metered by `accountId` or `uuid`. They work while the legacy switch (KV `auth:legacy`) is on and are 426 `upgrade_required` once it’s off.'

const upgradeRequired = niError(
  'A legacy request (no `Authorization` header) after the legacy switch was turned off. No `Retry-After`: only updating the app helps.',
  ['upgrade_required']
)

const accountsDisabled =
  '`disabled`: account sessions are off on this worker (`Retry-After: 60`). '

// --- GET /notes-import/status --------------------------------------------

const allowancePair = z.object({
  free: z.number().int().nullable(),
  supporter: z.number().int().nullable(),
})

const capabilitiesSchema = z.object({
  // The same as GET /attestation/v1/status `providers`.
  ...attestationProvidersShape,
  transcribe: z
    .object({
      maxPages: z
        .number()
        .int()
        .meta({ description: 'Pages per Import from Paper batch (10).' }),
      maxBytes: z.number().int().meta({
        description:
          'Largest decoded page image `POST /notes-import/transcribe` accepts.',
      }),
    })
    .meta({ description: 'Import from Paper limits.' }),
})

const statusSchema = z.object({
  available: z.boolean().meta({
    description:
      'Whether Notes Import can run. Advisory: the import routes enforce the same check themselves.',
  }),
  reason: z.string().optional().meta({
    description:
      'Only when unavailable: `disabled` (kill switch), `no_provider` (no healthy allowlisted host), or an operator-written message to show.',
  }),
  limits: z
    .object({
      imports: allowancePair.meta({
        description: 'Imports per window; `null` is unlimited.',
      }),
      refinements: allowancePair.meta({
        description: 'Refinements per import; `null` is unlimited.',
      }),
      windowDays: z.number().meta({
        description: 'Length of the import window in days (may be fractional).',
      }),
    })
    .optional()
    .meta({
      description:
        'The public allowance schedule. Omitted when unavailable, and when the provider probe failed open (available but unconfirmed).',
    }),
  capabilities: capabilitiesSchema,
  minAppVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/)
    .optional()
    .meta({
      description:
        'Oldest app version (`major.minor.patch`) that may use Notes Import. Older apps disable the composer and ask for an update; the worker does not enforce it. Omitted when no floor is set.',
    }),
})

export const statusDocs = describeRoute({
  tags: [TAG],
  summary: 'Availability, limits, and capabilities',
  description: `A cheap probe the app calls before showing its import entry points, so it can disable them before attesting. No attestation and no inference.

Availability checks the KV kill switch (\`notes-import:enabled\`) first, then whether any allowlisted model host is healthy on OpenRouter (a free metadata call, cached 60 seconds). Fails open: if the probe itself errors, the response says available without \`limits\`.

Completed responses are reused in each Worker isolate for up to 30 seconds (KV reads add up to 60 seconds more); the response itself is \`Cache-Control: no-store\`. Public and the same for everyone: it ignores \`Authorization\` and never reports one account’s allowance (\`GET /notes-import/usage\` and kickoff’s \`credits\` do).`,
  responses: {
    200: jsonResponse('The current status.', statusSchema),
    ...rateLimitedResponse,
  },
})

// --- GET /notes-import/usage ------------------------------------------------

const usageSchema = z.object({
  ok: z.literal(true),
  accountStatus: z.enum(['active', 'suspended']).meta({
    description:
      'The account’s status. A suspended account can read its allowance, but kickoff refuses it with 403 `suspended`.',
  }),
  supporter: z.boolean().meta({
    description:
      'Whether the account counts as a Supporter right now, as kickoff would meter it: its own linked RevenueCat customers (see `GET /accounts/v1/supporter`). A dev session is never a Supporter.',
  }),
  supporterCheckFailed: z.boolean().meta({
    description:
      'RevenueCat couldn’t be reached, so the account is answered as free, which is also how kickoff meters it until RevenueCat answers again. Show the free allowance; don’t tell a Supporter they lost their status.',
  }),
  imports: z
    .object({
      limit: z.number().int().nullable().meta({
        description: 'Imports allowed per window; `null` is unlimited.',
      }),
      used: z.number().int().meta({
        description:
          'New imports charged in the current window, on every device of the account. `0` when no window is active. Can exceed `limit` by imports that were already running when the last one was charged.',
      }),
      remaining: z.number().int().nullable().meta({
        description:
          'Imports left in the current window (never below 0); `null` is unlimited. Kickoff admits a new import while this is above 0. Replaying notes already imported and refining them don’t spend it.',
      }),
      resetsAt: z.string().nullable().meta({
        description:
          'When the current window ends and `remaining` returns to `limit` (ISO 8601). `null` when no window is active (the next charged import starts one) or when unlimited.',
        format: 'date-time',
      }),
    })
    .meta({ description: 'The account’s import allowance.' }),
  refinements: z
    .object({
      limitPerImport: z.number().int().nullable().meta({
        description:
          'Refinements allowed for each imported notes text over its lifetime; `null` is unlimited. Counted per notes text, not per account, so there is no account-wide balance (kickoff’s `credits.refinements` has one text’s).',
      }),
    })
    .meta({ description: 'The account’s refinement allowance.' }),
  windowDays: z.number().meta({
    description:
      'Length of the import window in days (may be fractional). A window starts with its first charged import.',
  }),
})

export const usageDocs = describeRoute({
  tags: [TAG],
  summary: 'The account’s allowance',
  description: `The bearer token’s account’s Notes Import allowance right now: how many imports it has used and has left in the current window, and when the window ends. Every device on the account sees the same numbers, so an import on one shows on the others. Read-only: it counts as no import and touches no run.

It answers through the code kickoff gates with (the account’s Supporter status, the runtime limits, and the account’s meter), so it can’t disagree with what kickoff enforces at that moment. It doesn’t check availability (\`GET /notes-import/status\`). The response is \`Cache-Control: no-store\`.

Bearer only (\`Authorization: Bearer <accessToken>\`, from \`POST /accounts/v1/sessions\`); there is no legacy form. Counts against the read edge tier (600 a minute per IP), not the \`notes-import\` bucket.`,
  security: [{ bearerAuth: [] }],
  responses: {
    200: jsonResponse('The account’s allowance.', usageSchema),
    401: niError(
      'A missing, expired, or invalid access token, or an account that no longer exists. Sends `WWW-Authenticate: Bearer error="invalid_token"`: refresh once and retry.',
      ['unauthorized']
    ),
    429: niError(
      'Too many requests from this IP in the last minute. `Retry-After: 60`.',
      ['rate_limited']
    ),
    503: niError(accountsDisabled, ['disabled']),
  },
})

// --- Import request (kickoff and legacy) -----------------------------------

const contextSchema = z
  .object({
    now: z.string().meta({
      description:
        'The user’s current time, ISO 8601 with offset (e.g. `2026-06-17T09:30:00-05:00`). Relative dates resolve against it.',
    }),
    timeZone: z
      .string()
      .meta({ description: 'IANA time zone, e.g. `America/Chicago`.' }),
    currentRole: z
      .enum([
        'publisher',
        'regularAuxiliary',
        'regularPioneer',
        'circuitOverseer',
        'specialPioneer',
        'custom',
      ])
      .optional()
      .meta({ description: 'The user’s current role, as context only.' }),
    existingContacts: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          address: z.string().optional(),
          phone: z.string().optional(),
        })
      )
      .meta({
        description:
          'Contacts the user already has, so visits attach to real ids instead of duplicates.',
      }),
    existingCategories: z
      .array(
        z.object({ id: z.string(), name: z.string(), isCredit: z.boolean() })
      )
      .meta({
        description:
          'Time categories the user already has, so entries reuse their ids.',
      }),
  })
  .meta({ description: 'What the model needs beyond the notes themselves.' })

const refinementSchema = z
  .object({
    previousResultJSON: z
      .string()
      .meta({ description: 'The earlier `result`, as a JSON string.' }),
    instruction: z
      .string()
      .meta({ description: 'The user’s correction, in their words.' }),
  })
  .optional()
  .meta({
    description:
      'Present to refine an earlier result of the same notes. Uses the refinement allowance instead of an import, and is its own run (the instruction is part of the import id).',
  })

const importBaseFields = {
  uuid: installId,
  accountId,
  notesText: z.string().meta({
    description:
      'The notes to import, at most 100,000 characters by default. Empty or whitespace-only text is a 400 `bad_request`.',
  }),
  context: contextSchema,
  refinement: refinementSchema,
}

const notesContentHash = sha256Hex(
  'SHA-256 of `notesText`. Recomputed by the worker; a mismatch is a 400'
)

const notesRequestHash = sha256Hex(
  'SHA-256 of the sorted-key canonical JSON `{"context","notesText","refinement"}` (`refinement: null` when absent). Recomputed by the worker; a mismatch is a 400'
)

const v1ImportFields = {
  protocolVersion: z.literal(1).optional(),
  keyId: z.string(),
  challenge: z.string(),
  assertion: z.string().meta({
    description:
      'Assertion over SHA-256 of `<challenge>|<uuid>|<contentHash>`, or `<challenge>|<uuid>|<accountId>|<contentHash>` when `accountId` is sent.',
  }),
  contentHash: notesContentHash.optional(),
}

const bearerImportFields = {
  notesText: importBaseFields.notesText,
  context: contextSchema,
  refinement: refinementSchema,
}

const bearerImportSchema = z
  .object(bearerImportFields)
  .meta({ title: 'Bearer' })

const kickoffRequestSchema = z.union([
  bearerImportSchema,
  z
    .object({ ...importBaseFields, ...v1ImportFields })
    .meta({ title: 'App Attest v1 (legacy)' }),
  z
    .object({
      ...importBaseFields,
      ...appAttestV2AssertionFields('notes-import-kickoff'),
      contentHash: notesContentHash,
      requestHash: notesRequestHash,
    })
    .meta({ title: 'App Attest v2 (legacy)' }),
  z
    .object({
      ...importBaseFields,
      ...playIntegrityFields('notes-import-kickoff'),
      contentHash: notesContentHash,
      requestHash: notesRequestHash,
    })
    .meta({ title: 'Play Integrity (legacy)' }),
])

const successSchema = z
  .object({
    result: notesImportResultValidator.meta({
      id: 'NotesImportResult',
      description:
        'The structured import, validated against the model’s output schema (`NOTES_IMPORT_SCHEMA` in `src/notesImport/schema.ts`). Field descriptions are the instructions the model receives.',
    }),
    contentHash: sha256Hex('SHA-256 of the imported `notesText`'),
    refinement: z
      .boolean()
      .meta({ description: 'Whether this was a refinement.' }),
    emptyCharged: z.boolean().meta({
      description:
        'The run produced no records and still used an import, because the free Empty Import allowance (5 per 7 days by default) was spent. Treat absent as `false`.',
    }),
    credits: creditsSchema,
  })
  .meta({
    id: 'NotesImportSuccess',
    description:
      'A finished import. The same shape on the legacy response, the `done` event, and `/result`.',
  })

const importGateErrors = (legacy: boolean) => ({
  400: niError(
    `Bearer: invalid JSON, missing \`notesText\` or \`context\`, or empty or whitespace-only \`notesText\`. Legacy: ${
      legacy
        ? 'invalid JSON; missing `uuid`, `notesText`, or `context`; empty or whitespace-only `notesText`; an invalid `accountId`; `contentHash` doesn’t match `notesText`; or an App Attest v2 / Play Integrity body (`reason: unsupported_protocol`).'
        : 'invalid JSON; missing `uuid`, `notesText`, or `context`; empty or whitespace-only `notesText`; an invalid `accountId`; `contentHash` or `requestHash` doesn’t match the payload; or an invalid v2 / Play Integrity request (`reason: invalid_request`).'
    }`,
    ['bad_request', 'attestation_failed']
  ),
  401: niError(
    `Bearer: the access token is missing, expired, or invalid (\`unauthorized\`, with \`WWW-Authenticate: Bearer error="invalid_token"\`; refresh once and retry). Legacy: no App Attest credentials (\`attestation_required\`, \`action: bind\`), or attestation failed. ${ATTESTATION_NOTE}`,
    ['unauthorized', 'attestation_required', 'attestation_failed', ...V1_CODES]
  ),
  402: niError(
    'The import allowance for this window is used up. `credits` says when it resets; no `Retry-After`. Replays of already-imported content are free and never get this.',
    ['limit_reached']
  ),
  403: niError(
    legacy
      ? 'Bearer: the account is suspended.'
      : 'Bearer: the account is suspended (`suspended`). Legacy, Play Integrity only: the app isn’t the Play-distributed build (`app_not_recognized`) or the device fails the required integrity verdict (`device_integrity_failed`).',
    legacy ? ['suspended'] : ['suspended', 'attestation_failed']
  ),
  ...(legacy ? {} : { 409: attestationResponses[409] }),
  413: niError('`notesText` is over the character limit.', ['too_large']),
  429: niError(
    'Too many requests from this IP (`rate_limited`, `Retry-After: 60`); this content’s refinement allowance is used up (`refinement_limit`, with `credits`, no `Retry-After`; it never resets); or this user already has the maximum imports running (`active_cap`, 2 free / 5 Supporter by default, `Retry-After: 15`).',
    ['rate_limited', 'refinement_limit', 'active_cap']
  ),
  426: upgradeRequired,
})

const GATE_DESCRIPTION = `**Gate**, in order: the access token and account (bearer) or the legacy switch (legacy), the kill switch and provider health (503 \`unavailable\`), body checks, then for legacy requests the content and request hashes and attestation (or the dev bypass), Supporter status (an outage counts as free), then the allowance. Bearer requests use the account’s Supporter status (\`POST /accounts/v1/revenuecat-customers\` links the app’s RevenueCat customer; none linked: free); legacy requests ask RevenueCat about \`accountId\` or \`uuid\`. A bearer \`dev\` session (a local development worker only) gets the dev bypass’s unlimited allowances. Content already imported by this user replays without using an import; a refinement uses the per-content refinement allowance. An import is charged only when it succeeds.

${BEARER_FORM}

${LEGACY_FORM}`

export const kickoffDocs = describeRoute({
  tags: [TAG],
  summary: 'Start a streaming import',
  description: `The authenticated, metered entry point. Starts the model run in a per-import Durable Object and returns at once with an \`importId\` for \`GET /notes-import/{importId}/events\`, \`/result\`, \`/cancel\`, and \`/destroy\`. A bearer request calls those with the same access token; a legacy request gets a \`subscribeToken\` for them.

${GATE_DESCRIPTION}

The \`importId\` is derived from the user (the account, on bearer requests) and the content (plus the refinement instruction), so kicking off the same notes again reconnects to the same run instead of starting another; a run that failed restarts. The subscribe token lasts 1 hour, and a finished result is kept for 1 hour.

\`credits\` is a point-in-time preview and may differ from the terminal snapshot on \`done\`.`,
  security: bearerOrLegacy,
  parameters: [devBypassHeader],
  requestBody: jsonBody(kickoffRequestSchema),
  responses: {
    200: jsonResponse(
      'The run is started (or already running, or finished).',
      z.object({
        importId: z
          .string()
          .regex(/^imp_[a-f0-9]{40}$/)
          .meta({
            description: 'The run’s id, stable per user and content.',
          }),
        subscribeToken: z.string().optional().meta({
          description:
            'Legacy requests only: the capability for this import’s stream, result, cancel, and destroy routes (`?token=`). Expires after 1 hour. A bearer response has none; those routes take the access token.',
        }),
        refinement: z.boolean(),
        credits: creditsSchema,
      })
    ),
    ...importGateErrors(false),
    500: niError('The run could not be started.', ['server_error']),
    503: niError(
      `${killSwitchUnavailable}${accountsDisabled}${storageUnavailable}`,
      ['unavailable', 'disabled', 'server_error']
    ),
  },
})

export const legacyImportDocs = describeRoute({
  tags: [TAG],
  summary: 'Import notes synchronously (legacy)',
  description: `The original path, kept as a fallback: holds the request open for the whole model run (often over a minute) and returns the result in one response. Bearer requests take the same body as kickoff’s. Legacy requests are App Attest v1 only; v2 and Play Integrity bodies are refused (use \`POST /notes-import/kickoff\`).

${GATE_DESCRIPTION} The same concurrency cap as kickoff applies, and each request holds a slot of its own while it runs, identical ones included (they still charge once). A model run that hasn't finished within ${SYNC_DEADLINE_MINUTES} minutes is stopped and answered \`502\` \`model_error\`, charging nothing.`,
  deprecated: true,
  security: bearerOrLegacy,
  parameters: [devBypassHeader],
  requestBody: jsonBody(
    z.union([
      bearerImportSchema,
      z
        .object({ ...importBaseFields, ...v1ImportFields })
        .meta({ title: 'App Attest v1 (legacy)' }),
    ])
  ),
  responses: {
    200: jsonResponse('The finished import.', successSchema),
    ...importGateErrors(true),
    500: niError('Unexpected failure.', ['server_error']),
    502: niError(
      `The model failed, returned an invalid result, or didn’t finish within ${SYNC_DEADLINE_MINUTES} minutes.`,
      ['model_error']
    ),
    503: niError(
      `${killSwitchUnavailable}${accountsDisabled}${storageUnavailable}`,
      ['unavailable', 'disabled', 'server_error']
    ),
  },
})

// --- POST /notes-import/transcribe -----------------------------------------

const transcribeBaseFields = {
  uuid: installId,
  accountId,
  image: z.string().meta({
    description:
      'The page photo, standard base64 with padding. Its first bytes must match `mimeType`. At most 4 MiB decoded by default (`capabilities.transcribe.maxBytes`).',
  }),
  mimeType: z.enum(['image/jpeg', 'image/png']),
  contentHash: sha256Hex('SHA-256 of the `image` string as sent'),
  requestHash: sha256Hex(
    'SHA-256 of the sorted-key canonical JSON `{"imageHash":<contentHash>,"mimeType":<mimeType>}`'
  ),
}

export const transcribeDocs = describeRoute({
  tags: [TAG],
  summary: 'Read a photographed page',
  description: `Import from Paper: reads one page image into plain text with a vision model on the zero-data-retention allowlist. Nothing is stored. The app shows the text for editing, then imports it through \`POST /notes-import/kickoff\`, which is where an import is used.

Bearer requests send just \`image\` and \`mimeType\`, and are metered by the token’s account, with its Supporter status. Legacy requests take App Attest v2 (purpose \`notes-import-transcribe\`) or Play Integrity only; v1 is a 400 with \`reason: unsupported_protocol\`. Gated by the kill switch. Pages are free but limited per user per rolling 24 hours (40 free, 200 Supporter by default), and a free user with no imports left is refused before any page is read.

${BEARER_FORM}

${LEGACY_FORM}`,
  security: bearerOrLegacy,
  parameters: [devBypassHeader],
  requestBody: jsonBody(
    z.union([
      z
        .object({
          image: transcribeBaseFields.image,
          mimeType: transcribeBaseFields.mimeType,
        })
        .meta({ title: 'Bearer' }),
      z
        .object({
          ...transcribeBaseFields,
          ...appAttestV2AssertionFields('notes-import-transcribe'),
        })
        .meta({ title: 'App Attest v2 (legacy)' }),
      z
        .object({
          ...transcribeBaseFields,
          ...playIntegrityFields('notes-import-transcribe'),
        })
        .meta({ title: 'Play Integrity (legacy)' }),
    ])
  ),
  responses: {
    200: jsonResponse(
      'The page’s text.',
      z.object({
        ok: z.literal(true),
        text: z.string().meta({ description: 'The transcribed text.' }),
        truncated: z.boolean().meta({
          description: 'The model hit its output limit before finishing.',
        }),
        pagesRemaining: z.number().int().meta({
          description: 'Pages left in the rolling 24 hours.',
        }),
      })
    ),
    400: niError(
      'Invalid JSON; missing `image`; an unsupported `mimeType`; an image that isn’t base64 of the declared type. Legacy: missing `uuid`; an invalid `accountId`; a hash mismatch; App Attest v1 (`reason: unsupported_protocol`); or an invalid v2 / Play Integrity request.',
      ['bad_request', 'attestation_failed']
    ),
    401: niError(
      `Bearer: the access token is missing, expired, or invalid (\`unauthorized\`, with \`WWW-Authenticate\`). Legacy: attestation failed. ${ATTESTATION_NOTE}`,
      ['unauthorized', 'attestation_failed']
    ),
    402: niError(
      'A free user with no imports left in this window (with `credits`).',
      ['limit_reached']
    ),
    403: niError(
      'Bearer: the account is suspended (`suspended`). Legacy, Play Integrity only: the app isn’t the Play-distributed build or the device fails the required integrity verdict.',
      ['suspended', 'attestation_failed']
    ),
    409: attestationResponses[409],
    413: niError('The decoded image is over the byte limit.', ['too_large']),
    429: niError(
      'Too many requests from this IP (`rate_limited`, `Retry-After: 60`), or the daily page limit is reached (`transcribe_limit`, `Retry-After` until the oldest page ages out).',
      ['rate_limited', 'transcribe_limit']
    ),
    426: upgradeRequired,
    500: niError('Unexpected failure.', ['server_error']),
    502: niError('The vision model couldn’t read the page.', ['model_error']),
    503: niError(
      `${killSwitchUnavailable}${accountsDisabled}${storageUnavailable}`,
      ['unavailable', 'disabled', 'server_error']
    ),
  },
})

// --- Run routes (bearer token, or the legacy subscribe token) ---------------

const importIdParameter = {
  name: 'importId',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const },
  description: 'The `importId` from kickoff.',
}

const tokenParameter = {
  name: 'token',
  in: 'query' as const,
  required: false,
  schema: { type: 'string' as const },
  description:
    'Legacy requests only (required there): the `subscribeToken` from kickoff. It must have been issued for this `importId`; it expires after 1 hour. A bearer request never reads it.',
}

const runAuthErrors = {
  400: niError('Legacy: missing `token`.', ['bad_request']),
  401: niError(
    'Bearer: the access token is missing, expired, or invalid (`unauthorized`, with `WWW-Authenticate`; refresh once and retry). Legacy: the subscribe token is unknown, expired, or for another import (`attestation_required`); kick off again for a fresh one.',
    ['unauthorized', 'attestation_required']
  ),
  404: niError(
    'Bearer: no import with this id belongs to the token’s account. Another account’s import, an unknown id, and one deleted or past its 1-hour retention all get this same answer. Kick off again to run the notes anew.',
    ['not_found']
  ),
  426: upgradeRequired,
  ...rateLimitedResponse,
  503: niError(accountsDisabled, ['disabled']),
}

const RUN_AUTH =
  'This route can’t spend inference, so it needs no attestation. **Bearer:** the access token of the account that kicked the import off (a suspended account still may). **Legacy:** the kickoff’s `subscribeToken` as `?token=`, while the legacy switch is on.'

const importStatus = z
  .enum([
    'queued',
    'starting',
    'thinking',
    'structuring',
    'done',
    'error',
    'cancelled',
  ])
  .nullable()
  .meta({
    description:
      'The run’s state. `null` means no run exists: it was destroyed, or its 1-hour retention passed.',
  })

const failureSchema = z
  .object({
    code: z.string().meta({
      description:
        '`model_error` (the model failed or returned an invalid result), `interrupted` (the run stopped midway; kick off again), `server_error`, or `unknown`.',
    }),
    message: z.string(),
  })
  .meta({ description: 'Why the run failed.' })

const snapshotSchema = z.object({
  status: importStatus,
  payload: successSchema
    .optional()
    .meta({ description: 'Only when `status` is `done`.' }),
  error: failureSchema
    .optional()
    .meta({ description: 'Only when `status` is `error`.' }),
})

export const eventsDocs = describeRoute({
  tags: [TAG],
  summary: 'Stream import progress (SSE)',
  description: `A Server-Sent Events stream of one run. ${RUN_AUTH}

The stream replays the run’s persisted events after the resume cursor, then tails live until a terminal event, and closes. A run that has already finished (or doesn’t exist) replays and closes at once. Resume with the \`Last-Event-ID\` header (or \`lastEventId\` query parameter) set to the last \`id:\` seen; omit it to replay from the start. While live, a comment frame (\`:\`) every 15 seconds lets a client detect a dead connection.

Each frame has an \`event:\` line naming the type and a \`data:\` line with the event as JSON (including \`type\`). Persisted events also carry \`id: <seq>\`; \`reasoning\` and \`progress\` frames are cosmetic, have no \`id:\`, and are not replayed.

| \`event\` | \`data\` | Persisted |
| --- | --- | --- |
| \`status\` | \`{ "type": "status", "status": "starting" \\| "thinking" \\| "structuring" }\` | yes |
| \`reasoning\` | \`{ "type": "reasoning", "text": string }\`: a chunk of the model’s reasoning, when it emits any | no |
| \`progress\` | \`{ "type": "progress", "chars": number }\`: output length so far | no |
| \`done\` | \`{ "type": "done", "payload": <the legacy 200 body: result, contentHash, refinement, emptyCharged, credits> }\` | yes, terminal |
| \`error\` | \`{ "type": "error", "code": "model_error" \\| "interrupted" \\| "server_error", "message": string }\` | yes, terminal |
| \`cancelled\` | \`{ "type": "cancelled" }\` (never charged) | yes, terminal |

The stream is for showing progress; the result is read only from \`done\` or \`GET /notes-import/{importId}/result\`.`,
  security: bearerOrLegacy,
  parameters: [
    importIdParameter,
    tokenParameter,
    {
      name: 'Last-Event-ID',
      in: 'header' as const,
      required: false,
      schema: { type: 'string' as const },
      description: 'Resume after this event `seq`.',
    },
    {
      name: 'lastEventId',
      in: 'query' as const,
      required: false,
      schema: { type: 'string' as const },
      description:
        'The same cursor, for clients that can’t set headers. The header wins.',
    },
  ],
  responses: {
    200: {
      description:
        'The event stream (`Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`).',
      content: {
        'text/event-stream': {
          schema: { type: 'string' as const },
          example:
            'id: 1\nevent: status\ndata: {"type":"status","status":"starting"}\n\nevent: progress\ndata: {"type":"progress","chars":512}\n\nid: 3\nevent: done\ndata: {"type":"done","payload":{...}}\n\n',
        },
      },
    },
    ...runAuthErrors,
  },
})

export const resultDocs = describeRoute({
  tags: [TAG],
  summary: 'Get an import’s result',
  description: `The run’s current state and, once finished, its result, for a client that reconnects after the stream closed or missed the terminal event. ${RUN_AUTH} Results are kept for 1 hour after the run ends.`,
  security: bearerOrLegacy,
  parameters: [importIdParameter, tokenParameter],
  responses: {
    200: jsonResponse('The run’s snapshot.', snapshotSchema),
    ...runAuthErrors,
  },
})

export const cancelDocs = describeRoute({
  tags: [TAG],
  summary: 'Cancel a running import',
  description: `Stops a queued or running import: aborts the model call, frees the concurrency slot, and ends the stream with \`cancelled\`. A cancelled run is never charged. ${RUN_AUTH}

No-op once the run has ended. If the run is already settling its result, cancel waits and returns \`done\` instead. Used by the app’s “edit & resend” flow.`,
  security: bearerOrLegacy,
  parameters: [importIdParameter, tokenParameter],
  responses: {
    200: jsonResponse('The run’s snapshot after the cancel.', snapshotSchema),
    ...runAuthErrors,
  },
})

export const destroyDocs = describeRoute({
  tags: [TAG],
  summary: 'Delete an import',
  description: `Forgets a run now instead of after its retention: aborts any model call (uncharged), frees the concurrency slot, closes the stream, and deletes all stored state, the result included. Idempotent for legacy requests; a bearer request for an import already deleted is 404 \`not_found\`, which means the same thing. ${RUN_AUTH} Backs the history view’s delete.`,
  security: bearerOrLegacy,
  parameters: [importIdParameter, tokenParameter],
  responses: {
    200: jsonResponse('Deleted.', z.object({ ok: z.literal(true) })),
    ...runAuthErrors,
  },
})
