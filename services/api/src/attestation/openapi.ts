import { z } from 'zod'
import { describeRoute } from 'hono-openapi'
import {
  apiErrorSchema,
  errorResponse,
  json,
  jsonBody,
  jsonResponse,
  rateLimitedResponse,
} from '../openapi/schemas'
import { ATTESTATION_PURPOSES } from './purposes'

/**
 * OpenAPI descriptions for `/attestation/v1/*` (src/attestation/route.ts) and
 * the attestation fields every protected route documents. Doc-only: the
 * handlers keep their own parsing, so update this file with any change to the
 * wire contract.
 */

const TAG = 'Attestation'

/** Where the old `/notes-import/*` paths are listed. */
const LEGACY_TAG = 'Notes Import'

// --- Shared fields -------------------------------------------------------

export const sha256Hex = (description: string) =>
  z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .meta({ description: `${description} (lowercase hex SHA-256)` })

export const installId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/)
  .meta({
    description:
      'The install id (`uuid`). App Attest keys are pinned to it; usage is metered on it when no `accountId` is sent.',
  })

export const accountId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/)
  .optional()
  .meta({
    description:
      'Optional shared account id. When present, Supporter status, allowances, the concurrency cap, and replay all key on it instead of `uuid`. A malformed value is a 400, never ignored.',
  })

export const operationId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,128}$/)
  .meta({
    description:
      'Client-chosen id for one challenge → request round trip. Reusing it with different data is `operation_conflict`.',
  })

export const keyId = z
  .string()
  .regex(/^[A-Za-z0-9+/]{43}=$/)
  .meta({
    description: 'The App Attest key id (standard base64 of 32 bytes).',
  })

export const challenge = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/)
  .meta({
    description:
      'The one-time server challenge from `POST /attestation/v1/challenge` (43-character base64url). Consumed on use.',
  })

export const purpose = z
  .enum(ATTESTATION_PURPOSES)
  .meta({
    description:
      'Which protected request the challenge is for (signed into the assertion). It must match the route that consumes it: `attestation-verify` (or `notes-import-verify`) for verify, `notes-import-kickoff`, `notes-import-transcribe`, and `account-session` for `POST /accounts/v1/sessions` (both hashes `hex(SHA-256(UTF-8("ww-account/v1/session\\n" + accountPub)))`).',
  })

export const expiresAt = z.number().int().meta({
  description: 'When the challenge expires (epoch ms; 5 minutes after issue).',
})

export const playIntegrityProvider = z.literal('play-integrity').meta({
  description:
    'Opts the request into the Android Play Integrity path. Bodies without it take the App Attest path.',
})

export const devBypassHeader = {
  name: 'x-ww-dev-bypass',
  in: 'header' as const,
  required: false,
  schema: { type: 'string' as const },
  description:
    'Development worker only: the `NOTES_IMPORT_DEV_BYPASS_TOKEN` secret. A match skips attestation (and, on metered routes, the RevenueCat check, using the Supporter allowances). Production never sets the token, so the header is ignored there.',
}

// --- Errors -------------------------------------------------------------

export const attestationErrorSchema = apiErrorSchema
  .extend({
    reason: z.string().optional().meta({
      description:
        'Stable App Attest or Play Integrity reason, on attestation failures: `invalid_request`, `unsupported_protocol`, `operation_conflict`, `too_many_challenges`, `challenge_not_found`, `challenge_expired`, `identity_not_bound`, `key_not_active`, `recovery_not_enrolled`, `recovery_token_mismatch`, `attestation_invalid`, `assertion_invalid`, `counter_not_increasing`, `storage_unavailable`; Android adds `integrity_unavailable`, `integrity_token_invalid`, `app_not_recognized`, `device_integrity_failed`.',
    }),
    action: z
      .enum([
        'none',
        'retry',
        'request_challenge',
        'start_new_operation',
        'bind',
        'enroll_recovery',
        'use_active_key',
      ])
      .optional()
      .meta({
        description:
          'What the client should do next, beside `reason`. Transient failures never ask for key rotation.',
      }),
  })
  .meta({
    id: 'AttestationError',
    description:
      'The shared error envelope; `error` is a human-readable message. Attestation failures add `reason` and `action`.',
  })

const attError = (description: string, codes: readonly string[]) =>
  errorResponse(description, codes, attestationErrorSchema)

export const V1_CODES = [
  'device_verification_failed',
  'assertion_failed',
  'challenge_expired',
  'counter_conflict',
] as const

