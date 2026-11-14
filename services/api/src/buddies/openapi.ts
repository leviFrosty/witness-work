import { z } from 'zod'
import { describeRoute, type DescribeRouteOptions } from 'hono-openapi'
import type { MiddlewareHandler } from 'hono'
import {
  apiErrorSchema,
  staleErrorSchema,
  b64u,
  signedEnvelopeSchema,
  unsignedEnvelopeSchema,
  buddiesId,
  errorResponse,
  fieldTable,
  jsonBody,
  jsonResponse,
  signedBody,
} from '../openapi/schemas'
import {
  BUDDIES_CLIENT_HEADER,
  BUDDIES_ERROR_STATUS,
  BUDDIES_LIMITS,
  BUDDIES_LIVE_CLOSE,
  BUDDIES_NOTIFICATION_SERVICE_CLIENT,
  type BuddiesErrorCode,
  type BuddiesOp,
} from './contracts'
import { BUDDIES_ABUSE_LIMITS, type BuddiesEdgeTier } from './limits'

/**
 * OpenAPI descriptions for the Buddies relay (`/buddies/v1`). The wire
 * contract is docs/buddies-protocol.md; the payload schemas below are for
 * readers only and mirror `BUDDIES_FIELD_PARSERS` in contracts.ts, which
 * stays the authority. Update both together.
 *
 * Every route documents both ways to authenticate (witness-work ADR 0027):
 * a bearer request (`Authorization: Bearer`, first) and the legacy form
 * shipped app builds send while the legacy switch is on.
 */

type Responses = NonNullable<DescribeRouteOptions['responses']>

const TAGS = ['Buddies']
/** A bearer token, or (while the legacy switch is on) none: the legacy form. */
const BEARER_OR_LEGACY: Record<string, string[]>[] = [{ bearerAuth: [] }, {}]

/** `describeRoute` with the Buddies tag and both ways to authenticate. */
const describeOp = (options: DescribeRouteOptions) =>
  describeRoute({ tags: TAGS, security: BEARER_OR_LEGACY, ...options })
const KIB = 1_024
const kib = (bytes: number) => `${bytes / KIB} KiB`
const count = (n: number) => n.toLocaleString('en-US')

// --- Payload fields -------------------------------------------------------

const ts = z.number().meta({
  description:
    'Signing time, epoch ms (a fraction is floored). More than 5 minutes from the relay clock is `stale`.',
})
const nonce = buddiesId(
  'Random 16 bytes; reusing one for the same inbox within 10 minutes is `replay`'
)
const inboxId = buddiesId('The target inbox')
const slotId = buddiesId('The writer slot in that inbox')

/** 32 bytes as base64url: keys, hashes, blob ids, and read tokens. */
const bytes32 = (description: string) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .meta({ description: `${description} (43-character base64url, 32 bytes)` })

const sealed = (what: string, maxBytes: number) =>
  b64u(`${what}, sealed by the app; 1 byte to ${kib(maxBytes)} decoded`)

/** A signed payload: the op's fields plus `ts` and `nonce`. */
const signedPayload = (fields: z.ZodRawShape) =>
  z.object({ ...fields, ts, nonce })

/** An owner op's fields, with the legacy envelope's `ts` and `nonce` marked as such. */
const ownerFields = (fields: z.ZodRawShape) =>
  z.object({
    ...fields,
    ts: ts.optional().meta({
      description: `Legacy envelope only, and required there. ${ts.description}`,
    }),
    nonce: nonce.optional().meta({
      description: `Legacy envelope only, and required there. ${nonce.description}`,
    }),
  })

/**
 * An owner op's body: the fields as plain JSON (bearer), or the
 * owner-signed envelope whose decoded `payload` adds `ts` and `nonce`
 * (legacy).
 */
const ownerBody = (op: string, fields: z.ZodRawShape) =>
  jsonBody(
    z.union([
      z.object(fields).meta({ title: 'Bearer' }),
      signedEnvelopeSchema.meta({ title: 'Legacy envelope' }),
    ]),
    `**Bearer:** the fields as plain JSON, without \`ts\` or \`nonce\`; an envelope is \`bad_request\`.\n\n**Legacy:** the envelope, owner-signed (op \`${op}\`); its decoded \`payload\` is the fields plus \`ts\` and \`nonce\`.\n\n**Fields:**\n\n${fieldTable(ownerFields(fields))}`
  )

const okSchema = z.object({ ok: z.literal(true) })
const seqSchema = z.object({
  ok: z.literal(true),
  seq: z.number().int().meta({
    description: 'The inbox `seq` this write took (per-inbox, monotonic).',
  }),
})

// --- Descriptions ---------------------------------------------------------

const paragraphs = (...lines: string[]) => lines.join('\n\n')

const TIER_NAMES: Record<BuddiesEdgeTier, string> = {
  unsigned: 'unsigned invite',
  register: 'registration',
  read: 'read',
  write: 'write',
  blobPut: 'photo upload',
  blobGet: 'photo download',
}

const perMinute = (tier: BuddiesEdgeTier) =>
  `${count(BUDDIES_ABUSE_LIMITS.edge[tier].perMinute)} a minute`

/** The per-caller tier sentence every op's description carries. */
const tierLine = (tier: BuddiesEdgeTier) =>
  `**Rate limit:** the ${TIER_NAMES[tier]} tier, ${perMinute(tier)} per caller (the session’s account for a bearer request, else the client IP, IPv6 by /64), checked before any Durable Object wakes.`

const OWNER_BUDGET = `the owner key's ${count(BUDDIES_ABUSE_LIMITS.ownerRequests)} requests that take effect per 10 minutes`
const WRITER_BUDGET = `the slot's ${count(BUDDIES_ABUSE_LIMITS.writerRequests)} requests that take effect per 10 minutes`

const KILL_SWITCH_OFF =
  '**Kill switch:** refused with `disabled` while Buddies is off.'
const KILL_SWITCH_EXEMPT =
  '**Kill switch:** keeps working while Buddies is off, so people can always leave.'
const PHOTOS_SWITCH =
  '**Photos switch:** also needs photo blobs on (KV `buddies:photos`, else `BUDDIES_PHOTOS`); off, it answers `photos_disabled`. Buddies’ own switch wins.'

const LEGACY_SWITCH =
  'It works while the legacy switch (KV `auth:legacy`) is on; once it’s off, a legacy request is 426 `upgrade_required`. A request with an `Authorization` header is always a bearer request and never falls back.'

/** Owner-signed requests after a key change (witness-work ADR 0039). */
const OLD_KEY_OWNER =
  'Legacy: the inbox was first linked to an account whose key has changed since (`reason: "key_changed"`). Its owner key comes from the old account key, so owner-signed requests stop at the change for good, the Notification Service Extension’s sync included, even after the new key registers the inbox again. The old inbox is usable only through bearer owner ops, and the User’s device deletes it with a successor. Refused before the inbox wakes, whatever the signature.'

