import { base64ToBytes, bytesToBase64Url } from '../crypto'
import { APNS_DEVICE_TOKEN_PATTERN, type ApnsEnvironment } from '../apns'
import { FCM_TOKEN_PATTERN } from '../fcm'
import { LIVE_EXPIRED_CLOSE } from '../liveSubprotocol'

/**
 * Buddies relay wire contract (protocol v1). The source of truth is
 * `docs/buddies-protocol.md`; this module holds the constants, error codes, and
 * payload validation that the route and both Durable Objects share.
 *
 * Everything here treats blobs as opaque ciphertext. Nothing in this module
 * logs, and callers must never log payload values: ids, keys, tokens, and blobs
 * are all user-linked.
 */

export const BUDDIES_OWNER_OPS = [
  'inbox/sync',
  'inbox/delete',
  'device/register',
  'device/unregister',
  'slot/add',
  'slot/remove',
  'roster/put',
  'invite/create',
  'invite/delete',
  'blob/delete',
] as const

export const BUDDIES_WRITER_OPS = [
  'card/put',
  'event/put',
  'slot/leave',
  'slot/seal',
] as const

export const BUDDIES_UNSIGNED_OPS = ['invite/fetch', 'invite/claim'] as const

/**
 * The owner's live socket, `GET /buddies/v1/inbox/live`. Signed and verified
 * like an owner op, but carried in request headers on a WebSocket upgrade, so
 * it is not in `BUDDIES_OPS` and has no POST route.
 */
export const BUDDIES_LIVE_OP = 'inbox/live'
/**
 * Request headers that carry a signed envelope's `payload` and `signature`
 * when the body can't: the live upgrade (no body) and `blob/put` (raw bytes).
 */
export const BUDDIES_ENVELOPE_HEADERS = {
  payload: 'x-buddies-payload',
  signature: 'x-buddies-signature',
} as const
/** The short header names older app builds send; still accepted. */
export const LEGACY_BUDDIES_ENVELOPE_HEADERS = {
  payload: 'x-buddies-p',
  signature: 'x-buddies-s',
} as const
/** Request headers that carry the live upgrade's `payload` and `signature`. */
export const BUDDIES_LIVE_HEADERS = BUDDIES_ENVELOPE_HEADERS
/**
 * The account a bearer `inbox/live` upgrade's token named, set by the Worker
 * on the request it hands the inbox DO. Never read from a client: the Worker
 * deletes any copy a client sends before forwarding.
 */
export const BUDDIES_LIVE_ACCOUNT_HEADER = 'x-buddies-session-account'
/**
 * A browser `inbox/live` socket's token expiry (epoch ms), set by the Worker
 * on the request it hands the inbox DO, which closes the socket then. Never
 * read from a client: the Worker deletes any copy before forwarding, so a
 * native socket never has one.
 */
export const BUDDIES_LIVE_EXPIRES_HEADER = 'x-buddies-session-expires-at'

/**
 * Names the part of the app that sent a request. The iOS Notification
 * Service Extension sends `BUDDIES_NOTIFICATION_SERVICE_CLIENT` on its
 * owner-signed `inbox/sync`: it can't hold the session's rotating refresh
 * token, so it signs with the owner key even after the legacy switch is off,
 * and that one legacy request stays served for an inbox with a confirmed
 * account link. Ignored on every other request.
 */
export const BUDDIES_CLIENT_HEADER = 'x-buddies-client'
export const BUDDIES_NOTIFICATION_SERVICE_CLIENT = 'notification-service'

/**
 * Photo blobs (encrypted note photos, too big for an event). `blob/put` is
 * owner-signed like an owner op, but its body is the raw sealed bytes, so the
 * envelope rides in `BUDDIES_ENVELOPE_HEADERS`. `blob/get` is unsigned (the
 * read token is the capability) and answers with raw bytes. Neither is in
 * `BUDDIES_OPS`: both have their own routes. `blob/delete` is an ordinary
 * owner op.
 */
export const BUDDIES_BLOB_PUT_OP = 'blob/put'
export const BUDDIES_BLOB_GET_OP = 'blob/get'
/**
 * `POST inbox/successor`: which inbox replaced another after its account's
 * key changed (witness-work ADR 0039 §5). A bearer read by any account, with
 * its own route: it is neither signed nor an owner op, so not in
 * `BUDDIES_OPS`.
 */