export const ATTESTATION_NOTE =
  'App Attest v1 (legacy) failures are always 401 with `device_verification_failed`, `assertion_failed`, `challenge_expired`, or `counter_conflict`, which never ask the client to rotate its key. App Attest v2 and Play Integrity failures are `attestation_failed` at the reason’s own status; branch on `reason`/`action`.'

export const storageUnavailable =
  '`server_error`: attestation storage or Google’s decode service is unavailable (`Retry-After: 30`).'

export const attestationResponses = {
  401: attError(
    `Attestation failed: an unknown, consumed, or expired challenge, an invalid assertion or token, or an identity whose key isn’t bound or active. ${ATTESTATION_NOTE}`,
    ['attestation_failed', ...V1_CODES]
  ),
  403: attError(
    'Play Integrity only: the app isn’t the Play-distributed build (`app_not_recognized`) or the device fails the required integrity verdict (`device_integrity_failed`).',
    ['attestation_failed']
  ),
  409: attError(
    'App Attest v2 / Play Integrity: `operationId` was used with different data (`operation_conflict`), or the assertion’s sign count didn’t increase (`counter_not_increasing`). Start a new operation.',
    ['attestation_failed']
  ),
}

// --- Attested request fields --------------------------------------------

/** One route's purpose, or a schema when it accepts more than one. */
type PurposeField = string | z.ZodType

const purposeSchema = (forPurpose: PurposeField) =>
  typeof forPurpose === 'string' ? z.literal(forPurpose) : forPurpose

/** App Attest v2 assertion fields shared by every attested request. */
export const appAttestV2AssertionFields = (forPurpose: PurposeField) => ({
  protocolVersion: z.literal(2),
  operation: z.literal('assert'),
  operationId,
  keyId,
  purpose: purposeSchema(forPurpose),
  challenge,
  assertion: z.string().max(65_536).meta({
    description:
      'App Attest assertion (base64) over SHA-256 of the client data `witnesswork.app-attest|2|assert|<purpose>|<operationId>|<challenge>|<uuid>|<accountId or empty>|<contentHash>|<requestHash>`.',
  }),
})

/** Play Integrity fields shared by every attested request. */
export const playIntegrityFields = (forPurpose: PurposeField) => ({
  attestationProvider: playIntegrityProvider,
  protocolVersion: z.literal(1),
  operation: z.literal('assert'),
  operationId,
  purpose: purposeSchema(forPurpose),
  challenge,
  integrityToken: z.string().max(32_768).meta({
    description:
      'A Play Integrity standard-request token whose `requestHash` is the lowercase hex SHA-256 of `witnesswork.play-integrity|1|assert|<purpose>|<operationId>|<challenge>|<uuid>|<accountId or empty>|<contentHash>|<requestHash>`. Never send `keyId` or `assertion` with it.',
  }),
})

// --- POST /attestation/v1/challenge ---------------------------------------

const challengeRequestSchema = z.union([
  z
    .object({
      protocolVersion: z.literal(1).optional(),
    })
    .meta({
      title: 'App Attest v1 (legacy)',
      description:
        'An empty body, `{}`, or `{ "protocolVersion": 1 }`. Returns a bare challenge for a v1 attestation or assertion.',
    }),
  z
    .object({
      protocolVersion: z.literal(2),
      operation: z.enum(['bind', 'enroll']),
      operationId,
      uuid: installId,
      keyId,
    })
    .meta({
      title: 'App Attest v2 bind / enroll',
      description:
        'A challenge for `POST /attestation/v1/register`: `bind` attests a new key, `enroll` adds a recovery token with the active key. No assertion fields allowed.',
    }),
  z
    .object({
      protocolVersion: z.literal(2),
      operation: z.literal('assert'),
      operationId,
      uuid: installId,
      keyId,
      purpose,
      accountId,
      contentHash: sha256Hex(
        'The content hash the protected request will carry'
      ),
      requestHash: sha256Hex(
        'The request hash the protected request will carry'
      ),
    })
    .meta({
      title: 'App Attest v2 assert',
      description:
        'A challenge bound to one protected request (verify, kickoff, or transcribe). The later request must repeat these values exactly.',
    }),
  z
    .object({
      attestationProvider: playIntegrityProvider,
      protocolVersion: z.literal(1),
      operation: z.literal('assert'),
      operationId,
      uuid: installId,
      accountId,
      purpose,
      contentHash: sha256Hex(
        'The content hash the protected request will carry'
      ),
      requestHash: sha256Hex(
        'The request hash the protected request will carry'
      ),
    })
    .meta({
      title: 'Play Integrity',
      description:
        'Android. Same binding as the App Attest v2 assert challenge, without `keyId`.',
    }),
])