const SIGNED_BY = {
  owner: paragraphs(
    '**Bearer:** `Authorization: Bearer <access token>` and the fields as plain JSON, without `ts` or `nonce`. The inbox must be linked to the token’s account: another account’s inbox is `forbidden`, and one with no confirmed link (registered before accounts, or its linking registration failed part-way) is `not_linked` (link it with a bearer `inbox/register`, then retry).',
    `**Legacy** (no \`Authorization\` header; app versions before sessions): the envelope, signed by the inbox owner key (the \`ownerPub\` stored for \`inboxId\`). ${LEGACY_SWITCH} After the account’s key changes, an inbox first linked under the old key refuses it with \`unauthorized\`, \`reason: "key_changed"\`, for good: use bearer requests, and delete the inbox with a successor.`
  ),
  writer: paragraphs(
    '**Signed by** the writer key registered for (`inboxId`, `slotId`) with `slot/add`: the signature is the slot’s capability, in both forms.',
    '**Bearer:** `Authorization: Bearer <access token>` plus the writer-signed envelope. The relay checks the token’s session but never compares its account with the slot or stores it, so it can’t tell which account writes into which inbox.',
    `**Legacy** (no \`Authorization\` header): the envelope alone. ${LEGACY_SWITCH}`
  ),
  self: paragraphs(
    '**Self-signed** by `ownerPub` in the payload (proof of possession), in both forms.',
    '**Bearer:** `Authorization: Bearer <access token>` plus the envelope, whose `account` proof is required and must name the token’s account (`forbidden` otherwise), so the inbox is linked to it.',
    `**Legacy** (no \`Authorization\` header): the envelope alone; \`account\` is optional. ${LEGACY_SWITCH}`
  ),
  unsigned: paragraphs(
    '**Unsigned:** send `{ "payload": … }` only, no `signature`, `ts`, or `nonce`. Knowing the ids and secrets is the capability.',
    `**Bearer:** \`Authorization: Bearer <access token>\` plus the same body. **Legacy** (no \`Authorization\` header): the body alone. ${LEGACY_SWITCH}`
  ),
} as const

// --- Errors ---------------------------------------------------------------

const DEFAULT_REASONS: Partial<Record<BuddiesErrorCode, string>> = {
  bad_request: `Malformed envelope or payload (missing fields, wrong sizes, bad ids), or a body over ${kib(BUDDIES_LIMITS.requestBytes)}.`,
  stale:
    '`ts` is more than 5 minutes from the relay clock. The body carries `serverTime` (epoch ms) and the response a `Date` header; correct the clock offset and re-sign once with a fresh `ts` and `nonce`.',
  replay: 'This `nonce` was already used for the inbox in the last 10 minutes.',
  not_found:
    'Unknown inbox: never registered, deleted, or wiped after 180 days without an owner op.',
  suspended:
    'The inbox’s account is suspended (only `inbox/delete` and `slot/remove` still work).',
  disabled:
    'The Buddies kill switch is off, or (bearer) this worker has no account sessions. `Retry-After: 60`.',
  unauthorized:
    'A bearer request’s access token is missing, malformed, expired, or invalid (`WWW-Authenticate: Bearer error="invalid_token"`). Refresh it once and retry; it never falls back to the legacy form.',
  upgrade_required:
    'A legacy request (no `Authorization` header) after the legacy switch (KV `auth:legacy`) was turned off. Only updating the app helps; no `Retry-After`.',
  forbidden: 'Bearer: the inbox is linked to another account than the token’s.',
  not_linked:
    'Bearer: the inbox has no confirmed link to an account: it was registered before accounts, or the registration that linked it failed part-way. Link it with a bearer `inbox/register` (with its `account` proof), then retry; registering again is idempotent.',
  photos_disabled:
    'Photo blobs are off (KV `buddies:photos`), or this worker has no blob bucket. `Retry-After: 60`.',
}

const RETRY_AFTER_HEADER = {
  'Retry-After': {
    description:
      'Seconds to wait; repeated as `retryAfter` in the body. Absent on `limit`.',
    schema: { type: 'integer' as const },
  },
}

const STALE_HEADERS = {
  Date: {
    description: 'The relay clock (on `stale`).',
    schema: { type: 'string' as const },
  },
}

const BEARER_CHALLENGE_HEADERS = {
  'WWW-Authenticate': {
    description: '`Bearer error="invalid_token"` (on `unauthorized`).',
    schema: { type: 'string' as const },
  },
}

const STATUS_SUMMARY: Record<number, string> = {
  400: 'Bad request.',
  401: 'Not authenticated.',
  403: 'Forbidden.',
  404: 'Not found.',
  409: 'Conflict.',
  410: 'Gone.',
  413: 'Body too large.',
  426: 'Upgrade required.',
  429: 'Too many requests, or a cap was hit.',
  503: 'Switched off.',
}

/**
 * The error responses an op can return, grouped by status: each code with
 * why this op returns it (`DEFAULT_REASONS` unless given). Every op can also
 * fail unexpectedly with 500 `internal`.
 */
const refusals = (
  reasons: Partial<Record<BuddiesErrorCode, string | true>>
): Responses => {
  const byStatus = new Map<number, BuddiesErrorCode[]>()
  for (const code of Object.keys(reasons) as BuddiesErrorCode[]) {
    const status = BUDDIES_ERROR_STATUS[code]
    byStatus.set(status, [...(byStatus.get(status) ?? []), code])
  }
  const responses: Responses = {}
  for (const [status, codes] of [...byStatus].sort(([a], [b]) => a - b)) {
    const lines = codes.map((code) => {
      const reason = reasons[code]
      const text = reason === true ? DEFAULT_REASONS[code] : reason
      return `- \`${code}\`: ${text}`
    })
    const hasStale = codes.includes('stale')
    const response = errorResponse(
      `${STATUS_SUMMARY[status]}\n\n${lines.join('\n')}`,
      codes,
      hasStale ? staleErrorSchema : apiErrorSchema
    )
    const headers = {
      ...(status === 429 || status === 503 ? RETRY_AFTER_HEADER : {}),
      ...(hasStale ? STALE_HEADERS : {}),
      ...(codes.includes('unauthorized') ? BEARER_CHALLENGE_HEADERS : {}),
    }
    responses[status] = Object.keys(headers).length
      ? { ...response, headers }
      : response
  }
  responses[500] = errorResponse(
    'Unexpected failure. The body never names the request.',
    ['internal']
  )
  return responses
}

const edgeLimited = (tier: BuddiesEdgeTier) =>
  `More than ${perMinute(tier)} from this caller in the ${TIER_NAMES[tier]} tier (\`Retry-After: 60\`)`

/** The refusals every route shares, for its two ways to authenticate. */
const AUTH_REFUSALS = {
  unauthorized: true as const,
  upgrade_required: true as const,
}

/** The refusals every owner op shares, before op-specific ones. */
const ownerRefusals = (
  tier: BuddiesEdgeTier,
  { killSwitch = true, suspendable = true } = {}
) => ({
  bad_request: true as const,
  bad_signature:
    'Legacy: signature missing, malformed, or not by the owner key.',
  stale: `Legacy only. ${DEFAULT_REASONS.stale}`,
  ...AUTH_REFUSALS,
  unauthorized: `${DEFAULT_REASONS.unauthorized} ${OLD_KEY_OWNER}`,
  forbidden: true as const,
  ...(suspendable ? { suspended: true as const } : {}),
  not_found: true as const,
  replay: `Legacy only. ${DEFAULT_REASONS.replay}`,
  not_linked: true as const,
  rate_limited: `${edgeLimited(tier)}, or ${OWNER_BUDGET} are spent (\`Retry-After\` until the window ends).`,
  ...(killSwitch ? { disabled: true as const } : {}),
})