export const BUDDIES_SUCCESSOR_OP = 'inbox/successor'
/** Ops that also need the photos switch (`buddies:photos`) on. */
export const BUDDIES_PHOTO_OPS: ReadonlySet<string> = new Set([
  BUDDIES_BLOB_PUT_OP,
  BUDDIES_BLOB_GET_OP,
  'blob/delete',
])
/** Close codes the relay sends on live sockets. */
export const BUDDIES_LIVE_CLOSE = {
  /** The inbox was deleted or wiped for inactivity. */
  gone: { code: 4001, reason: 'gone' },
  /** A newer socket for the inbox pushed this one past the cap. */
  replaced: { code: 4002, reason: 'replaced' },
  /** The inbox's account was suspended. */
  suspended: { code: 4003, reason: 'suspended' },
  /** A browser socket's token expired (`LIVE_EXPIRED_CLOSE`). */
  expired: LIVE_EXPIRED_CLOSE,
} as const

export type BuddiesOwnerOp = (typeof BUDDIES_OWNER_OPS)[number]
export type BuddiesWriterOp = (typeof BUDDIES_WRITER_OPS)[number]
export type BuddiesUnsignedOp = (typeof BUDDIES_UNSIGNED_OPS)[number]
export type BuddiesSignedOp =
  | 'inbox/register'
  | BuddiesOwnerOp
  | BuddiesWriterOp
export type BuddiesOp = BuddiesSignedOp | BuddiesUnsignedOp
export type BuddiesLiveOp = typeof BUDDIES_LIVE_OP
export type BuddiesBlobPutOp = typeof BUDDIES_BLOB_PUT_OP
export type BuddiesBlobGetOp = typeof BUDDIES_BLOB_GET_OP
export type BuddiesSuccessorOp = typeof BUDDIES_SUCCESSOR_OP
/**
 * Every op a signature can name: the signed POST ops, the live socket, and
 * `blob/put`.
 */
export type BuddiesSigningOp =
  | BuddiesSignedOp
  | BuddiesLiveOp
  | BuddiesBlobPutOp
/**
 * Every op with a route, each counted against a per-caller edge tier. Most
 * are signed (owner, writer, self-signed); `invite/fetch`, `invite/claim`,
 * `blob/get`, and `inbox/successor` aren't, so their payloads have no `ts` or
 * `nonce` (`UNSIGNED_PAYLOAD_OPS`).
 */
export type BuddiesRouteOp =
  | BuddiesOp
  | BuddiesLiveOp
  | BuddiesBlobPutOp
  | BuddiesBlobGetOp
  | BuddiesSuccessorOp

export const BUDDIES_OPS: readonly BuddiesOp[] = [
  'inbox/register',
  ...BUDDIES_OWNER_OPS,
  ...BUDDIES_WRITER_OPS,
  ...BUDDIES_UNSIGNED_OPS,
]

/**
 * Ops that keep working with the kill switch off, so people can always leave,
 * and a writer can always seal its slot after a key change.
 */
export const BUDDIES_ALWAYS_ALLOWED_OPS: ReadonlySet<BuddiesOp> = new Set([
  'inbox/delete',
  'slot/remove',
  'slot/leave',
  'slot/seal',
])

/**
 * Ops that reach someone else's inbox, refused with 403 `suspended` on a
 * bearer request from a suspended account: the Worker checks the token's
 * account status (cached 30 seconds per isolate), so no inbox learns which
 * account holds which slot. Leaving (`slot/leave`) and reads stay open. The
 * account's own inbox refuses its owner ops by its copy of the status, and
 * `inbox/register` checks the database. A legacy request carries no account,
 * so its writer ops can't be refused.
 */
export const BUDDIES_SUSPENDED_REFUSED_OPS: ReadonlySet<BuddiesRouteOp> =
  new Set(['card/put', 'event/put', 'invite/claim'])