const challengeResponseSchema = z.union([
  z.object({ challenge: z.string() }).meta({ title: 'App Attest v1 (legacy)' }),
  z
    .object({
      protocolVersion: z.literal(2),
      operation: z.enum(['bind', 'enroll', 'assert']),
      operationId,
      challenge,
      expiresAt,
    })
    .meta({ title: 'App Attest v2' }),
  z
    .object({
      attestationProvider: z.literal('play-integrity'),
      protocolVersion: z.literal(1),
      operation: z.literal('assert'),
      operationId,
      challenge,
      expiresAt,
    })
    .meta({ title: 'Play Integrity' }),
])

const challengeRoute: RouteDocs = {
  summary: 'Issue an attestation challenge',
  description: `Step one of every attested call, on any route. Returns a one-time challenge (5-minute lifetime) for App Attest v1, App Attest v2 (\`bind\`, \`enroll\`, or \`assert\`), or Play Integrity.

v2 and Play Integrity challenges are bound to their request: the descriptor (operation, \`operationId\`, \`uuid\`, \`keyId\`, purpose, \`accountId\`, and both hashes) is stored, and the consuming request must match it. Re-requesting the same \`operationId\` with the same data returns the outstanding challenge. At most 32 unexpired challenges per install.

**Hashes.** Each protected route defines its own. For Notes Import, \`contentHash\` is SHA-256 of \`notesText\` (kickoff), of the base64 \`image\` string as sent (transcribe), or any value the client picks (verify). \`requestHash\` is SHA-256 of the sorted-key canonical JSON \`{"context","notesText","refinement"}\` (kickoff; \`refinement\` is \`null\` when absent), of \`{"imageHash","mimeType"}\` (transcribe), or equal to \`contentHash\` (verify).`,
  requestBody: {
    required: false,
    description: 'Optional; an empty body asks for a v1 challenge.',
    content: json(challengeRequestSchema),
  },
  responses: {
    200: jsonResponse('A challenge.', challengeResponseSchema),
    400: attError(
      'Invalid JSON, an invalid challenge request (`reason: invalid_request`), or an unsupported `protocolVersion` (`reason: unsupported_protocol`). v2 requests the lifecycle rejects answer `attestation_failed`.',
      ['bad_request', 'attestation_failed']
    ),
    409: attError(
      '`operationId` was already used with different data (`operation_conflict`).',
      ['attestation_failed']
    ),
    429: attError(
      'Too many requests from this IP (`rate_limited`, `Retry-After: 60`), or 32 unexpired challenges for this install (`attestation_failed`, `reason: too_many_challenges`; Play Integrity sends `Retry-After: 300`).',
      ['rate_limited', 'attestation_failed']
    ),
    500: attError('Unexpected failure.', ['server_error']),
    503: attError(
      'Challenge storage is unavailable, or Play Integrity isn’t configured on this worker (`reason: integrity_unavailable`). `Retry-After: 30`.',
      ['server_error']
    ),
  },
}

// --- POST /attestation/v1/register ----------------------------------------

const recoveryToken = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/)
  .meta({
    description:
      'A 256-bit secret the app keeps (43-character base64url). Only a verifier is stored; it lets a reinstall or a new key take over the install id later.',
  })

const attestRequestSchema = z.union([
  z
    .object({
      protocolVersion: z.literal(1).optional(),
      keyId: z.string(),
      attestation: z.string().meta({
        description: 'App Attest attestation object (base64).',
      }),
      challenge: z.string(),
      uuid: z.string(),
    })
    .meta({
      title: 'App Attest v1 (legacy)',
      description: 'Binds a key to the install id.',
    }),
  z
    .object({
      protocolVersion: z.literal(2),
      operation: z.literal('bind'),
      operationId,
      uuid: installId,
      keyId,
      challenge,
      attestation: z.string().meta({
        description:
          'App Attest attestation object (base64) whose client data hash is SHA-256 of `witnesswork.app-attest|2|bind|<operationId>|<challenge>|<uuid>|<tokenHash>`, where `tokenHash` is base64url SHA-256 of the decoded recovery token.',
      }),
      recoveryToken,
    })
    .meta({
      title: 'App Attest v2 bind',
      description:
        'Attests a key for the install id with a recovery token. Rebinding the same install to a new key requires the recovery token enrolled earlier.',
    }),
  z
    .object({
      protocolVersion: z.literal(2),
      operation: z.literal('enroll'),
      operationId,
      uuid: installId,
      keyId,
      challenge,
      assertion: z.string().max(65_536).meta({
        description:
          'Assertion by the active key over SHA-256 of `witnesswork.app-attest|2|enroll|<operationId>|<challenge>|<uuid>|<keyId>|<tokenHash>`.',
      }),
      recoveryToken,
    })
    .meta({
      title: 'App Attest v2 enroll',
      description:
        'Adds a recovery token to an install already bound by a legacy key.',
    }),
])