/**
 * A bearer write into someone else's inbox from a suspended account
 * (`BUDDIES_SUSPENDED_REFUSED_OPS`).
 */
const SENDER_SUSPENDED =
  'Bearer: the token’s account is suspended, so it can’t reach other people (it can still leave). Checked from the account’s status, cached up to 30 s; the inbox never learns which account wrote. A legacy request names no account and isn’t refused.'

const SLOT_SEALED =
  'The slot’s writer sealed it (`slot/seal`): only `slot/leave` and `slot/seal` still work, for good.'

/** The refusals every writer op shares. */
const writerRefusals = (extraRateLimit = '') => ({
  bad_request: true as const,
  bad_signature:
    'Signature missing, malformed, or not by the slot’s writer key.',
  stale: true as const,
  ...AUTH_REFUSALS,
  suspended: SENDER_SUSPENDED,
  not_found: true as const,
  gone: 'The slot doesn’t exist: the inbox owner removed you (or never added you).',
  replay: true as const,
  rate_limited: `${edgeLimited('write')}, ${WRITER_BUDGET} are spent${extraRateLimit}.`,
  disabled: true as const,
  sealed: SLOT_SEALED,
})

// --- Ops ------------------------------------------------------------------

const syncSchema = z.object({
  ok: z.literal(true),
  seq: z.number().int().meta({
    description:
      'The inbox head, or, when a page stopped early, the cursor it reached: pass it as the next `since`.',
  }),
  slots: z
    .array(
      z.object({
        slotId: z.string(),
        createdAt: z.number().int(),
        sealed: z.literal(true).optional().meta({
          description:
            'Present only once the slot’s writer sealed it (`slot/seal`): it takes no more writes, but its card and events stay until it’s left or removed.',
        }),
      })
    )
    .meta({
      description:
        'Always the complete current list (≤ 5), so a missing slot means that buddy left.',
    }),
  cards: z
    .array(
      z.object({
        slotId: z.string(),
        blob: z.string().meta({ description: 'Sealed Buddy Card.' }),
        seq: z.number().int(),
        updatedAt: z.number().int(),
      })
    )
    .meta({ description: 'Cards with `seq > since`.' }),
  events: z
    .array(
      z.object({
        eventId: z.string(),
        slotId: z.string().meta({
          description: '`""` for events the relay wrote (`invite.claimed`).',
        }),
        kind: z.string(),
        blob: z.string().meta({ description: 'Sealed event.' }),
        seq: z.number().int(),
        createdAt: z.number().int(),
      })
    )
    .meta({
      description: `Events with \`seq > since\`, in \`seq\` order. A page stops at ${count(BUDDIES_ABUSE_LIMITS.syncEvents)} events or 4 MiB of blobs.`,
    }),
  roster: z
    .object({ blob: z.string(), seq: z.number().int() })
    .nullable()
    .meta({ description: 'The sealed roster, or `null` when unchanged.' }),
  capabilities: z
    .object({
      photos: z.boolean().meta({
        description:
          'Photo blobs are on. Read a missing `capabilities` (older relays) as false.',
      }),
    })
    .meta({ description: 'Optional relay features available right now.' }),
})