export const BUDDIES_ERROR_STATUS = {
  bad_request: 400,
  bad_signature: 401,
  stale: 401,
  replay: 409,
  not_found: 404,
  conflict: 409,
  gone: 410,
  limit: 429,
  rate_limited: 429,
  disabled: 503,
  /**
   * `inbox/live` without a WebSocket upgrade, and any request authenticated
   * the way it was before sessions (no `Authorization` header) once the
   * legacy switch (`auth:legacy`) is off, but the Notification Service
   * Extension's `inbox/sync` for an inbox with a confirmed account link
   * (`BUDDIES_CLIENT_HEADER`). Never carries `Retry-After`: updating the app
   * is the fix.
   */
  upgrade_required: 426,
  /** A `blob/put` body (declared or streamed) over `blobBytes`. */
  too_large: 413,
  /** The photos switch is off (or this worker has no blob bucket). */
  photos_disabled: 503,
  /** `blob/put` from an inbox with no buddies: nobody could read the photo. */
  no_buddies: 403,
  /**
   * The inbox's account is suspended (every owner op but leaving is refused),
   * or a bearer request's own account is (`BUDDIES_SUSPENDED_REFUSED_OPS`).
   */
  suspended: 403,
  /**
   * A writer op from a slot its writer sealed (`slot/seal`), but leaving or
   * sealing again. Final: nothing unseals a slot.
   */
  sealed: 403,
  /** `inbox/register` named an account the accounts database doesn't have. */
  unknown_account: 404,
  /**
   * A handoff channel another account opened, a `backup/delete` signed by
   * another account than the bearer token's, a bearer Buddies owner request
   * for an inbox linked to another account, a bearer `inbox/register`
   * whose `account` proof names another account than the token's, or an
   * `inbox/delete` naming a `successor` without a bearer token of the
   * account the inbox is linked to.
   */
  forbidden: 403,
  /**
   * A bearer Buddies owner request for an inbox with no confirmed account
   * link: registered before accounts, or its linking registration failed
   * part-way. The app links it with `inbox/register` and retries.
   */
  not_linked: 409,
  /**
   * A missing, expired, or invalid access token, or an ended session's
   * refresh token. Sent with `WWW-Authenticate: Bearer error="invalid_token"`.
   */
  unauthorized: 401,
  /** Opening a session refused the attestation (`reason` says why). */
  attestation_failed: 403,
  /**
   * An outside service the request needs couldn't be reached (RevenueCat,
   * for Supporter status). Always with `Retry-After`.
   */
  unavailable: 503,
  /**
   * `sync/put` with an `If-Match` the slot no longer matches (another put
   * replaced it, or `*` and there's no slot yet).
   */
  precondition_failed: 412,
  /**
   * Cloud Sync for an account that isn't entitled: `sync:entitlement` is
   * `supporter` and the account isn't a Supporter (witness-work ADR 0030).
   */
  supporter_required: 403,
  /**
   * A Cloud Sync `photos/put` past the account's photo storage limit. No
   * `Retry-After`: only the User freeing space fixes it.
   */
  storage_full: 429,
  /**
   * A Cloud Sync `photos/put` on an account with no slot, or a
   * `sync/changes/put` for a slot with no base (the device puts its base
   * first).
   */
  no_slot: 409,
  /**
   * The record changes switch is off (`sync:changes`, witness-work ADR
   * 0060): the device publishes whole snapshots.
   */
  changes_disabled: 503,
  /**
   * A `sync/changes/put` for a slot whose tail is full: the device writes
   * its base (`sync/put` with `x-ww-covers-sequence`), then sends again.
   */
  tail_full: 409,
  /**
   * A passkey ceremony didn't verify (witness-work
   * `docs/passkeys-protocol.md`); `reason` says which check failed.
   */
  passkey_failed: 403,
  /** A web session's ticket that's malformed, expired, used, or for another account. */
  ticket_invalid: 403,
  /** Turnstile's Siteverify refused the token; `reason` is its first error code. */
  turnstile_failed: 403,
  /** A web session hasn't passed a step-up in the last 5 minutes. */
  step_up_required: 403,
  /**
   * A session open, `account/register`, or web sign-up with an account key a
   * key change retired (ADR 0039); `changedAt` says when.
   */
  key_retired: 403,
  /** A web session less than 24 hours old asked to change the account key. */
  session_too_new: 403,
} as const

export type BuddiesErrorCode = keyof typeof BUDDIES_ERROR_STATUS

/** A refusal; time-bound limits say how long to wait (`Retry-After`). */
export type BuddiesFailure = {
  ok: false
  error: BuddiesErrorCode
  retryAfterSeconds?: number
}

/** Result shape shared by every Durable Object method (RPC-serializable). */
export type BuddiesResult<T> = { ok: true; value: T } | BuddiesFailure

export const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value })

export const fail = (
  error: BuddiesErrorCode,
  retryAfterSeconds?: number
): BuddiesFailure =>
  retryAfterSeconds == null
    ? { ok: false, error }
    : { ok: false, error, retryAfterSeconds }

const SECOND_MS = 1_000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const KIB = 1_024