const attestResponseSchema = z.union([
  z.object({ ok: z.literal(true) }).meta({ title: 'App Attest v1 (legacy)' }),
  z
    .object({
      ok: z.literal(true),
      protocolVersion: z.literal(2),
      operationId,
      status: z
        .enum(['bound', 'already_bound', 'rotated', 'recovery_enrolled'])
        .meta({
          description:
            '`bound`: first key; `already_bound`: this key was already active; `rotated`: a new key replaced the old one with the recovery token; `recovery_enrolled`: enroll succeeded.',
        }),
      recoveryEnrolled: z.boolean(),
    })
    .meta({ title: 'App Attest v2' }),
])

const registerRoute: RouteDocs = {
  summary: 'Register an App Attest key',
  description: `iOS only. Binds a Secure Enclave key to the install id (v1 or v2 \`bind\`), or enrolls a v2 recovery token with the active key (\`enroll\`), using a challenge from \`POST /attestation/v1/challenge\`.

The attested App ID must be \`<team id>.<bundle id>\` for an accepted bundle id (the App Store app, plus the TestFlight Beta app on production); the key stays bound to the one it matched. Play Integrity has no registration step: a body with \`attestationProvider: "play-integrity"\` is a 400 with \`reason: unsupported_protocol\`.`,
  requestBody: jsonBody(attestRequestSchema),
  responses: {
    200: jsonResponse('Registered.', attestResponseSchema),
    400: attError(
      'Invalid JSON, missing fields, a Play Integrity body, or (v2) an invalid field or recovery token. Route-level checks answer `bad_request`; v2 checks in the lifecycle answer `attestation_failed` with `reason: invalid_request` or `unsupported_protocol`.',
      ['bad_request', 'attestation_failed']
    ),
    401: attError(
      `The challenge, attestation, or recovery token didn’t verify: \`challenge_not_found\`, \`challenge_expired\`, \`attestation_invalid\`, \`recovery_not_enrolled\` (\`action: enroll_recovery\`), \`recovery_token_mismatch\`, \`identity_not_bound\`. ${ATTESTATION_NOTE}`,
      ['attestation_failed', ...V1_CODES]
    ),
    409: attError(
      '`operationId` was already used with different data (`operation_conflict`).',
      ['attestation_failed']
    ),
    ...rateLimitedResponse,
    500: attError('Unexpected failure.', ['server_error']),
    503: attError('App Attest storage is unavailable. `Retry-After: 30`.', [
      'server_error',
    ]),
  },
}

// --- POST /attestation/v1/verify ------------------------------------------

const verifyPurpose = z.enum(['attestation-verify', 'notes-import-verify']).meta({
  description:
    '`attestation-verify`; `notes-import-verify`, which older apps sign, is accepted too.',
})

const verifyRequestSchema = z.union([
  z
    .object({
      protocolVersion: z.literal(1).optional(),
      uuid: z.string(),
      accountId,
      keyId: z.string(),
      challenge: z.string(),
      assertion: z.string().meta({
        description:
          'Assertion over SHA-256 of `<challenge>|<uuid>|<contentHash>`, or `<challenge>|<uuid>|<accountId>|<contentHash>` when `accountId` is sent.',
      }),
      contentHash: sha256Hex('Any value the client picks'),
    })
    .meta({ title: 'App Attest v1 (legacy)' }),
  z
    .object({
      uuid: installId,
      accountId,
      ...appAttestV2AssertionFields(verifyPurpose),
      contentHash: sha256Hex('Any value the client picks'),
      requestHash: sha256Hex('Must equal `contentHash`'),
    })
    .meta({ title: 'App Attest v2' }),
  z
    .object({
      uuid: installId,
      accountId,
      ...playIntegrityFields(verifyPurpose),
      contentHash: sha256Hex('Any value the client picks'),
      requestHash: sha256Hex('Must equal `contentHash`'),
    })
    .meta({ title: 'Play Integrity' }),
])