export const buddiesOpDocs: Record<BuddiesOp, MiddlewareHandler> = {
  'inbox/register': describeOp({
    summary: 'Register an inbox',
    description: paragraphs(
      'Creates the inbox, or refreshes it. Idempotent for the same `ownerPub`; a different key is `conflict`, even after the inbox was deleted or wiped (the relay keeps a hash of the owner key forever).',
      SIGNED_BY.self,
      'With `account`, the inbox is linked to that anonymous account (written only after the inbox accepted the registration, so the link takes both keys). The answer carries `accountId` once the inbox belongs to an account. Without the accounts database the proof is ignored.',
      `${tierLine('register')} Validly signed registrations also count toward ${count(BUDDIES_ABUSE_LIMITS.registrationsPerDay)} per caller per rolling day.`,
      KILL_SWITCH_OFF,
      'Bearer requests come from an attested session (attestation happens once, when the session opens); legacy requests aren’t attested. A reserved `attest` field is accepted and ignored.'
    ),
    requestBody: signedBody(
      signedPayload({
        inboxId: buddiesId('The inbox to register'),
        ownerPub: bytes32('Ed25519 owner public key'),
        account: z
          .object({
            accountId: buddiesId('The account'),
            signature: b64u(
              'Ed25519 signature (64 bytes) by the account signing key over `ww-account/v1\\ninbox/link\\n<accountId>\\n<inboxId>\\n<ownerPub>`'
            ),
          })
          .optional()
          .meta({
            description:
              'Links the inbox to an account. Required in a bearer request, for the token’s account; optional in a legacy one (absent from builds before accounts).',
          }),
      }),
      'Self-signed: `signature` verifies against the payload’s own `ownerPub`.'
    ),
    responses: {
      200: jsonResponse(
        'Registered (or refreshed).',
        z.object({
          ok: z.literal(true),
          accountId: buddiesId('The account the inbox belongs to')
            .optional()
            .meta({ description: 'Present once the inbox is linked.' }),
        })
      ),
      ...refusals({
        bad_request: `${DEFAULT_REASONS.bad_request} Also a bearer request without \`account\`.`,
        bad_signature:
          'Signature not by `ownerPub`, or the `account` signature is not by that account.',
        stale: true,
        ...AUTH_REFUSALS,
        unauthorized: `${DEFAULT_REASONS.unauthorized} Legacy: the inbox was first linked to an account whose key has changed since (\`reason: "key_changed"\`), with or without \`account\`; it only takes bearer requests now.`,
        forbidden:
          'Bearer: `account` names another account than the token’s.',
        suspended:
          'The inbox, or the account named in `account`, is suspended.',
        unknown_account: '`account.accountId` doesn’t exist.',
        replay: true,
        conflict:
          'The inbox is registered (or was, before a wipe) with a different `ownerPub`, is linked to a different account, or was replaced by a successor after a key change (never registered again).',
        rate_limited: `${edgeLimited('register')}, or the caller’s ${count(BUDDIES_ABUSE_LIMITS.registrationsPerDay)} registrations a day are spent (\`Retry-After\` until the oldest leaves the window).`,
        disabled: `${DEFAULT_REASONS.disabled} Also a bearer request on a worker without the accounts database.`,
      }),
    },
  }),

  'inbox/sync': describeOp({
    summary: 'Sync the inbox',
    description: paragraphs(
      'Returns everything with `seq > since` (cards, events, the roster) plus the complete slot list, and which optional relay features are on. Counts as owner activity for the 180-day retention.',
      SIGNED_BY.owner,
      `**Notification Service Extension** (iOS): it fetches events too big for a push and can’t hold the session’s rotating refresh token, so it keeps sending the legacy owner-signed form with \`${BUDDIES_CLIENT_HEADER}: ${BUDDIES_NOTIFICATION_SERVICE_CLIENT}\`. That request is still served after the legacy switch is off, for an inbox with a confirmed account link (its owner registered it on a session): the signature, \`ts\`, nonce, and suspension are checked as ever. An inbox without one gets 426 \`upgrade_required\`, as does every other op with the header. While the switch is on, the header changes nothing.`,
      tierLine('read'),
      KILL_SWITCH_OFF
    ),
    parameters: [
      {
        name: BUDDIES_CLIENT_HEADER,
        in: 'header' as const,
        required: false,
        schema: {
          type: 'string' as const,
          enum: [BUDDIES_NOTIFICATION_SERVICE_CLIENT],
        },
        description: `Only the iOS Notification Service Extension sends it, on its legacy owner-signed sync: \`${BUDDIES_NOTIFICATION_SERVICE_CLIENT}\`. Ignored on bearer requests and while the legacy switch is on.`,
      },
    ],
    requestBody: ownerBody('inbox/sync', {
        inboxId,
        since: z.number().int().min(0).meta({
          description:
            'The last `seq` this device has applied; `0` for everything.',
        }),
      }),
    responses: {
      200: jsonResponse('What changed since `since`.', syncSchema),
      ...refusals({
        ...ownerRefusals('read'),
        upgrade_required: `${DEFAULT_REASONS.upgrade_required} Except the Notification Service Extension’s sync (\`${BUDDIES_CLIENT_HEADER}: ${BUDDIES_NOTIFICATION_SERVICE_CLIENT}\`) for an inbox with a confirmed account link; without one, it’s refused too.`,
      }),
    },
  }),

  'inbox/delete': describeOp({
    summary: 'Delete the inbox',
    description: paragraphs(
      'Wipes the inbox (slots, cards, events, devices, roster, photo blobs) and every open invite it created, closing its live sockets with 4001. Only a hash of the owner key is kept, so only that key can register the `inboxId` again.',
      SIGNED_BY.owner,
      '**`successor`** (after an account key change, witness-work ADR 0039 §5): names the inbox that replaces this one, which buddies then read with `inbox/successor` to check a reconnect invite. Bearer only, from a session of the account the inbox is linked to (not suspended: `suspended`) that is still live at the account’s key epoch. It must be another registered inbox linked to the same account at its current key epoch (linked, or registered again, with a proof by the current key) with no successor of its own, else `conflict` and nothing is deleted. Once deleted, the inbox’s account link is dropped and it can never be registered again (`inbox/register` answers `conflict`). The first successor recorded stays while it still qualifies (another one is `conflict`); one that no longer does (recorded before a key change) is replaced. The successor is recorded first and kept 90 days, and dropped again if the inbox refuses the deletion or can’t be reached; repeating the request answers `ok` once the inbox is gone. Without it, nothing changes.',
      `${tierLine('write')} Works for a suspended account.`,
      KILL_SWITCH_EXEMPT
    ),
    requestBody: ownerBody('inbox/delete', {
      inboxId,
      successor: buddiesId(
        'The inbox that replaces this one after a key change. Bearer only'
      ).optional(),
    }),
    responses: {
      200: jsonResponse('Deleted.', okSchema),
      ...refusals({
        ...ownerRefusals('write', { killSwitch: false, suspendable: false }),
        unauthorized: `${DEFAULT_REASONS.unauthorized} With \`successor\`, also a token whose session ended (a key change ends every other session) or is behind the account’s key epoch.`,
        forbidden: `${DEFAULT_REASONS.forbidden} Also \`successor\` in a legacy request.`,
        suspended:
          'With `successor`: the inbox’s account is suspended. Deleting without one still works.',
        conflict:
          '`successor` is this inbox, isn’t registered (deleted or wiped), isn’t linked to the same account at its current key epoch, has a successor of its own, or differs from a successor already recorded that still qualifies. Nothing is deleted.',
        disabled:
          'With `successor`, on a worker without the accounts database.',
      }),
    },
  }),

  'device/register': describeOp({
    summary: 'Register a device for pushes',
    description: paragraphs(
      `Upserts a push device by \`deviceId\`. At most ${BUDDIES_LIMITS.devices} per inbox; past that the least recently registered is evicted. One device per token: a token another \`deviceId\` holds moves here. Apps re-register about daily, which bumps eviction order.`,
      '`pushService` picks the fields: APNs (iOS; also when absent) takes `apnsToken`, `apnsEnvironment`, and `apnsTopic`; FCM (Android) takes `fcmToken` and `appAlerts`. The other service’s fields are ignored.',
      SIGNED_BY.owner,
      tierLine('write'),
      KILL_SWITCH_OFF
    ),
    requestBody: ownerBody('device/register', {
        inboxId,
        deviceId: buddiesId('The device'),
        pushService: z.enum(['apns', 'fcm']).optional().meta({
          description: 'How the relay reaches the device. Default `apns`.',
        }),
        apnsToken: z
          .string()
          .regex(/^(?:[0-9A-Fa-f]{2}){16,128}$/)
          .optional()
          .meta({
            description: 'APNs only, required: the device token (hex).',
          }),
        apnsEnvironment: z
          .enum(['sandbox', 'production'])
          .optional()
          .meta({ description: 'APNs only, required.' }),
        apnsTopic: z.string().optional().meta({
          description:
            'APNs only: the app’s bundle id. Must be `IOS_BUNDLE_ID` or one of `IOS_ADDITIONAL_BUNDLE_IDS`, else `bad_request`; absent means `IOS_BUNDLE_ID`.',
        }),
        fcmToken: z
          .string()
          .regex(/^[A-Za-z0-9_:-]{32,4096}$/)
          .optional()
          .meta({
            description: 'FCM only, required: the registration token.',
          }),
        appAlerts: z.boolean().optional().meta({
          description:
            'FCM only: the app posts its own named alerts, so the template is sent as fallback text expo-notifications doesn’t show.',
        }),
        templates: z
          .record(z.string(), z.object({ title: z.string(), body: z.string() }))
          .meta({
            description: `\`{ [kind]: { title, body } }\`, already localized: at most ${BUDDIES_LIMITS.templates} kinds (\`^[a-z][a-z0-9.]*$\`, ≤ ${BUDDIES_LIMITS.kindChars} chars), strings ≤ ${BUDDIES_LIMITS.templateChars} characters. A kind without a template gets no push on this device.`,
          }),
      }),
    responses: {
      200: jsonResponse('Registered.', okSchema),
      ...refusals({
        ...ownerRefusals('write'),
        bad_request: `${DEFAULT_REASONS.bad_request} Also an \`apnsTopic\` this worker doesn’t serve.`,
      }),
    },
  }),

  'device/unregister': describeOp({
    summary: 'Unregister a device',
    description: paragraphs(
      'Removes a push device. Idempotent.',
      SIGNED_BY.owner,
      tierLine('write'),
      KILL_SWITCH_OFF
    ),
    requestBody: ownerBody('device/unregister', { inboxId, deviceId: buddiesId('The device') }),
    responses: {
      200: jsonResponse('Unregistered.', okSchema),
      ...refusals(ownerRefusals('write')),
    },
  }),

  'slot/add': describeOp({
    summary: 'Add a buddy’s writer slot',
    description: paragraphs(
      `Registers a buddy’s writer key in this inbox. Idempotent for the same key. At most ${BUDDIES_LIMITS.slotsPlusOpenInvites} slots plus open invites. Signals live sockets.`,
      SIGNED_BY.owner,
      tierLine('write'),
      KILL_SWITCH_OFF
    ),
    requestBody: ownerBody('slot/add', {
        inboxId,
        slotId: buddiesId('The new slot'),
        writerPub: bytes32('The buddy’s Ed25519 writer public key'),
      }),
    responses: {
      200: jsonResponse('Added.', okSchema),
      ...refusals({
        ...ownerRefusals('write'),
        conflict: 'The slot exists with a different `writerPub`.',
        limit: `Slots plus open invites are already ${BUDDIES_LIMITS.slotsPlusOpenInvites}. No \`Retry-After\`: only removing a buddy or an invite frees a spot.`,
      }),
    },
  }),

  'slot/remove': describeOp({
    summary: 'Remove a buddy’s slot',
    description: paragraphs(
      'Deletes the slot, its card, and its events. Idempotent. Signals live sockets when a slot was removed.',
      SIGNED_BY.owner,
      `${tierLine('write')} Works for a suspended account.`,
      KILL_SWITCH_EXEMPT
    ),
    requestBody: ownerBody('slot/remove', { inboxId, slotId: buddiesId('The slot to remove') }),
    responses: {
      200: jsonResponse('Removed (or already gone).', okSchema),
      ...refusals(
        ownerRefusals('write', { killSwitch: false, suspendable: false })
      ),
    },
  }),

  'roster/put': describeOp({
    summary: 'Replace the roster',
    description: paragraphs(
      'Replaces the encrypted roster (last writer wins; clients merge first). Takes the next `seq` and signals live sockets.',
      SIGNED_BY.owner,
      tierLine('write'),
      KILL_SWITCH_OFF
    ),
    requestBody: ownerBody('roster/put', {
        inboxId,
        blob: sealed('The roster', BUDDIES_LIMITS.rosterBytes),
      }),
    responses: {
      200: jsonResponse('Stored.', seqSchema),
      ...refusals(ownerRefusals('write')),
    },
  }),

  'invite/create': describeOp({
    summary: 'Create an invite',
    description: paragraphs(
      `Uploads a sealed invite card under \`inviteId\` for a buddy to fetch and claim. Per inbox: at most ${BUDDIES_LIMITS.openInvites} open invites and ${BUDDIES_LIMITS.slotsPlusOpenInvites} slots plus open invites (\`limit\`), and ${BUDDIES_LIMITS.inviteCreations} creations per rolling 24 h (\`rate_limited\`).`,
      SIGNED_BY.owner,
      tierLine('write'),
      KILL_SWITCH_OFF,
      'Bearer requests come from an attested session (attestation happens once, when the session opens); legacy requests aren’t attested. A reserved `attest` field is accepted and ignored.'
    ),
    requestBody: ownerBody('invite/create', {
        inboxId,
        inviteId: buddiesId('The new invite, derived from the link secret'),
        claimVerifier: bytes32('`b64u(SHA-256(claimSecret))`'),
        blob: sealed('The invite card', BUDDIES_LIMITS.inviteBytes),
        expiresAt: z.number().int().meta({
          description:
            'Epoch ms, after now and at most 7 days + 5 minutes ahead of the relay clock.',
        }),
      }),
    responses: {
      200: jsonResponse('Created.', okSchema),
      ...refusals({
        ...ownerRefusals('write'),
        bad_request: `${DEFAULT_REASONS.bad_request} Also an \`expiresAt\` in the past or more than 7 days + 5 minutes ahead.`,
        not_found: `${DEFAULT_REASONS.not_found} Also when the inbox was deleted while the invite was being created.`,
        conflict: 'An invite with this `inviteId` exists.',
        limit: `The inbox has ${BUDDIES_LIMITS.openInvites} open invites, or slots plus open invites are ${BUDDIES_LIMITS.slotsPlusOpenInvites}. No \`Retry-After\`.`,
        rate_limited: `${edgeLimited('write')}, ${OWNER_BUDGET} are spent, or the inbox created ${BUDDIES_LIMITS.inviteCreations} invites in the last 24 h (\`Retry-After\` until the oldest leaves the window).`,
      }),
    },
  }),

  'invite/delete': describeOp({
    summary: 'Delete an invite',
    description: paragraphs(
      'Deletes an invite this inbox created (cancel, confirm, or reject). Idempotent; an invite another inbox created is left alone.',
      SIGNED_BY.owner,
      tierLine('write'),
      KILL_SWITCH_OFF
    ),
    requestBody: ownerBody('invite/delete', { inboxId, inviteId: buddiesId('The invite') }),
    responses: {
      200: jsonResponse('Deleted (or already gone).', okSchema),
      ...refusals(ownerRefusals('write')),
    },
  }),

  'blob/delete': describeOp({
    summary: 'Delete photo blobs',
    description: paragraphs(
      'Deletes photo blobs from the sender’s own inbox. Reads stop at once; the stored objects go right after (retried from the inbox alarm if storage fails). Idempotent: unknown ids succeed.',
      SIGNED_BY.owner,
      tierLine('write'),
      KILL_SWITCH_OFF,
      PHOTOS_SWITCH
    ),
    requestBody: ownerBody('blob/delete', {
        inboxId,
        blobIds: z
          .array(bytes32('A blob id'))
          .min(1)
          .max(BUDDIES_LIMITS.blobDeleteIds)
          .meta({
            description: `1 to ${BUDDIES_LIMITS.blobDeleteIds} canonical blob ids; duplicates are fine.`,
          }),
      }),
    responses: {
      200: jsonResponse('Deleted.', okSchema),
      ...refusals({ ...ownerRefusals('write'), photos_disabled: true }),
    },
  }),

  'card/put': describeOp({
    summary: 'Replace your Buddy Card',
    description: paragraphs(
      `Replaces the writer slot’s card in the recipient’s inbox. Takes the next \`seq\` and signals live sockets. Counts toward the slot’s ${BUDDIES_LIMITS.writesPerSlot} writes per hour (with \`event/put\`).`,
      SIGNED_BY.writer,
      tierLine('write'),
      KILL_SWITCH_OFF
    ),
    requestBody: signedBody(
      signedPayload({
        inboxId: buddiesId('The recipient’s inbox'),
        slotId,
        blob: sealed('The Buddy Card', BUDDIES_LIMITS.cardBytes),
      }),
      'Writer-signed (op `card/put`).'
    ),
    responses: {
      200: jsonResponse('Stored.', seqSchema),
      ...refusals(
        writerRefusals(
          `, or the slot’s ${BUDDIES_LIMITS.writesPerSlot} writes this hour are spent (\`Retry-After\` until the oldest ages out)`
        )
      ),
    },
  }),

  'event/put': describeOp({
    summary: 'Append an event',
    description: paragraphs(
      'Appends a sealed event to the recipient’s inbox, deduplicated on `eventId`: a repeat returns the original `seq` and never pushes. Takes the next `seq` and signals live sockets. Events are deleted 30 days after creation.',
      `With \`push: true\` the relay alerts every device in the inbox that registered a template for \`kind\`, within the slot’s push budget: ${BUDDIES_LIMITS.pushesPerSlot} per 24 h, at least 60 s apart except for immediate kinds (invitations and answers). An alert over budget is dropped; the event is stored either way.`,
      `**Caps:** ${BUDDIES_LIMITS.writesPerSlot} writes per slot per hour (with \`card/put\`); stored events per slot ${count(BUDDIES_ABUSE_LIMITS.slotEvents)} and 16 MiB, per inbox 128 MiB. Past a cap nothing is stored and nothing stored is dropped.`,
      SIGNED_BY.writer,
      tierLine('write'),
      KILL_SWITCH_OFF
    ),
    requestBody: signedBody(
      signedPayload({
        inboxId: buddiesId('The recipient’s inbox'),
        slotId,
        eventId: buddiesId('The event, for deduplication'),
        kind: z
          .string()
          .max(BUDDIES_LIMITS.kindChars)
          .regex(/^[a-z][a-z0-9.]*$/)
          .meta({
            description: `Event kind, e.g. \`plan.invite\` (\`^[a-z][a-z0-9.]*$\`, ≤ ${BUDDIES_LIMITS.kindChars} chars). Picks the push template.`,
          }),
        blob: sealed('The event', BUDDIES_LIMITS.eventBytes),
        push: z.boolean().meta({ description: 'Whether to alert.' }),
      }),
      'Writer-signed (op `event/put`).'
    ),
    responses: {
      200: jsonResponse('Stored (or already stored).', seqSchema),
      ...refusals(
        writerRefusals(
          `, the slot’s ${BUDDIES_LIMITS.writesPerSlot} writes this hour are spent, or a stored-event cap is full (\`Retry-After\` until the oldest write or event ages out)`
        )
      ),
    },
  }),

  'slot/leave': describeOp({
    summary: 'Leave a buddy’s inbox',
    description: paragraphs(
      'The writer removes its own slot (with its card and events) from the recipient’s inbox, when ending a connection. Idempotent: an unknown inbox or slot succeeds, since there is nothing left to leave. A sealed slot (`slot/seal`) keeps its events for the owner until they expire (its card goes), so leaving can’t delete a reconnect invite.',
      SIGNED_BY.writer,
      `${tierLine('write')} Works for a suspended account.`,
      KILL_SWITCH_EXEMPT
    ),
    requestBody: signedBody(
      signedPayload({
        inboxId: buddiesId('The recipient’s inbox'),
        slotId: buddiesId('Your slot in it'),
      }),
      'Writer-signed (op `slot/leave`).'
    ),
    responses: {
      200: jsonResponse('Left (or nothing to leave).', okSchema),
      ...refusals({
        bad_request: true,
        bad_signature:
          'Signature missing, malformed, or not by the slot’s writer key.',
        stale: true,
        ...AUTH_REFUSALS,
        replay: true,
        rate_limited: `${edgeLimited('write')}.`,
      }),
    },
  }),

  'slot/seal': describeOp({
    summary: 'Seal your slot in a buddy’s inbox',
    description: paragraphs(
      'After an account key change (witness-work ADR 0039 §5) the old account key’s holder holds the User’s writer keys too, since they derive from it. The User’s device seals each slot it writes from, before it leaves: from then on every writer op from the slot but `slot/leave` and `slot/seal` is 403 `sealed`, in either form, for good (nothing unseals a slot). A write racing the seal either lands before it or is refused. The slot’s card and events stay, and the owner sees `sealed: true` on it in `inbox/sync` and can still remove it. Idempotent. Stores nothing new: no account, only the flag on the slot.',
      SIGNED_BY.writer,
      `${tierLine('write')} Works for a suspended account.`,
      KILL_SWITCH_EXEMPT
    ),
    requestBody: signedBody(
      signedPayload({
        inboxId: buddiesId('The recipient’s inbox'),
        slotId: buddiesId('Your slot in it'),
      }),
      'Writer-signed (op `slot/seal`).'
    ),
    responses: {
      200: jsonResponse('Sealed (or already sealed).', okSchema),
      ...refusals({
        bad_request: true,
        bad_signature:
          'Signature missing, malformed, or not by the slot’s writer key.',
        stale: true,
        ...AUTH_REFUSALS,
        not_found: true,
        gone: 'The slot doesn’t exist: you left, or the inbox owner removed you. Nothing to seal.',
        replay: true,
        rate_limited: `${edgeLimited('write')}, or (sealing again) ${WRITER_BUDGET} are spent; the first seal of an open slot doesn’t count against them.`,
      }),
    },
  }),

  'invite/fetch': describeOp({
    summary: 'Fetch an invite',
    description: paragraphs(
      'Reads an invite’s sealed card and status. Expired, deleted, and burned invites are `not_found`.',
      SIGNED_BY.unsigned,
      tierLine('unsigned'),
      KILL_SWITCH_OFF
    ),
    requestBody: jsonBody(
      unsignedEnvelopeSchema,
      `Unsigned envelope.\n\n**Decoded \`payload\`:**\n\n${fieldTable(
        z.object({ inviteId: buddiesId('The invite, from the link secret') })
      )}`
    ),
    responses: {
      200: jsonResponse(
        'The invite.',
        z.object({
          ok: z.literal(true),
          blob: z.string().meta({ description: 'The sealed invite card.' }),
          expiresAt: z.number().int().meta({ description: 'Epoch ms.' }),
          status: z.enum(['open', 'claimed']),
        })
      ),
      ...refusals({
        bad_request: true,
        ...AUTH_REFUSALS,
        not_found: 'Unknown, expired, deleted, or burned invite.',
        rate_limited: `${edgeLimited('unsigned')}.`,
        disabled: true,
      }),
    },
  }),

  'invite/claim': describeOp({
    summary: 'Claim an invite',
    description: paragraphs(
      'Claims an invite with its secret and a sealed claim card. The relay compares `SHA-256(claimSecret)` to the stored verifier in constant time. The first valid claim wins; the winner’s exact retry (same secret, byte-identical `blob`) gets `{ ok }` again without a second event or push. On success the relay appends `{ slotId: "", kind: "invite.claimed", eventId: inviteId, blob }` to the creator’s inbox and pushes it.',
      `${BUDDIES_LIMITS.badClaims} wrong secrets burn the invite.`,
      SIGNED_BY.unsigned,
      tierLine('unsigned'),
      KILL_SWITCH_OFF,
      'Bearer requests come from an attested session; legacy requests aren’t attested.'
    ),
    requestBody: jsonBody(
      unsignedEnvelopeSchema,
      `Unsigned envelope.\n\n**Decoded \`payload\`:**\n\n${fieldTable(
        z.object({
          inviteId: buddiesId('The invite'),
          claimSecret: bytes32('The claim secret derived from the link'),
          blob: sealed('The claim card', BUDDIES_LIMITS.claimBytes),
        })
      )}`
    ),
    responses: {
      200: jsonResponse('Claimed.', okSchema),
      ...refusals({
        bad_request: true,
        bad_signature: `Wrong \`claimSecret\`. The ${BUDDIES_LIMITS.badClaims}th wrong one burns the invite.`,
        ...AUTH_REFUSALS,
        suspended: SENDER_SUSPENDED,
        not_found:
          'Unknown, expired, deleted, or burned invite, or the creator cancelled it while the claim was delivered.',
        conflict:
          'Already claimed (by someone else, with a different `blob`, or the first claim is still being delivered).',
        rate_limited: `${edgeLimited('unsigned')}.`,
        disabled: true,
      }),
    },
  }),
}