/** Caps, windows, and retention from the contract's "Limits and retention". */
export const BUDDIES_LIMITS = {
  /** `slot/add` and `invite/create` fail with `limit` at this many slots + open invites. */
  slotsPlusOpenInvites: 50,
  /**
   * As many as the spots: after an account key change the app invites every
   * buddy back to its new inbox at once (witness-work ADR 0039 §5). The app
   * holds the invites a User makes by hand to 5 itself.
   */
  openInvites: 50,
  /** Twice the spots, so a key change's reconnect invites fit in one day. */
  inviteCreations: 100,
  inviteCreationWindowMs: DAY_MS,
  writesPerSlot: 60,
  writeWindowMs: HOUR_MS,
  pushesPerSlot: 10,
  pushWindowMs: DAY_MS,
  /** Immediate kinds skip it; `pushesPerSlot` still applies to them. */
  pushSpacingMs: MINUTE_MS,
  devices: 10,
  /** Open `inbox/live` sockets per inbox; past it the oldest is replaced. */
  liveSockets: 10,
  badClaims: 5,
  eventRetentionMs: 30 * DAY_MS,
  /** Invites are deleted at `expiresAt` plus this grace. */
  inviteGraceMs: 10 * MINUTE_MS,
  inboxInactivityMs: 180 * DAY_MS,
  maxInviteLifetimeMs: 7 * DAY_MS + 5 * MINUTE_MS,
  timestampSkewMs: 5 * MINUTE_MS,
  nonceRetentionMs: 10 * MINUTE_MS,
  /** About 73 KiB for 50 buddies at their longest names and nicknames. */
  rosterBytes: 128 * KIB,
  cardBytes: 16 * KIB,
  eventBytes: 8 * KIB,
  inviteBytes: 4 * KIB,
  claimBytes: 4 * KIB,
  templateChars: 200,
  /**
   * Not in the contract: bounds per-device template storage. The app
   * registers 14 fixed kinds plus one `join.request.<tag>` per buddy (50).
   */
  templates: 96,
  kindChars: 40,
  /** Not in the contract: a whole-envelope ceiling checked before parsing. */
  requestBytes: 256 * KIB,
  /**
   * Not in the contract: `inbox/sync` stops adding events once their blobs pass
   * this many characters and returns `seq` as the cursor it reached, so the next
   * sync continues from there. Real inboxes never get close.
   */
  syncEventChars: 4 * 1_024 * KIB,
  /** A photo blob's sealed bytes (`blob/put` body). */
  blobBytes: 1_024 * KIB,
  /**
   * `blob/put` `expiresAt ≤ now + this`. A Plan 8 weeks out keeps its photo
   * until a month after it ends; the app uploads photos for later Plans again
   * as their date nears. The R2 lifecycle rule deletes objects a day past
   * this (`scripts/r2-lifecycle.mjs`).
   */
  maxBlobLifetimeMs: 90 * DAY_MS,
  /** Blob ids per `blob/delete`. */
  blobDeleteIds: 50,
} as const

/**
 * Kinds that invite someone or answer them (confirm a pairing, reply to a
 * share, invite to a Plan, a Follow-up, or a shared car, ask to join) alert
 * right away instead of waiting out the 60 s push spacing, but still count
 * toward the daily cap. Updates and cancellations keep the spacing, and so
 * does `car.reply` (the shared-cars protocol makes only `car.invite`
 * immediate) and `territory.reply`. `invite.claimed` is a relay event outside the slot budget
 * altogether.
 */
export const BUDDIES_IMMEDIATE_PUSH_KINDS: ReadonlySet<string> = new Set([
  'pair.confirmed',
  'share.reply',
  'plan.invite',
  'followup.invite',
  'car.invite',
  // Territories (witness-work `docs/territories-protocol.md`): an invitation
  // to a territory, and a street handed to someone already on it.
  'territory.invite',
  'territory.handoff',
])
/** `join.request.<tag>`: the tag is per buddy, so it matches by prefix. */
export const BUDDIES_IMMEDIATE_PUSH_PREFIX = 'join.request.'

export const isImmediatePushKind = (kind: string): boolean =>
  BUDDIES_IMMEDIATE_PUSH_KINDS.has(kind) ||
  kind.startsWith(BUDDIES_IMMEDIATE_PUSH_PREFIX)

/**
 * Buddies' social news (a new badge, a reaction to one of the User's) is
 * quiet: delivered without sound or lighting the screen. Budget and spacing
 * are as for any other kind.
 */
export const BUDDIES_PASSIVE_PUSH_KINDS: ReadonlySet<string> = new Set([
  'badge.new',
  'badge.reaction',
])

export const BUDDIES_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/
/** `blobId`, `readTokenHash`, and `token`: 32 bytes, so 43 b64u characters. */
const BYTES32_PATTERN = /^[A-Za-z0-9_-]{43}$/
/** Unpadded base64url's alphabet (Shared Spaces parses with it too). */
export const B64U_PATTERN = /^[A-Za-z0-9_-]*$/
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{86}$/
const KIND_PATTERN = /^[a-z][a-z0-9.]*$/
export interface PushTemplate {
  title: string
  body: string
}

/** How a device gets pushes: APNs (iOS, the default) or FCM (Android). */
export type PushService = 'apns' | 'fcm'

/** A device's push address. `apnsTopic` null means the worker's `IOS_BUNDLE_ID`. */
export type PushAddress =
  | {
      service: 'apns'
      token: string
      apnsEnvironment: ApnsEnvironment
      apnsTopic: string | null
    }
  | {
      service: 'fcm'
      token: string
      /**
       * The app posts the alert itself (named alerts): the relay sends the
       * template as fallback text that expo-notifications doesn't show.
       */
      appAlerts: boolean
    }