const verifyResponseSchema = z.union([
  z
    .object({ ok: z.literal(true) })
    .meta({ title: 'App Attest v1 (or dev bypass)' }),
  z
    .object({
      ok: z.literal(true),
      protocolVersion: z.literal(2),
      operationId,
    })
    .meta({ title: 'App Attest v2' }),
  z
    .object({
      ok: z.literal(true),
      attestationProvider: z.literal('play-integrity'),
      protocolVersion: z.literal(1),
      operationId,
    })
    .meta({ title: 'Play Integrity' }),
])

const verifyRoute: RouteDocs = {
  summary: 'Verify attestation (diagnostic)',
  description: `An attested no-op for the app’s developer tools. Runs the same verification as the protected routes, consuming the challenge and advancing the sign count, but touches no allowance and runs no model.

There is no payload, so \`requestHash\` must equal \`contentHash\` (v2 and Play Integrity). The purpose is \`attestation-verify\`; \`notes-import-verify\`, which older apps sign, is accepted too. Not gated by any feature's kill switch.`,
  parameters: [devBypassHeader],
  requestBody: jsonBody(verifyRequestSchema),
  responses: {
    200: jsonResponse('The attestation verified.', verifyResponseSchema),
    400: attError(
      'Invalid JSON, missing or malformed fields, `requestHash` ≠ `contentHash`, or an invalid v2 / Play Integrity request (`reason: invalid_request`).',
      ['bad_request', 'attestation_failed']
    ),
    ...attestationResponses,
    ...rateLimitedResponse,
    500: attError('Unexpected failure.', ['server_error']),
    503: attError(storageUnavailable, ['server_error']),
  },
}

// --- GET /attestation/v1/status -------------------------------------------

/** The provider fields, shared with Notes Import's `capabilities`. */
export const attestationProvidersShape = {
  appAttest: z.object({
    protocolVersions: z.array(z.number().int()).meta({
      description: 'App Attest protocol versions accepted: `[1, 2]`.',
    }),
  }),
  playIntegrity: z
    .object({
      protocolVersions: z.array(z.number().int()).meta({
        description: 'Play Integrity protocol versions accepted: `[1]`.',
      }),
      cloudProjectNumber: z.string().meta({
        description:
          'The Google Cloud project number the app passes to the Play Integrity standard-request provider.',
      }),
    })
    .optional()
    .meta({
      description:
        'Present only when this worker can verify Android requests. Android keeps attested features closed while it is absent.',
    }),
}

const statusRoute: RouteDocs = {
  summary: 'Accepted attestation providers',
  description:
    'Which attestation providers and protocol versions this worker accepts, from its configuration alone (no I/O, reused per isolate for 30 s, `Cache-Control: no-store`). The app reads `capabilities` here to open account sessions; it is the same object `GET /notes-import/status` carries in `capabilities` for older apps.',
  responses: {
    200: jsonResponse(
      'The accepted providers.',
      z.object({
        ok: z.literal(true),
        capabilities: z.object(attestationProvidersShape),
        providers: z.object(attestationProvidersShape).meta({
          description: 'Deprecated: the same object as `capabilities`, for builds that read this name.',
          deprecated: true,
        }),
      })
    ),
    ...rateLimitedResponse,
  },
}

// --- Routes ---------------------------------------------------------------

type RouteDocs = Omit<Parameters<typeof describeRoute>[0], 'tags'> & {
  summary: string
  description: string
}

const docs = (route: RouteDocs) => describeRoute({ ...route, tags: [TAG] })

/**
 * The same docs on an old `/notes-import/*` path, which serves the same
 * handler for deployed apps.
 */
const movedDocs = (successor: string, route: RouteDocs) =>
  describeRoute({
    ...route,
    tags: [LEGACY_TAG],
    summary: `${route.summary} (moved)`,
    deprecated: true,
    description: `Moved to \`${successor}\`, which runs the same handler; this path stays for deployed apps. Responses add \`Deprecation\` and \`Link: <${successor.split(' ')[1]}>; rel="successor-version"\`.\n\n${route.description}`,
  })

export const challengeDocs = docs(challengeRoute)
export const registerDocs = docs(registerRoute)
export const verifyDocs = docs(verifyRoute)
export const statusDocs = docs(statusRoute)

export const legacyChallengeDocs = movedDocs(
  'POST /attestation/v1/challenge',
  challengeRoute
)
export const legacyAttestDocs = movedDocs(
  'POST /attestation/v1/register',
  registerRoute
)
export const legacyVerifyDocs = movedDocs(
  'POST /attestation/v1/verify',
  verifyRoute
)