// --- Header-envelope routes -----------------------------------------------

/**
 * The request's fields in `x-buddies-payload`, and (legacy only) the owner's
 * signature over them in `x-buddies-signature`.
 */
const fieldHeaders = (op: string, fields: z.ZodRawShape) => [
  {
    name: 'x-buddies-payload',
    in: 'header' as const,
    required: true,
    schema: { type: 'string' as const },
    description: `The request’s fields as UTF-8 JSON, base64url without padding. A legacy request’s are its envelope \`payload\`, which adds \`ts\` and \`nonce\`.\n\n**Decoded:**\n\n${fieldTable(ownerFields(fields))}`,
  },
  {
    name: 'x-buddies-signature',
    in: 'header' as const,
    required: false,
    schema: { type: 'string' as const },
    description: `**Legacy only, and required there** (no \`Authorization\` header): the envelope’s \`signature\`, an Ed25519 signature by the owner key over \`ww-buddies/v1\\n${op}\\n\` followed by the decoded \`x-buddies-payload\` bytes (base64url, no padding). A bearer request sends none (\`bad_request\`).`,
  },
]

const { gone, replaced, suspended, expired } = BUDDIES_LIVE_CLOSE

export const buddiesLiveDocs = describeOp({
  summary: 'Live socket (WebSocket)',
  description: paragraphs(
    'Upgrades to a WebSocket that says *that* the owner’s inbox changed, so the app syncs within a second while in the foreground. It never carries content. The request rides in headers, since an upgrade has no body and ids never go in URLs. Opening a socket is not owner activity for the 180-day retention.',
    '**Bearer:** `Authorization: Bearer <access token>` and `x-buddies-payload` (no signature). Same account check as an owner op: `forbidden` for another account’s inbox, `not_linked` for one with no confirmed link.',
    '**Browsers** can’t set headers on a WebSocket, so they mint a `buddies` ticket for their inbox with `POST /accounts/v1/live/ticket` and offer `Sec-WebSocket-Protocol: ww.v1, ticket.<ticket>` instead (any order; no `Authorization` or `x-buddies-payload`; never the access token, which Cloudflare’s logs would record). It’s always a bearer upgrade, the ticket standing in for the token, checked like one. Checked in this order: the `Origin` must be one of the web app’s (`WEB_APP_ORIGINS`), else `forbidden`; an offer without `ww.v1`, with a repeated or unknown entry, or that isn’t a list of tokens is `bad_request`; then the kill switch (`disabled`); a missing, forged, expired (30 s), or Cloud Sync ticket is `unauthorized`; then the bearer checks (read tier, upgrade, the inbox’s ownership, `not_linked`, suspension); and while a socket opened with the same ticket is open, another is `conflict`. The 101 answers `Sec-WebSocket-Protocol: ww.v1`. Page script can’t see these statuses (a refused handshake is only a close), so mint a fresh ticket for every connect, never reuse one, and reconnect with backoff. No id goes in the URL, and the ticket names its ids sealed.',
    `**Legacy** (no \`Authorization\` header): the owner-signed envelope (op \`inbox/live\`) in \`x-buddies-payload\` and \`x-buddies-signature\`, with the same \`stale\` and \`replay\` checks as a POST owner op. ${LEGACY_SWITCH}`,
    '**Server → app messages:**\n\n- `{"type":"hello","seq":N}` right after the upgrade, `N` being the inbox head.\n- `{"type":"changed","seq":N}` after every committed write that changes what `inbox/sync` returns: new events, cards, the roster, a delivered claim, and slot changes. Slot changes don’t advance `seq`, so sync on every `changed`.',
    '**Keepalive:** send the text `ping` about every 25 s; the relay answers `pong` without waking the inbox. Anything else the app sends is ignored.',
    `**Close codes:** \`${gone.code} "${gone.reason}"\` the inbox was deleted or wiped (sync, which restores it); \`${replaced.code} "${replaced.reason}"\` an ${BUDDIES_LIMITS.liveSockets + 1}th socket opened and closed the oldest (at most ${BUDDIES_LIMITS.liveSockets} per inbox); \`${suspended.code} "${suspended.reason}"\` the inbox’s account was suspended; \`${expired.code} "${expired.reason}"\` (browser sockets only) the access token its ticket was minted with expired, so refresh, mint a ticket, and reconnect. Header sockets outlive their token, so a browser session’s (\`web\`) token is refused there with \`403 forbidden\`. Reconnect with backoff while in the foreground.`,
    `${tierLine('read')} The upgrade also counts toward ${OWNER_BUDGET}.`,
    `${KILL_SWITCH_OFF} Turning it off refuses new sockets but doesn’t close open ones.`
  ),
  parameters: [
    {
      name: 'Upgrade',
      in: 'header' as const,
      required: true,
      schema: { type: 'string' as const, enum: ['websocket'] },
      description: 'Must be `websocket`, else `426 upgrade_required`.',
    },
    ...fieldHeaders('inbox/live', { inboxId: buddiesId('Your inbox') }),
    {
      name: 'Sec-WebSocket-Protocol',
      in: 'header' as const,
      required: false,
      schema: { type: 'string' as const },
      description:
        'Browsers only: `ww.v1, ticket.<ticket>` (a `buddies` ticket from `POST /accounts/v1/live/ticket`), in place of `Authorization` and `x-buddies-payload`. Needs an allowed `Origin`.',
    },
  ],
  responses: {
    101: {
      description:
        'Switching protocols: the socket is open. A browser upgrade gets `Sec-WebSocket-Protocol: ww.v1`.',
    },
    ...refusals({
      ...ownerRefusals('read'),
      bad_request:
        'Missing or malformed `x-buddies-payload`, a bad payload, a bearer upgrade with `x-buddies-signature`, or a malformed `Sec-WebSocket-Protocol` offer.',
      conflict:
        'Browsers only: a socket opened with this ticket is still open. Mint another; a copied ticket never opens a second socket.',
      upgrade_required:
        'Not a WebSocket upgrade (`Upgrade: websocket`), or a legacy upgrade after the legacy switch (KV `auth:legacy`) was turned off. No `Retry-After`.',
    }),
  },
})