export type PushTarget = PushAddress & {
  deviceId: string
  title: string
  body: string
}

/** What a Durable Object asks the Worker to push. Never logged. */
export interface PushJob {
  inboxId: string
  kind: string
  /** The inbox `seq` of the event the alert is about. */
  seq: number
  /**
   * The event itself, still sealed: the app opens it to name the sender. Goes
   * in the push only when it fits.
   */
  event: { eventId: string; blob: string }
  targets: PushTarget[]
}

/** Decodes unpadded base64url; null when the alphabet or length is invalid. */
export const decodeB64u = (value: string): Uint8Array | null => {
  if (!B64U_PATTERN.test(value) || value.length % 4 === 1) return null
  try {
    return base64ToBytes(value)
  } catch {
    return null
  }
}

/** Decoded size of a valid unpadded base64url string. */
export const decodedLength = (value: string): number =>
  Math.floor((value.length * 3) / 4)

/** A non-empty, valid unpadded base64url string; its decoded size is the caller's to check. */
export const isB64u = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  B64U_PATTERN.test(value) &&
  value.length % 4 !== 1

export const decodeSignature = (value: unknown): Uint8Array | null => {
  if (typeof value !== 'string' || !SIGNATURE_PATTERN.test(value)) return null
  const bytes = decodeB64u(value)
  return bytes && bytes.length === 64 ? bytes : null
}

export const isPlainObject = (
  value: unknown
): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/** A 22-character id: 16 random bytes as b64u (Buddies' and Shared Spaces'). */
export const isId = (value: unknown): value is string =>
  typeof value === 'string' && BUDDIES_ID_PATTERN.test(value)

export const isSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value)

export const isEventKind = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= BUDDIES_LIMITS.kindChars &&
  KIND_PATTERN.test(value)

/** Canonical base64url of a value that must decode to exactly `size` bytes. */
const fixedBytes = (value: unknown, size: number): string | null => {
  if (typeof value !== 'string') return null
  const bytes = decodeB64u(value)
  return bytes && bytes.length === size ? bytesToBase64Url(bytes) : null
}

/** A canonical b64u encoding of exactly 32 bytes (hashes, ids, tokens). */
const bytes32 = (value: unknown): value is string =>
  typeof value === 'string' &&
  BYTES32_PATTERN.test(value) &&
  fixedBytes(value, 32) === value

/** An opaque sealed blob: valid base64url, 1..maxBytes once decoded. */
const blob = (value: unknown, maxBytes: number): string | null =>
  isB64u(value) && decodedLength(value) <= maxBytes ? value : null

const codePoints = (value: string): number => {
  let count = 0
  for (const _ of value) count++
  return count
}

const templateText = (value: unknown): value is string =>
  typeof value === 'string' && codePoints(value) <= BUDDIES_LIMITS.templateChars

const templates = (value: unknown): Record<string, PushTemplate> | null => {
  if (!isPlainObject(value)) return null
  const entries = Object.entries(value)
  if (entries.length > BUDDIES_LIMITS.templates) return null
  const out: Record<string, PushTemplate> = {}
  for (const [kind, template] of entries) {
    if (!isEventKind(kind) || !isPlainObject(template)) return null
    const { title, body } = template
    if (!templateText(title) || !templateText(body)) return null
    out[kind] = { title, body }
  }
  return out
}

// --- Payloads -------------------------------------------------------------

export interface SignedFields {
  ts: number
  nonce: string
}

/** A payload without its signed `ts` and `nonce`: a bearer request's fields. */
export type Unsigned<T> = Omit<T, keyof SignedFields>

export interface InboxFields extends SignedFields {
  inboxId: string
}

/**
 * The account that owns an inbox (witness-work ADR 0024): its id, and the
 * account signing key's signature over `inboxLinkMessage(accountId, inboxId,
 * ownerPub)` (src/accounts/contracts.ts).
 */
export interface InboxAccountProof {
  accountId: string
  signature: Uint8Array
}

export interface RegisterPayload extends InboxFields {
  ownerPub: string
  /** Absent from builds before accounts, and when the app has none yet. */
  account?: InboxAccountProof
}

export interface SyncPayload extends InboxFields {
  since: number
}

export interface DeviceRegisterPayload extends InboxFields {
  deviceId: string
  push: PushAddress
  templates: Record<string, PushTemplate>
}

export interface DeviceUnregisterPayload extends InboxFields {
  deviceId: string
}

export interface SlotPayload extends InboxFields {
  slotId: string
}

export interface SlotAddPayload extends SlotPayload {
  writerPub: string
}

export interface RosterPutPayload extends InboxFields {
  blob: string
}

export interface InviteCreatePayload extends InboxFields {
  inviteId: string
  claimVerifier: string
  blob: string
  expiresAt: number
}