const binary = (description: string) => ({
  description,
  content: {
    'application/octet-stream': {
      schema: { type: 'string' as const, format: 'binary' },
    },
  },
})

export const buddiesBlobPutDocs = describeOp({
  summary: 'Upload a photo blob',
  description: paragraphs(
    `Stores one sealed photo in the sender’s own inbox for buddies to fetch with \`blob/get\`. The body is the raw sealed bytes (not base64), 1 to ${count(BUDDIES_LIMITS.blobBytes)}, so the request’s fields ride in headers. The relay recomputes \`blobId = b64u(SHA-256(body))\`, so the fields (and a legacy signature) cover the bytes too. Only an inbox with at least one buddy (slot) can store one.`,
    '**Bearer:** `Authorization: Bearer <access token>` and `x-buddies-payload` (no signature). Same account check as an owner op: `forbidden` for another account’s inbox, `not_linked` for one with no confirmed link.',
    `**Legacy** (no \`Authorization\` header): the owner-signed envelope (op \`blob/put\`) in \`x-buddies-payload\` and \`x-buddies-signature\`. ${LEGACY_SWITCH}`,
    'Idempotent per `blobId`: a repeat keeps the first `readTokenHash` (retries must reuse the token) and moves the expiry to the later of the two; one that doesn’t move it stores nothing and costs no upload.',
    `**Caps per inbox:** ${BUDDIES_ABUSE_LIMITS.inboxBlobs} live blobs and 150 MiB live; ${BUDDIES_ABUSE_LIMITS.blobUploads} uploads (object writes) per rolling 24 h. Blobs are deleted at \`expiresAt\`, by \`blob/delete\`, or with the inbox.`,
    'If storing the object fails the answer is a 500; a retry finishes the upload.',
    `${tierLine('blobPut')} The upload also counts toward ${OWNER_BUDGET}.`,
    KILL_SWITCH_OFF,
    PHOTOS_SWITCH
  ),
  parameters: fieldHeaders('blob/put', {
      inboxId: buddiesId('Your (the sender’s) inbox'),
      blobId: bytes32('`b64u(SHA-256(body))`'),
      bytes: z
        .number()
        .int()
        .min(1)
        .meta({
          description: `The body’s exact length, 1 to ${count(BUDDIES_LIMITS.blobBytes)}. \`Content-Length\`, when sent, must match.`,
        }),
      expiresAt: z.number().int().meta({
        description:
          'Epoch ms, after now and at most 90 days ahead of the relay clock.',
      }),
      readTokenHash: bytes32(
        '`b64u(SHA-256(readToken))`, the 32-byte read capability the app shares with recipients'
      ),
  }),
  requestBody: {
    required: true,
    ...binary(
      `The sealed photo bytes, \`0x01 ‖ nonce[12] ‖ ciphertext ‖ tag[16]\`, at most ${kib(BUDDIES_LIMITS.blobBytes)}.`
    ),
  },
  responses: {
    200: jsonResponse(
      'Stored (or already stored).',
      z.object({
        ok: z.literal(true),
        expiresAt: z.number().int().meta({
          description: 'The stored expiry, epoch ms (the later of any puts).',
        }),
      })
    ),
    ...refusals({
      ...ownerRefusals('blobPut'),
      bad_request:
        'Missing or malformed headers or payload, an `expiresAt` out of range, a body whose length isn’t `bytes`, or whose SHA-256 isn’t `blobId`. Also a bearer upload with `x-buddies-signature`.',
      not_found: `${DEFAULT_REASONS.not_found} Also when the blob or inbox was deleted while it uploaded.`,
      no_buddies: 'The inbox has no slots, so nobody could read the photo.',
      too_large: `\`bytes\`, \`Content-Length\`, or the streamed body is over ${kib(BUDDIES_LIMITS.blobBytes)}.`,
      rate_limited: `${edgeLimited('blobPut')}, ${OWNER_BUDGET} are spent, or a per-inbox cap is hit (\`Retry-After\` until the soonest live blob expires or the oldest upload leaves the day).`,
      photos_disabled: true,
    }),
  },
})

export const buddiesSuccessorDocs = describeRoute({
  tags: TAGS,
  security: [{ bearerAuth: [] }],
  summary: 'Read an inbox’s successor',
  description: paragraphs(
    'The inbox that replaced `inboxId` after its account’s key changed (witness-work ADR 0039 §5), as `inbox/delete` with `successor` recorded it, or `null`. A buddy accepts a `pair.reconnect` from the old inbox only when this names the offered inbox. Checked at every read: `null` unless the recorded successor is still linked to the same account at the account’s current key epoch and the account isn’t suspended (so one recorded before a key change, by anyone holding the old key, is never vouched for after it), and for an inbox nobody replaced or one recorded over 90 days ago. Anyone with a token who knows the old `inboxId` learns that it was replaced, and by which inbox.',
    '**Bearer only:** `Authorization: Bearer <access token>` of any account, and `{ "inboxId" }` as plain JSON (an envelope is `bad_request`). No legacy form: without the header it’s `unauthorized`.',
    tierLine('read'),
    KILL_SWITCH_OFF
  ),
  requestBody: jsonBody(
    z.object({ inboxId: buddiesId('The replaced (old) inbox') }),
    'Plain JSON.'
  ),
  responses: {
    200: jsonResponse(
      'The successor, or `null`.',
      z.object({
        ok: z.literal(true),
        successor: buddiesId('The inbox that replaced it')
          .nullable()
          .meta({ description: 'The inbox that replaced it, or `null`.' }),
      })
    ),
    ...refusals({
      bad_request: true,
      unauthorized: `${DEFAULT_REASONS.unauthorized} Also a request without one.`,
      rate_limited: `${edgeLimited('read')}.`,
      disabled: `${DEFAULT_REASONS.disabled} Also a worker without the accounts database.`,
    }),
  },
})