export interface InviteDeletePayload extends InboxFields {
  inviteId: string
}

export interface CardPutPayload extends SlotPayload {
  blob: string
}

export interface EventPutPayload extends SlotPayload {
  eventId: string
  kind: string
  blob: string
  push: boolean
}

export interface InboxDeletePayload extends InboxFields {
  /**
   * The inbox that replaces this one after a key change: bearer requests
   * only (ADR 0039 §5).
   */
  successor?: string
}

export interface InboxSuccessorPayload {
  inboxId: string
}

export interface InviteFetchPayload {
  inviteId: string
}

export interface BlobPutPayload extends InboxFields {
  /** `b64u(SHA-256(body))`; the Worker recomputes it from the bytes it read. */
  blobId: string
  /** The body's exact length, 1..`blobBytes` (checked before reading it). */
  bytes: number
  expiresAt: number
  /** `b64u(SHA-256(token))` of the 32-byte read token the app shares. */
  readTokenHash: string
}

export interface BlobGetPayload {
  inboxId: string
  blobId: string
  token: Uint8Array
}

export interface BlobDeletePayload extends InboxFields {
  blobIds: string[]
}

export interface InviteClaimPayload {
  inviteId: string
  claimSecret: Uint8Array
  blob: string
}

export interface BuddiesPayloads {
  'inbox/register': RegisterPayload
  'inbox/sync': SyncPayload
  'inbox/delete': InboxDeletePayload
  'device/register': DeviceRegisterPayload
  'device/unregister': DeviceUnregisterPayload
  'slot/add': SlotAddPayload
  'slot/remove': SlotPayload
  'roster/put': RosterPutPayload
  'invite/create': InviteCreatePayload
  'invite/delete': InviteDeletePayload
  'card/put': CardPutPayload
  'event/put': EventPutPayload
  'slot/leave': SlotPayload
  'slot/seal': SlotPayload
  'invite/fetch': InviteFetchPayload
  'invite/claim': InviteClaimPayload
  'inbox/live': InboxFields
  'blob/put': BlobPutPayload
  'blob/get': BlobGetPayload
  'blob/delete': BlobDeletePayload
  'inbox/successor': InboxSuccessorPayload
}

type Fields = Record<string, unknown>

/** A bundle id as Apple allows them; the inbox checks it's one this worker serves. */
const BUNDLE_ID_PATTERN = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/
const MAX_BUNDLE_ID_CHARS = 155

/**
 * `pushService` picks the fields: APNs (also when absent, as builds before
 * Android sent it) takes `apnsToken`, `apnsEnvironment`, and `apnsTopic?`;
 * FCM takes `fcmToken` and `appAlerts?`. The other service's fields are
 * ignored.
 */
const pushAddress = (p: Fields): PushAddress | null => {
  const service = p.pushService === undefined ? 'apns' : p.pushService
  if (service === 'fcm') {
    if (p.appAlerts !== undefined && typeof p.appAlerts !== 'boolean')
      return null
    return typeof p.fcmToken === 'string' && FCM_TOKEN_PATTERN.test(p.fcmToken)
      ? { service, token: p.fcmToken, appAlerts: p.appAlerts === true }
      : null
  }
  if (service !== 'apns') return null
  if (
    typeof p.apnsToken !== 'string' ||
    !APNS_DEVICE_TOKEN_PATTERN.test(p.apnsToken)
  ) {
    return null
  }
  if (p.apnsEnvironment !== 'sandbox' && p.apnsEnvironment !== 'production') {
    return null
  }
  let apnsTopic: string | null = null
  if (p.apnsTopic !== undefined) {
    if (
      typeof p.apnsTopic !== 'string' ||
      p.apnsTopic.length > MAX_BUNDLE_ID_CHARS ||
      !BUNDLE_ID_PATTERN.test(p.apnsTopic)
    ) {
      return null
    }
    apnsTopic = p.apnsTopic
  }
  return {
    service,
    token: p.apnsToken.toLowerCase(),
    apnsEnvironment: p.apnsEnvironment,
    apnsTopic,
  }
}

/**
 * `ts` in whole ms. App builds that stamp it from a calibrated clock send a
 * fraction (the signature covers it as sent), so it's floored, not refused.
 */
const timestamp = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const ms = Math.floor(value)
  return isSafeInteger(ms) ? ms : null
}

const inboxFields = (p: Fields): Unsigned<InboxFields> | null =>
  isId(p.inboxId) ? { inboxId: p.inboxId } : null

const slotFields = (p: Fields): Unsigned<SlotPayload> | null => {
  const base = inboxFields(p)
  return base && isId(p.slotId) ? { ...base, slotId: p.slotId } : null
}