export const buddiesBlobGetDocs = describeOp({
  summary: 'Download a photo blob',
  description: paragraphs(
    'Returns the exact sealed bytes put, for a recipient holding the reference from a share event. Changes nothing and isn’t owner activity.',
    `${SIGNED_BY.unsigned} The read token is the capability; the relay stores only its hash and compares in constant time.`,
    'Unknown inboxes and blobs, deleted, expired, or unfinished blobs, and wrong tokens all get the same `404 not_found`.',
    tierLine('blobGet'),
    KILL_SWITCH_OFF,
    PHOTOS_SWITCH
  ),
  requestBody: jsonBody(
    unsignedEnvelopeSchema,
    `Unsigned envelope.\n\n**Decoded \`payload\`:**\n\n${fieldTable(
      z.object({
        inboxId: buddiesId('The sender’s inbox'),
        blobId: bytes32('The blob'),
        token: bytes32('The read token from the reference'),
      })
    )}`
  ),
  responses: {
    200: {
      ...binary(
        'The sealed bytes. The app may check `b64u(SHA-256(body)) = blobId`; the AEAD tag catches tampering either way.'
      ),
      headers: {
        'Cache-Control': {
          description: '`no-store`.',
          schema: { type: 'string' as const },
        },
        'Content-Length': { schema: { type: 'integer' as const } },
        'X-Content-Type-Options': {
          description: '`nosniff`.',
          schema: { type: 'string' as const },
        },
      },
    },
    ...refusals({
      bad_request: true,
      ...AUTH_REFUSALS,
      not_found:
        'Unknown inbox or blob, a deleted, expired, or unfinished blob, or a wrong token.',
      rate_limited: `${edgeLimited('blobGet')}.`,
      disabled: true,
      photos_disabled: true,
    }),
  },
})