const withBlob = <T extends object>(
  base: T | null,
  value: unknown,
  maxBytes: number
): (T & { blob: string }) | null => {
  const b = blob(value, maxBytes)
  return base && b ? { ...base, blob: b } : null
}

/** An op's fields without `ts` and `nonce` (unsigned ops have none anyway). */
export type BuddiesFields<K extends BuddiesRouteOp> = Unsigned<BuddiesPayloads[K]>

type FieldParsers = {
  [K in BuddiesRouteOp]: (payload: Fields, now: number) => BuddiesFields<K> | null
}

type PayloadParsers = {
  [K in BuddiesRouteOp]: (
    payload: Fields,
    now: number
  ) => BuddiesPayloads[K] | null
}

/**
 * Validates an op's fields and returns only the contract's (unknown fields,
 * including the reserved `attest`, `ts`, and `nonce`, are dropped). Keys and
 * the claim verifier come back canonically encoded. Null means
 * `bad_request`. A bearer request's plain JSON body (or `x-buddies-payload`)
 * goes through these alone; a signed payload through
 * `BUDDIES_PAYLOAD_PARSERS`, which also takes its `ts` and `nonce`.
 */
export const BUDDIES_FIELD_PARSERS: FieldParsers = {
  'inbox/register': (p) => {
    const base = inboxFields(p)
    const ownerPub = fixedBytes(p.ownerPub, 32)
    if (!base || !ownerPub) return null
    if (p.account === undefined) return { ...base, ownerPub }
    if (!isPlainObject(p.account) || !isId(p.account.accountId)) return null
    const signature = decodeSignature(p.account.signature)
    return signature
      ? {
          ...base,
          ownerPub,
          account: { accountId: p.account.accountId, signature },
        }
      : null
  },
  'inbox/sync': (p) => {
    const base = inboxFields(p)
    return base && isSafeInteger(p.since) && p.since >= 0
      ? { ...base, since: p.since }
      : null
  },
  'inbox/delete': (p) => {
    const base = inboxFields(p)
    if (!base) return null
    if (p.successor === undefined) return base
    return isId(p.successor) ? { ...base, successor: p.successor } : null
  },
  'device/register': (p) => {
    const base = inboxFields(p)
    const parsedTemplates = templates(p.templates)
    const push = pushAddress(p)
    if (!base || !isId(p.deviceId) || !parsedTemplates || !push) return null
    return {
      ...base,
      deviceId: p.deviceId,
      push,
      templates: parsedTemplates,
    }
  },
  'device/unregister': (p) => {
    const base = inboxFields(p)
    return base && isId(p.deviceId) ? { ...base, deviceId: p.deviceId } : null
  },
  'slot/add': (p) => {
    const base = slotFields(p)
    const writerPub = fixedBytes(p.writerPub, 32)
    return base && writerPub ? { ...base, writerPub } : null
  },
  'slot/remove': slotFields,
  'roster/put': (p) =>
    withBlob(inboxFields(p), p.blob, BUDDIES_LIMITS.rosterBytes),
  'invite/create': (p, now) => {
    const base = withBlob(inboxFields(p), p.blob, BUDDIES_LIMITS.inviteBytes)
    const claimVerifier = fixedBytes(p.claimVerifier, 32)
    if (!base || !claimVerifier || !isId(p.inviteId)) return null
    const { expiresAt } = p
    if (!isSafeInteger(expiresAt) || expiresAt <= now) return null
    if (expiresAt > now + BUDDIES_LIMITS.maxInviteLifetimeMs) return null
    return { ...base, inviteId: p.inviteId, claimVerifier, expiresAt }
  },
  'invite/delete': (p) => {
    const base = inboxFields(p)
    return base && isId(p.inviteId) ? { ...base, inviteId: p.inviteId } : null
  },
  'card/put': (p) => withBlob(slotFields(p), p.blob, BUDDIES_LIMITS.cardBytes),
  'event/put': (p) => {
    const base = withBlob(slotFields(p), p.blob, BUDDIES_LIMITS.eventBytes)
    if (!base || !isId(p.eventId) || !isEventKind(p.kind)) return null
    if (typeof p.push !== 'boolean') return null
    return { ...base, eventId: p.eventId, kind: p.kind, push: p.push }
  },
  'slot/leave': slotFields,
  'slot/seal': slotFields,
  'invite/fetch': (p) => (isId(p.inviteId) ? { inviteId: p.inviteId } : null),
  'invite/claim': (p) => {
    if (!isId(p.inviteId) || typeof p.claimSecret !== 'string') return null
    const claimSecret = decodeB64u(p.claimSecret)
    const claimBlob = blob(p.blob, BUDDIES_LIMITS.claimBytes)
    if (!claimSecret || claimSecret.length !== 32 || !claimBlob) return null
    return { inviteId: p.inviteId, claimSecret, blob: claimBlob }
  },
  'inbox/live': inboxFields,
  // `bytes` past `blobBytes` passes here: the route refuses it as `too_large`.
  'blob/put': (p, now) => {
    const base = inboxFields(p)
    if (!base || !bytes32(p.blobId) || !bytes32(p.readTokenHash)) return null
    const { bytes, expiresAt } = p
    if (!isSafeInteger(bytes) || bytes < 1) return null
    if (!isSafeInteger(expiresAt) || expiresAt <= now) return null
    if (expiresAt > now + BUDDIES_LIMITS.maxBlobLifetimeMs) return null
    return {
      ...base,
      blobId: p.blobId,
      bytes,
      expiresAt,
      readTokenHash: p.readTokenHash,
    }
  },
  'blob/get': (p) => {
    if (!isId(p.inboxId) || !bytes32(p.blobId) || !bytes32(p.token)) return null
    const token = decodeB64u(p.token)
    return token ? { inboxId: p.inboxId, blobId: p.blobId, token } : null
  },
  'blob/delete': (p) => {
    const base = inboxFields(p)
    const { blobIds } = p
    if (!base || !Array.isArray(blobIds)) return null
    if (blobIds.length < 1 || blobIds.length > BUDDIES_LIMITS.blobDeleteIds)
      return null
    if (!blobIds.every(bytes32)) return null
    return { ...base, blobIds: [...new Set(blobIds)] }
  },
  'inbox/successor': (p) => (isId(p.inboxId) ? { inboxId: p.inboxId } : null),
}

/** Ops whose payload is never signed, so it has no `ts` or `nonce`. */
const UNSIGNED_PAYLOAD_OPS: ReadonlySet<BuddiesRouteOp> = new Set([
  ...BUDDIES_UNSIGNED_OPS,
  BUDDIES_BLOB_GET_OP,
  BUDDIES_SUCCESSOR_OP,
])

/**
 * Validates a decoded envelope payload for one op: its fields
 * (`BUDDIES_FIELD_PARSERS`), plus `ts` and `nonce` for every signed op.
 * Null means `bad_request`.
 */
export const BUDDIES_PAYLOAD_PARSERS = Object.fromEntries(
  (Object.keys(BUDDIES_FIELD_PARSERS) as BuddiesRouteOp[]).map((op) => [
    op,
    (p: Fields, now: number) => {
      const fields = BUDDIES_FIELD_PARSERS[op](p, now)
      if (!fields || UNSIGNED_PAYLOAD_OPS.has(op)) return fields
      const ts = timestamp(p.ts)
      return ts != null && isId(p.nonce) ? { ...fields, ts, nonce: p.nonce } : null
    },
  ])
) as PayloadParsers

// --- Durable Object call shapes -------------------------------------------

/** The authenticated parts of a signed request, forwarded to the inbox DO. */
export interface SignedCall {
  /** Decoded bytes of the envelope's `payload`, exactly as the client signed them. */
  payloadBytes: Uint8Array
  signature: Uint8Array
}

export type Signed<T> = T & SignedCall

/**
 * An owner request authorized by an account session instead of the owner
 * key (a bearer request): the Worker verified the access token, and the
 * inbox DO compares `accountId` with the account the inbox is linked to.
 * No `ts` or `nonce`: the token, not a signature, authenticates it.
 */
export type AccountCall<T> = Unsigned<T> & { accountId: string }

/** An owner request as the inbox DO takes it: signed (legacy) or by account. */
export type OwnerCall<T> = Signed<T> | AccountCall<T>

export const isAccountCall = <T>(
  call: Signed<T> | AccountCall<T>
): call is AccountCall<T> => !('signature' in call)

/** `sealed` only on a slot its writer sealed (`slot/seal`); absent otherwise. */
export type SyncSlot = {
  slotId: string
  createdAt: number
  sealed?: true
}

export type SyncCard = {
  slotId: string
  blob: string
  seq: number
  updatedAt: number
}

export type SyncEvent = {
  eventId: string
  slotId: string
  kind: string
  blob: string
  seq: number
  createdAt: number
}

export interface SyncResponse {
  seq: number
  slots: SyncSlot[]
  cards: SyncCard[]
  events: SyncEvent[]
  roster: { blob: string; seq: number } | null
}

export interface InviteView {
  blob: string
  expiresAt: number
  status: 'open' | 'claimed'
}

/** A blob's R2 object key: `v1/<inboxId>/<blobId>` (the sender's inbox). */
export const buddyBlobKey = (inboxId: string, blobId: string): string =>
  `v1/${inboxId}/${blobId}`

/** Relay-created events carry this empty slot id. */
export const RELAY_SLOT_ID = ''
export const INVITE_CLAIMED_KIND = 'invite.claimed'
