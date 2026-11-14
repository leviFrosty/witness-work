import { DurableObject } from 'cloudflare:workers'
import type { Environment } from '../types'
import { acceptedBundleIds } from '../appAttest/appId'
import {
  bytesToBase64Url,
  bytesToHex,
  sha256Bytes,
  timingSafeEqual,
} from '../crypto'
import { deleteAllThen, readSeqPage } from '../durableObjectStorage'
import {
  BUDDIES_LIMITS as LIMITS,
  BUDDIES_LIVE_ACCOUNT_HEADER,
  BUDDIES_LIVE_EXPIRES_HEADER,
  BUDDIES_LIVE_CLOSE,
  BUDDIES_LIVE_OP,
  INVITE_CLAIMED_KIND,
  RELAY_SLOT_ID,
  buddyBlobKey,
  decodeB64u,
  fail,
  isAccountCall,
  isImmediatePushKind,
  isPlainObject,
  ok,
  type AccountCall,
  type BuddiesErrorCode,
  type BuddiesFailure,
  type BuddiesResult,
  type BuddiesSigningOp,
  type BlobDeletePayload,
  type BlobPutPayload,
  type CardPutPayload,
  type DeviceRegisterPayload,
  type DeviceUnregisterPayload,
  type EventPutPayload,
  type InboxFields,
  type InviteCreatePayload,
  type InviteDeletePayload,
  type OwnerCall,
  type PushAddress,
  type PushJob,
  type PushTarget,
  type RegisterPayload,
  type RosterPutPayload,
  type Signed,
  type SignedFields,
  type SlotAddPayload,
  type SlotPayload,
  type SyncCard,
  type SyncEvent,
  type SyncPayload,
  type SyncResponse,
  type SyncSlot,
} from './contracts'
import {
  isWebSocketUpgrade,
  readHeaderFields,
  readLiveCall,
  verifyBuddiesSignature,
} from './envelope'
import { BUDDIES_ABUSE_LIMITS as ABUSE, SignerBudget, logLimitHit } from './limits'
import { buddiesErrorResponse } from './errorResponse'
import { retryAfterSeconds } from '../errors'
import {
  closeExpiredSockets,
  readLiveExpiry,
  readLiveTicketHash,
  isTicketOpen,
  LIVE_TICKET_HEADER,
  soonestSocketExpiry,
} from '../liveSubprotocol'

type Empty = Record<string, never>

/** How the inbox answers the invite DO when a claim lands. */
export type ClaimDelivery =
  | { status: 'delivered'; push: PushJob | null }
  | { status: 'claimed_elsewhere' }
  | { status: 'gone' }

export interface StaleDevice {
  deviceId: string
  /** The APNs or FCM token that was rejected. */
  token: string
}

type PendingInviteDelete = {
  inviteId: string
  creatorInboxId: string
  expiresAt: number
}

type MetaRow = {
  inboxId: string
  ownerPub: string
  seq: number
  lastActiveAt: number
}
type DeviceRow = {
  deviceId: string
  service: string
  token: string
  apnsEnvironment: string | null
  apnsTopic: string | null
  appAlerts: number
  templates: string
}

/** A stored device's push address; null for a row this build can't use. */
const pushAddressOf = (row: DeviceRow): PushAddress | null => {
  if (row.service === 'fcm')
    return { service: 'fcm', token: row.token, appAlerts: row.appAlerts === 1 }
  if (row.service !== 'apns') return null
  if (row.apnsEnvironment !== 'sandbox' && row.apnsEnvironment !== 'production')
    return null
  return {
    service: 'apns',
    token: row.token,
    apnsEnvironment: row.apnsEnvironment,
    apnsTopic: row.apnsTopic,
  }
}

type KeyRef = 'owner' | 'writer'
type KeyedCall = { inboxId: string; slotId?: string }
/** A writer op, or an owner op either way (`OwnerCall`). */
type AuthCall = Signed<KeyedCall & SignedFields> | AccountCall<KeyedCall>

/** Who signed, for `SignerBudget`: the owner, or a writer by its slot id. */
const signerOf = (call: KeyedCall, ref: KeyRef): string =>
  ref === 'owner' ? 'owner' : (call.slotId ?? '')

const INVITE_DELETE_RETRY_MS = 60_000
/**
 * R2 deletions that failed are retried from the alarm this soon, then twice
 * as long after each failure in a row, up to `BLOB_DELETE_RETRY_MAX_MS`.
 */
const BLOB_DELETE_RETRY_MS = 60_000
const BLOB_DELETE_RETRY_MAX_MS = 6 * 60 * 60_000
/**
 * A failed upload keeps its (unreadable) row this long, in case its object
 * landed anyway: the row's expiry then deletes the object.
 */
const FAILED_UPLOAD_GRACE_MS = 10 * 60_000
/** How often an inbox that stores photos sweeps its R2 prefix. */
const BLOB_SWEEP_INTERVAL_MS = 7 * 24 * 60 * 60_000
/** The sweep leaves newer objects alone: their upload may be in flight. */
const BLOB_SWEEP_MIN_AGE_MS = 60 * 60_000
/** Keys per R2 `delete()` call (R2 takes up to 1,000). */
const BLOB_DELETE_BATCH = 100

type BlobRow = {
  bytes: number
  tokenHash: string
  expiresAt: number
  /** Null until the object is in R2. */
  writtenAt: number | null
}

/** `WebSocket.READY_STATE_OPEN`. */
const SOCKET_OPEN = 1

/**
 * Stored on each live socket; survives hibernation. `expiresAt` (epoch ms)
 * is a browser socket's token expiry and `ticket` its ticket's hash
 * (`LIVE_TICKET_HEADER`); native sockets have neither.
 */
type LiveAttachment = { openedAt: number; expiresAt?: number; ticket?: string }

const attachmentOf = (ws: WebSocket): LiveAttachment | null =>
  (ws.deserializeAttachment() as LiveAttachment | null) ?? null

const openedAt = (ws: WebSocket): number => attachmentOf(ws)?.openedAt ?? 0

const expiryOf = (ws: WebSocket): number | null =>
  attachmentOf(ws)?.expiresAt ?? null

const ticketOf = (ws: WebSocket): string | null =>
  attachmentOf(ws)?.ticket ?? null

/** Live sockets carry only these tiny signals, never content. */
type LiveMessage = { type: 'hello' | 'changed'; seq: number }

const closeQuietly = (ws: WebSocket, code: number, reason: string): void => {
  try {
    ws.close(code, reason)
  } catch {
    // Already closing or gone.
  }
}

const liveError = (failure: BuddiesFailure): Response =>
  buddiesErrorResponse(failure.error, {
    retryAfterSeconds: failure.retryAfterSeconds,
  })

/**
 * Every table is created on first registration, never for a probe: an
 * unregistered inbox stores nothing, and a wiped one keeps only its
 * `owner_tombstone`. `meta` is the existence marker.
 */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (
     singleton      INTEGER PRIMARY KEY CHECK (singleton = 1),
     inbox_id       TEXT NOT NULL,
     owner_pub      TEXT NOT NULL,
     seq            INTEGER NOT NULL,
     created_at     INTEGER NOT NULL,
     last_active_at INTEGER NOT NULL
   )`,
  // `sealed`: its writer sealed it (`slot/seal`); never cleared. Inboxes
  // from before it get the column in place (`#ready`).
  `CREATE TABLE IF NOT EXISTS slot (
     slot_id    TEXT PRIMARY KEY,
     writer_pub TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     sealed     INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS card (
     slot_id    TEXT PRIMARY KEY,
     blob       TEXT NOT NULL,
     seq        INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS event (
     event_id   TEXT PRIMARY KEY,
     slot_id    TEXT NOT NULL,
     kind       TEXT NOT NULL,
     blob       TEXT NOT NULL,
     seq        INTEGER NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS event_by_seq ON event (seq)',
  'CREATE INDEX IF NOT EXISTS event_by_created ON event (created_at)',
  'CREATE INDEX IF NOT EXISTS event_by_slot ON event (slot_id)',
  // Running count and blob bytes of each writer slot's stored events, so the
  // storage caps never scan the event table. Kept in step on insert, slot
  // removal, and retention; relay events (slot "") aren't counted.
  `CREATE TABLE IF NOT EXISTS slot_usage (
     slot_id TEXT PRIMARY KEY,
     events  INTEGER NOT NULL,
     bytes   INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS roster (
     singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
     blob      TEXT NOT NULL,
     seq       INTEGER NOT NULL
   )`,
  // `service` is `apns` or `fcm`; the `apns_*` columns are null for FCM.
  // `app_alerts` (FCM): the app posts named alerts itself.
  `CREATE TABLE IF NOT EXISTS push_device (
     device_id        TEXT PRIMARY KEY,
     service          TEXT NOT NULL,
     token            TEXT NOT NULL,
     apns_environment TEXT,
     apns_topic       TEXT,
     templates        TEXT NOT NULL,
     created_at       INTEGER NOT NULL,
     updated_at       INTEGER NOT NULL,
     app_alerts       INTEGER NOT NULL DEFAULT 0
   )`,
  'CREATE INDEX IF NOT EXISTS push_device_by_token ON push_device (service, token)',
  // Open-invite bookkeeping for the caps; rows leave with the invite.
  `CREATE TABLE IF NOT EXISTS invite (
     invite_id  TEXT PRIMARY KEY,
     status     TEXT NOT NULL,
     expires_at INTEGER NOT NULL
   )`,
  // Rolling 24 h creation log. Random ids so it never holds invite ids.
  `CREATE TABLE IF NOT EXISTS invite_creation (
     id         TEXT PRIMARY KEY,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS slot_write (
     slot_id TEXT NOT NULL,
     at      INTEGER NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS slot_write_by_slot ON slot_write (slot_id, at)',
  `CREATE TABLE IF NOT EXISTS slot_push (
     slot_id TEXT NOT NULL,
     at      INTEGER NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS slot_push_by_slot ON slot_push (slot_id, at)',
  `CREATE TABLE IF NOT EXISTS nonce (
     nonce   TEXT PRIMARY KEY,
     seen_at INTEGER NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS nonce_by_seen ON nonce (seen_at)',
  // Invite deletions that failed during a wipe, retried from the alarm.
  `CREATE TABLE IF NOT EXISTS pending_invite_delete (
     invite_id        TEXT PRIMARY KEY,
     creator_inbox_id TEXT NOT NULL,
     expires_at       INTEGER NOT NULL
   )`,
  // Photo blobs the owner uploaded; the sealed bytes are in R2 at
  // `v1/<inboxId>/<blobId>`. `written_at` stays null until the object is
  // stored, and `blob/get` serves only written, unexpired rows. Inboxes from
  // before photos get these tables in place (`#ready`).
  `CREATE TABLE IF NOT EXISTS blob (
     blob_id    TEXT PRIMARY KEY,
     bytes      INTEGER NOT NULL,
     token_hash TEXT NOT NULL,
     expires_at INTEGER NOT NULL,
     created_at INTEGER NOT NULL,
     written_at INTEGER
   )`,
  'CREATE INDEX IF NOT EXISTS blob_by_expiry ON blob (expires_at)',
  // Rolling 24 h log of object writes. Random ids, so it never holds blob ids.
  `CREATE TABLE IF NOT EXISTS blob_upload (
     id TEXT PRIMARY KEY,
     at INTEGER NOT NULL
   )`,
  // R2 objects still to delete (blob/delete, expiry, a wipe that failed
  // part-way), retried from the alarm.
  `CREATE TABLE IF NOT EXISTS pending_blob_delete (
     object_key TEXT PRIMARY KEY
   )`,
  // R2 deletions failing in a row, and when the alarm tries again.
  `CREATE TABLE IF NOT EXISTS blob_delete_backoff (
     singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
     failures  INTEGER NOT NULL,
     retry_at  INTEGER NOT NULL
   )`,
  // When this inbox next sweeps its R2 prefix for objects no row knows.
  // Kept while it stores photos.
  `CREATE TABLE IF NOT EXISTS blob_sweep (
     singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
     due_at    INTEGER NOT NULL
   )`,
] as const

/**
 * The owner key's hash, written by every wipe and kept with no expiry, so only
 * that key can register this `inboxId` again. Not in `SCHEMA`: it holds nothing
 * else, and an inbox that was never wiped doesn't have it.
 */
const TOMBSTONE_SCHEMA = `CREATE TABLE IF NOT EXISTS owner_tombstone (
   singleton      INTEGER PRIMARY KEY CHECK (singleton = 1),
   owner_key_hash TEXT NOT NULL
 )`

/**
 * The account that owns this inbox, and whether it's suspended (witness-work
 * ADR 0024). Not in `SCHEMA`: an inbox registered without an account doesn't
 * have it. A wipe deletes it; the accounts database keeps the link, and the
 * Worker passes it back on the next registration. Bearer owner requests
 * (witness-work ADR 0027) are authorized against `account_id` once
 * `confirmed`: another account is `forbidden`, and an inbox without a
 * confirmed link is `not_linked`.
 *
 * `confirmed` means the accounts database holds the same link. The Worker
 * only writes the row with the account that database names (an existing
 * link, a new one once written, or a status change), so moderation, which
 * finds an account's inboxes there, reaches every inbox its tokens can act
 * for. Rows from before the column count as unconfirmed until the app links
 * the inbox again.
 */
const OWNER_ACCOUNT_SCHEMA = `CREATE TABLE IF NOT EXISTS owner_account (
   singleton  INTEGER PRIMARY KEY CHECK (singleton = 1),
   account_id TEXT NOT NULL,
   suspended  INTEGER NOT NULL DEFAULT 0,
   confirmed  INTEGER NOT NULL DEFAULT 0
 )`

/**
 * Owner ops a suspended account keeps, so people can always leave: removing a
 * buddy and deleting the inbox.
 */
const SUSPENDED_ALLOWED_OPS: ReadonlySet<BuddiesSigningOp> = new Set([
  'inbox/delete',
  'slot/remove',
])

const encoder = new TextEncoder()

/** b64u SHA-256 of a domain label and the canonical b64u `ownerPub`. */
const ownerKeyHash = async (ownerPub: string): Promise<string> =>
  bytesToBase64Url(
    await sha256Bytes(encoder.encode(`ww-buddies/v1/inbox-owner\n${ownerPub}`))
  )

/**
 * One SQLite Durable Object per `inboxId`: the owner key, slots (buddies'
 * writer keys), Buddy Cards, events, devices, the encrypted roster, the nonce
 * cache, the per-inbox `seq`, open-invite bookkeeping, and the owner's photo
 * blobs (their bytes live in R2). It holds ciphertext, random ids, hashes,
 * public keys, and push tokens only. A wiped inbox keeps a hash of its owner
 * key, which binds the `inboxId` to that key for good.
 *
 * Signed ops verify (and hash, for the tombstone) first, the only awaits, then
 * run their checks and writes in one synchronous transaction, so caps, `seq`,
 * and the owner binding stay exact under concurrency.
 *
 * The owner's devices can hold live sockets here (`inbox/live`, Hibernation
 * API). After every committed write that changes what `inbox/sync` returns,
 * each socket gets `{"type":"changed","seq":…}` and the app syncs as usual.
 */
export class BuddyInbox extends DurableObject<Environment> {
  #schemaReady = false
  #signers = new SignerBudget(ABUSE.signerWindowMs)

  constructor(ctx: DurableObjectState, env: Environment) {
    super(ctx, env)
    // Keepalives get their answer from the runtime without waking the object.
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong')
    )
  }

  // --- Owner ops ----------------------------------------------------------
  //
  // Each takes an `OwnerCall`: signed by the owner key (a legacy request),
  // or an `AccountCall` the Worker authenticated with a bearer token, which
  // `#authenticate` checks against the inbox's account and which has no
  // `ts` or `nonce` to check or record.

  /**
   * `accountId` is the account the accounts database already links the inbox
   * to (null when it links none), taken as confirmed. A new link is confirmed
   * with `confirmAccount` once that database has it. It never clears a
   * suspension: only `setAccountStatus` does.
   */
  async register(
    call: Signed<RegisterPayload>,
    accountId: string | null = null
  ): Promise<BuddiesResult<Empty>> {
    const valid = await verifyBuddiesSignature(
      call.ownerPub,
      'inbox/register',
      call.payloadBytes,
      call.signature
    )
    if (!valid) return fail('bad_signature')
    const keyHash = await ownerKeyHash(call.ownerPub)

    const now = Date.now()
    const result = this.ctx.storage.transactionSync(
      (): BuddiesResult<Empty> => {
        if (this.#isStale(call, now)) return fail('stale')
        const meta = this.#meta()
        if (meta && meta.ownerPub !== call.ownerPub) return fail('conflict')
        // A wiped inbox stays bound to its owner's key.
        const tombstone = this.#tombstone()
        if (tombstone != null && tombstone !== keyHash) return fail('conflict')
        if (this.#suspended()) return fail('suspended')
        this.#ensureSchema()
        if (!this.#claimNonce(call, now)) return fail('replay')
        if (meta) {
          this.#touch(now)
        } else {
          this.#sql.exec(
            `INSERT INTO meta (singleton, inbox_id, owner_pub, seq, created_at, last_active_at)
           VALUES (1, ?, ?, 0, ?, ?)`,
            call.inboxId,
            call.ownerPub,
            now,
            now
          )
        }
        if (accountId) {
          this.#ensureOwnerAccount()
          this.#sql.exec(
            `INSERT INTO owner_account (singleton, account_id, confirmed) VALUES (1, ?, 1)
             ON CONFLICT (singleton) DO UPDATE
             SET account_id = excluded.account_id, confirmed = 1`,
            accountId
          )
        }
        return ok({})
      }
    )
    if (result.ok) await this.#ensureAlarm(now)
    return result
  }

  /**
   * `linkedOnly`: a legacy (owner-signed) sync the Worker admitted after the
   * legacy switch went off, from the iOS Notification Service Extension.
   * Checked as ever, and served only while this inbox has a confirmed account
   * link (its owner moved to sessions), else `upgrade_required`.
   */
  async sync(
    call: OwnerCall<SyncPayload>,
    { linkedOnly = false }: { linkedOnly?: boolean } = {}
  ): Promise<BuddiesResult<SyncResponse>> {
    const auth = await this.#authenticate('inbox/sync', call, 'owner', {
      linkedOnly,
    })
    if (!auth.ok) return auth
    return this.#commit(call, 'owner', auth.value, (now) =>
      ok(this.#snapshot(call.since, now))
    )
  }

  async deleteInbox(
    call: OwnerCall<InboxFields>
  ): Promise<BuddiesResult<Empty>> {
    const auth = await this.#authenticate('inbox/delete', call, 'owner')
    if (!auth.ok) return auth
    // Hash before the commit, so no other await sits between it and the wipe.
    const tombstone = await ownerKeyHash(auth.value)
    const admitted = this.#commit(call, 'owner', auth.value, () => ok({}))
    if (!admitted.ok) return admitted
    await this.#wipe(Date.now(), tombstone)
    return ok({})
  }

  async registerDevice(
    call: OwnerCall<DeviceRegisterPayload>
  ): Promise<BuddiesResult<Empty>> {
    const { push } = call
    // Only topics this worker can sign for; absent means `IOS_BUNDLE_ID`.
    if (
      push.service === 'apns' &&
      push.apnsTopic != null &&
      !acceptedBundleIds(this.env).includes(push.apnsTopic)
    ) {
      return fail('bad_request')
    }
    const auth = await this.#authenticate('device/register', call, 'owner')
    if (!auth.ok) return auth
    return this.#commit(call, 'owner', auth.value, (now) => {
      // One row per token, so a reinstall with a new deviceId doesn't double-push.
      this.#sql.exec(
        'DELETE FROM push_device WHERE service = ? AND token = ? AND device_id <> ?',
        push.service,
        push.token,
        call.deviceId
      )
      this.#sql.exec(
        `INSERT INTO push_device (device_id, service, token, apns_environment, apns_topic, app_alerts, templates, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (device_id) DO UPDATE SET
           service = excluded.service,
           token = excluded.token,
           apns_environment = excluded.apns_environment,
           apns_topic = excluded.apns_topic,
           app_alerts = excluded.app_alerts,
           templates = excluded.templates,
           updated_at = excluded.updated_at`,
        call.deviceId,
        push.service,
        push.token,
        push.service === 'apns' ? push.apnsEnvironment : null,
        push.service === 'apns' ? push.apnsTopic : null,
        push.service === 'fcm' && push.appAlerts ? 1 : 0,
        JSON.stringify(call.templates),
        now,
        now
      )
      const excess =
        this.#count('SELECT COUNT(*) AS n FROM push_device') - LIMITS.devices
      if (excess > 0) {
        // Evict the least recently registered devices.
        this.#sql.exec(
          `DELETE FROM push_device WHERE device_id IN (
             SELECT device_id FROM push_device WHERE device_id <> ?
             ORDER BY updated_at, created_at LIMIT ?
           )`,
          call.deviceId,
          excess
        )
      }
      return ok({})
    })
  }

  async unregisterDevice(
    call: OwnerCall<DeviceUnregisterPayload>
  ): Promise<BuddiesResult<Empty>> {
    const auth = await this.#authenticate('device/unregister', call, 'owner')
    if (!auth.ok) return auth
    return this.#commit(call, 'owner', auth.value, () => {
      this.#sql.exec(
        'DELETE FROM push_device WHERE device_id = ?',
        call.deviceId
      )
      return ok({})
    })
  }

  async addSlot(call: OwnerCall<SlotAddPayload>): Promise<BuddiesResult<Empty>> {
    const auth = await this.#authenticate('slot/add', call, 'owner')
    if (!auth.ok) return auth
    let added = false
    const result = this.#commit(call, 'owner', auth.value, (now) => {
      const existing = this.#writerPub(call.slotId)
      if (existing != null)
        return existing === call.writerPub ? ok({}) : fail('conflict')
      if (
        this.#slotCount() + this.#openInvites(now) >=
        LIMITS.slotsPlusOpenInvites
      ) {
        return fail('limit')
      }
      this.#sql.exec(
        'INSERT INTO slot (slot_id, writer_pub, created_at) VALUES (?, ?, ?)',
        call.slotId,
        call.writerPub,
        now
      )
      added = true
      return ok({})
    })
    if (added) this.#broadcastChanged()
    return result
  }

  async removeSlot(call: OwnerCall<SlotPayload>): Promise<BuddiesResult<Empty>> {
    const auth = await this.#authenticate('slot/remove', call, 'owner')
    if (!auth.ok) return auth
    let removed = false
    const result = this.#commit(call, 'owner', auth.value, () => {
      removed = this.#deleteSlot(call.slotId)
      return ok({})
    })
    if (removed) this.#broadcastChanged()
    return result
  }

  async putRoster(
    call: OwnerCall<RosterPutPayload>
  ): Promise<BuddiesResult<{ seq: number }>> {
    const auth = await this.#authenticate('roster/put', call, 'owner')
    if (!auth.ok) return auth
    const result = this.#commit(call, 'owner', auth.value, () => {
      const seq = this.#nextSeq()
      this.#sql.exec(
        `INSERT INTO roster (singleton, blob, seq) VALUES (1, ?, ?)
         ON CONFLICT (singleton) DO UPDATE SET blob = excluded.blob, seq = excluded.seq`,
        call.blob,
        seq
      )
      return ok({ seq })
    })
    if (result.ok) this.#broadcastChanged()
    return result
  }

  async createInvite(
    call: OwnerCall<InviteCreatePayload>
  ): Promise<BuddiesResult<Empty>> {
    const auth = await this.#authenticate('invite/create', call, 'owner')
    if (!auth.ok) return auth

    // Reserve the spot here first, so concurrent creates and slot/adds see it
    // while the invite DO call is in flight.
    const creationId = crypto.randomUUID()
    const reserved = this.#commit(
      call,
      'owner',
      auth.value,
      (now): BuddiesResult<Empty> => {
        if (
          this.#count(
            'SELECT COUNT(*) AS n FROM invite WHERE invite_id = ?',
            call.inviteId
          )
        ) {
          return fail('conflict')
        }
        const open = this.#openInvites(now)
        if (
          open >= LIMITS.openInvites ||
          this.#slotCount() + open >= LIMITS.slotsPlusOpenInvites
        ) {
          return fail('limit')
        }
        this.#sql.exec(
          'DELETE FROM invite_creation WHERE created_at <= ?',
          now - LIMITS.inviteCreationWindowMs
        )
        if (
          this.#count('SELECT COUNT(*) AS n FROM invite_creation') >=
          LIMITS.inviteCreations
        ) {
          logLimitHit('invite/create', 'inviteCreations')
          const { oldest } = this.#sql
            .exec<{
              oldest: number
            }>('SELECT MIN(created_at) AS oldest FROM invite_creation')
            .one()
          return fail(
            'rate_limited',
            retryAfterSeconds(oldest + LIMITS.inviteCreationWindowMs - now)
          )
        }
        this.#sql.exec(
          "INSERT INTO invite (invite_id, status, expires_at) VALUES (?, 'open', ?)",
          call.inviteId,
          call.expiresAt
        )
        this.#sql.exec(
          'INSERT INTO invite_creation (id, created_at) VALUES (?, ?)',
          creationId,
          now
        )
        return ok({})
      }
    )
    if (!reserved.ok) return reserved

    const invite = this.#invite(call.inviteId)
    let created: BuddiesResult<Empty>
    try {
      created = await invite.create({
        inviteId: call.inviteId,
        creatorInboxId: call.inboxId,
        claimVerifier: call.claimVerifier,
        blob: call.blob,
        expiresAt: call.expiresAt,
      })
    } catch (error) {
      this.#releaseInvite(call.inviteId, creationId)
      throw error
    }
    if (!created.ok) {
      this.#releaseInvite(call.inviteId, creationId)
      return created
    }
    if (!this.#meta()) {
      // The inbox was deleted while the invite was being created.
      await invite.deleteByCreator(call.inboxId)
      return fail('not_found')
    }
    await this.#ensureAlarm(Date.now())
    return ok({})
  }

  async deleteInvite(
    call: OwnerCall<InviteDeletePayload>
  ): Promise<BuddiesResult<Empty>> {
    const auth = await this.#authenticate('invite/delete', call, 'owner')
    if (!auth.ok) return auth
    const removed = this.#commit(call, 'owner', auth.value, () => {
      this.#sql.exec('DELETE FROM invite WHERE invite_id = ?', call.inviteId)
      return ok({})
    })
    if (!removed.ok) return removed
    // The invite DO only deletes when this inbox created it.
    await this.#invite(call.inviteId).deleteByCreator(call.inboxId)
    return ok({})
  }

  // --- Writer ops ---------------------------------------------------------

  async putCard(
    call: Signed<CardPutPayload>
  ): Promise<BuddiesResult<{ seq: number }>> {
    const auth = await this.#authenticate('card/put', call, 'writer')
    if (!auth.ok) return auth
    const result = this.#commit(call, 'writer', auth.value, (now) => {
      const refused = this.#recordWrite('card/put', call.slotId, now)
      if (refused) return refused
      const seq = this.#nextSeq()
      this.#sql.exec(
        `INSERT INTO card (slot_id, blob, seq, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (slot_id) DO UPDATE SET
           blob = excluded.blob, seq = excluded.seq, updated_at = excluded.updated_at`,
        call.slotId,
        call.blob,
        seq,
        now
      )
      return ok({ seq })
    })
    if (result.ok) this.#broadcastChanged()
    return result
  }

  async putEvent(
    call: Signed<EventPutPayload>
  ): Promise<BuddiesResult<{ seq: number; push: PushJob | null }>> {
    const auth = await this.#authenticate('event/put', call, 'writer')
    if (!auth.ok) return auth
    let inserted = false
    const result = this.#commit(call, 'writer', auth.value, (now) => {
      const existing = this.#eventSeq(call.eventId)
      if (existing != null) return ok({ seq: existing, push: null })
      const cap = this.#eventCapHit(call.slotId, call.blob.length)
      if (cap) {
        logLimitHit('event/put', cap)
        return fail('rate_limited', this.#eventCapWait(cap, call.slotId, now))
      }
      const refused = this.#recordWrite('event/put', call.slotId, now)
      if (refused) return refused
      const seq = this.#nextSeq()
      this.#sql.exec(
        `INSERT INTO event (event_id, slot_id, kind, blob, seq, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        call.eventId,
        call.slotId,
        call.kind,
        call.blob,
        seq,
        now
      )
      this.#sql.exec(
        `INSERT INTO slot_usage (slot_id, events, bytes) VALUES (?, 1, ?)
         ON CONFLICT (slot_id) DO UPDATE SET
           events = events + 1, bytes = bytes + excluded.bytes`,
        call.slotId,
        call.blob.length
      )
      inserted = true
      const push = call.push
        ? this.#reservePush(
            call.inboxId,
            call.slotId,
            call.kind,
            { seq, eventId: call.eventId, blob: call.blob },
            now
          )
        : null
      return ok({ seq, push })
    })
    if (inserted) {
      this.#broadcastChanged()
      await this.#ensureAlarm(Date.now())
    }
    return result
  }

  /**
   * Idempotent: a missing inbox or slot means there is nothing left to leave.
   * Leaving a sealed slot keeps its events (`#departSealedSlot`).
   */
  async leaveSlot(call: Signed<SlotPayload>): Promise<BuddiesResult<Empty>> {
    const key = this.#key(call, 'writer')
    if (!key.ok) return ok({})
    const valid = await verifyBuddiesSignature(
      key.value,
      'slot/leave',
      call.payloadBytes,
      call.signature
    )
    if (!valid) return fail('bad_signature')
    let removed = false
    const result = this.#commit(
      call,
      'writer',
      key.value,
      () => {
        removed = this.#sealed(call.slotId)
          ? this.#departSealedSlot(call.slotId)
          : this.#deleteSlot(call.slotId)
        return ok({})
      },
      { whileSealed: true }
    )
    if (removed) this.#broadcastChanged()
    if (!result.ok && (result.error === 'gone' || result.error === 'not_found'))
      return ok({})
    return result
  }

  /**
   * `slot/seal` (witness-work ADR 0039 §5): after a key change, whoever holds
   * the old account key holds the User's writer keys too, so the User's
   * device seals each slot it writes from before it leaves. From then on
   * every writer op from the slot but leaving and sealing again is `sealed`
   * (`#commit`), for good. The owner still reads what's there and can remove
   * the slot. Idempotent. Unlike `slot/leave`, a missing inbox or slot is an
   * error: nothing was sealed.
   */
  async sealSlot(call: Signed<SlotPayload>): Promise<BuddiesResult<Empty>> {
    const auth = await this.#authenticate('slot/seal', call, 'writer')
    if (!auth.ok) return auth
    let sealed = false
    const result = this.#commit(
      call,
      'writer',
      auth.value,
      () => {
        if (!this.#sealed(call.slotId)) {
          this.#sql.exec('UPDATE slot SET sealed = 1 WHERE slot_id = ?', call.slotId)
          sealed = true
        }
        return ok({})
      },
      { whileSealed: true }
    )
    // The owner's `inbox/sync` shows it.
    if (sealed) this.#broadcastChanged()
    return result
  }

  // --- Photo blobs ----------------------------------------------------------

  /**
   * `blob/put`, after the Worker checked that `body` is `call.bytes` long and
   * hashes to `call.blobId`. Idempotent per `blobId`: a repeat keeps the
   * first read-token hash and moves the expiry to the later of the two. The
   * object is (re)written only when it isn't stored yet or the expiry moves,
   * so a live object is never older than `maxBlobLifetimeMs` and the R2
   * lifecycle backstop never removes one. Only an inbox with a buddy (a
   * slot) can write one. New blobs count against the per-inbox caps until
   * they expire, and every object write counts toward the rolling day's
   * uploads.
   */
  async putBlob(
    call: OwnerCall<BlobPutPayload>,
    body: Uint8Array
  ): Promise<BuddiesResult<{ expiresAt: number }>> {
    const bucket = this.env.BUDDY_BLOBS
    if (!bucket) return fail('photos_disabled')
    const auth = await this.#authenticate('blob/put', call, 'owner')
    if (!auth.ok) return auth

    const uploadId = crypto.randomUUID()
    let write = null as 'new' | 'existing' | null
    const reserved = this.#commit(
      call,
      'owner',
      auth.value,
      (now): BuddiesResult<{ expiresAt: number }> => {
        const row = this.#blobRow(call.blobId)
        // Stored, and the expiry doesn't move: nothing to write.
        if (row?.writtenAt != null && call.expiresAt <= row.expiresAt)
          return ok({ expiresAt: row.expiresAt })
        // A photo is for buddies to read: without one, nobody could.
        if (!this.#count('SELECT COUNT(*) AS n FROM slot'))
          return fail('no_buddies')
        if (!row) {
          const cap = this.#blobCapHit(call.bytes, now)
          if (cap) {
            logLimitHit('blob/put', cap.limit)
            return fail('rate_limited', retryAfterSeconds(cap.waitMs))
          }
        }
        const refused = this.#recordUpload(uploadId, now)
        if (refused) return refused
        if (row) {
          write = 'existing'
        } else {
          // The expiry is stored with the write, so a reservation keeps the new one.
          this.#sql.exec(
            `INSERT INTO blob (blob_id, bytes, token_hash, expires_at, created_at, written_at)
             VALUES (?, ?, ?, ?, ?, NULL)`,
            call.blobId,
            call.bytes,
            call.readTokenHash,
            call.expiresAt,
            now
          )
          this.#sql.exec(
            'INSERT OR IGNORE INTO blob_sweep (singleton, due_at) VALUES (1, ?)',
            now + BLOB_SWEEP_INTERVAL_MS
          )
          write = 'new'
        }
        return ok({ expiresAt: Math.max(row?.expiresAt ?? 0, call.expiresAt) })
      }
    )
    if (!reserved.ok || write == null) return reserved

    const key = buddyBlobKey(call.inboxId, call.blobId)
    const digest = decodeB64u(call.blobId)
    try {
      await bucket.put(key, body, digest ? { sha256: bytesToHex(digest) } : {})
    } catch (error) {
      const failedAt = Date.now()
      this.#releaseUpload(call.blobId, uploadId, write === 'new', failedAt)
      await this.#ensureAlarm(failedAt).catch(() => undefined)
      throw error
    }

    const now = Date.now()
    const stored = this.ctx.storage.transactionSync((): number | null => {
      if (!this.#meta()) return null
      const row = this.#blobRow(call.blobId)
      if (!row) return null
      const expiresAt = Math.max(row.expiresAt, call.expiresAt)
      this.#sql.exec(
        'UPDATE blob SET written_at = ?, expires_at = ? WHERE blob_id = ?',
        now,
        expiresAt,
        call.blobId
      )
      return expiresAt
    })
    if (stored == null) {
      // Deleted, or the inbox wiped, while the object was being written.
      await this.#deleteObjects([key], now)
      return fail('not_found')
    }
    await this.#ensureAlarm(now)
    return ok({ expiresAt: stored })
  }

  /**
   * `blob/get`: whether `tokenHash` reads `blobId` from this inbox right now.
   * Unknown inboxes and blobs, unwritten or expired blobs, and wrong tokens
   * are all the same `not_found`. The Worker hashes the token and streams the
   * object; nothing here counts as owner activity.
   */
  authorizeBlobRead(args: {
    inboxId: string
    blobId: string
    tokenHash: string
  }): BuddiesResult<Empty> {
    const meta = this.#meta()
    const row =
      meta?.inboxId === args.inboxId ? this.#blobRow(args.blobId) : null
    // Always compare, so a missing blob takes as long as a wrong token.
    const tokenOk = timingSafeEqual(row?.tokenHash ?? '', args.tokenHash)
    const readable =
      row != null &&
      tokenOk &&
      row.writtenAt != null &&
      row.expiresAt > Date.now()
    return readable ? ok({}) : fail('not_found')
  }

  /**
   * `blob/delete`: forgets the blobs at once (so reads stop), then deletes
   * their objects. Idempotent; unknown ids still get their object deleted,
   * in case one outlived its row. R2 failures are retried from the alarm.
   */
  async deleteBlobs(
    call: OwnerCall<BlobDeletePayload>
  ): Promise<BuddiesResult<Empty>> {
    const auth = await this.#authenticate('blob/delete', call, 'owner')
    if (!auth.ok) return auth
    const result = this.#commit(call, 'owner', auth.value, () => {
      for (const blobId of call.blobIds) {
        this.#sql.exec('DELETE FROM blob WHERE blob_id = ?', blobId)
        this.#sql.exec(
          'INSERT OR IGNORE INTO pending_blob_delete (object_key) VALUES (?)',
          buddyBlobKey(call.inboxId, blobId)
        )
      }
      return ok({})
    })
    if (!result.ok) return result
    const now = Date.now()
    await this.#flushBlobDeletes()
    await this.#ensureAlarm(now)
    return result
  }

  // --- Live socket ---------------------------------------------------------

  /**
   * `GET inbox/live`, forwarded by the Worker. Verifies the owner's signed
   * headers (stale and replay checks included), or, for a bearer upgrade,
   * the account the Worker verified (`BUDDIES_LIVE_ACCOUNT_HEADER`, which it
   * sets only from a valid token), then accepts the socket with the
   * Hibernation API and greets it with the current `seq`. Opening a socket is
   * not owner activity for the 180-day retention. A browser socket's token
   * expiry (`BUDDIES_LIVE_EXPIRES_HEADER`, also set only by the Worker) is
   * one of the alarm's deadlines; the alarm closes it with `4004 "expired"`.
   * While a socket on the browser's ticket (`LIVE_TICKET_HEADER`, its hash,
   * set only by the Worker) is open, another is 409 `conflict`, so a copied
   * ticket can't push the owner's sockets off.
   */
  async fetch(request: Request): Promise<Response> {
    if (!isWebSocketUpgrade(request)) return liveError(fail('upgrade_required'))
    const expiresAt = readLiveExpiry(
      request.headers.get(BUDDIES_LIVE_EXPIRES_HEADER)
    )
    const ticket = readLiveTicketHash(request.headers.get(LIVE_TICKET_HEADER))
    if (expiresAt === undefined || ticket === undefined)
      return liveError(fail('bad_request'))
    // Only a socket that passed every check below holds this ticket.
    if (ticket != null && isTicketOpen(this.#liveSockets(), ticket, ticketOf))
      return liveError(fail('conflict'))
    const call = this.#liveCall(request.headers, Date.now())
    if (!call.ok) return liveError(call)
    const auth = await this.#authenticate(BUDDIES_LIVE_OP, call.value, 'owner')
    if (!auth.ok) return liveError(auth)
    const admitted = this.#commit(
      call.value,
      'owner',
      auth.value,
      () => ok(this.#meta()?.seq ?? 0),
      { activity: false }
    )
    if (!admitted.ok) return liveError(admitted)

    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server)
    const attachment: LiveAttachment = {
      openedAt: Date.now(),
      ...(expiresAt == null ? {} : { expiresAt }),
      ...(ticket == null ? {} : { ticket }),
    }
    server.serializeAttachment(attachment)
    // One socket per device is typical; past the cap the oldest make way.
    const others = this.#liveSockets()
      .filter((ws) => ws !== server)
      .sort((a, b) => openedAt(a) - openedAt(b))
    const excess = others.length + 1 - LIMITS.liveSockets
    const { code, reason } = BUDDIES_LIVE_CLOSE.replaced
    for (const ws of others.slice(0, Math.max(0, excess)))
      closeQuietly(ws, code, reason)
    this.#signal(server, { type: 'hello', seq: admitted.value })
    if (expiresAt != null) await this.#ensureAlarm(Date.now())
    return new Response(null, { status: 101, webSocket: client })
  }

  /** The upgrade's owner call: by account (bearer) or signed (legacy). */
  #liveCall(
    headers: Headers,
    now: number
  ): BuddiesResult<OwnerCall<InboxFields>> {
    const accountId = headers.get(BUDDIES_LIVE_ACCOUNT_HEADER)
    if (accountId == null) return readLiveCall(headers, now)
    const fields = readHeaderFields(BUDDIES_LIVE_OP, headers, now)
    return fields.ok ? ok({ ...fields.value, accountId }) : fields
  }

  /** Sockets only listen; anything but the auto-answered `ping` is ignored. */
  webSocketMessage(): void {}

  /** Completes the close the client started. */
  webSocketClose(ws: WebSocket): void {
    closeQuietly(ws, 1000, '')
  }

  webSocketError(ws: WebSocket): void {
    closeQuietly(ws, 1011, '')
  }

  // --- Relay-internal (Worker and invite DO only) ---------------------------

  /**
   * Appends the relay's `invite.claimed` event (eventId = inviteId, slotId "").
   * `gone` when the inbox or its bookkeeping for the invite no longer exists,
   * e.g. the owner cancelled it.
   */
  async recordClaim(args: {
    inboxId: string
    inviteId: string
    blob: string
  }): Promise<ClaimDelivery> {
    const now = Date.now()
    let inserted = false
    const delivery = this.ctx.storage.transactionSync((): ClaimDelivery => {
      const meta = this.#meta()
      if (!meta || meta.inboxId !== args.inboxId) return { status: 'gone' }
      if (
        !this.#count(
          'SELECT COUNT(*) AS n FROM invite WHERE invite_id = ?',
          args.inviteId
        )
      ) {
        return { status: 'gone' }
      }
      this.#sql.exec(
        "UPDATE invite SET status = 'claimed' WHERE invite_id = ?",
        args.inviteId
      )
      const existing = this.#sql
        .exec<{
          blob: string
          seq: number
        }>('SELECT blob, seq FROM event WHERE event_id = ?', args.inviteId)
        .toArray()[0]
      if (existing) {
        if (existing.blob !== args.blob) return { status: 'claimed_elsewhere' }
        // Only reachable after the invite DO reopened a claim whose delivery
        // threw, so the Worker never pushed the first attempt.
        return {
          status: 'delivered',
          push: this.#claimPush(meta.inboxId, args, existing.seq),
        }
      }
      const seq = this.#nextSeq()
      this.#sql.exec(
        `INSERT INTO event (event_id, slot_id, kind, blob, seq, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        args.inviteId,
        RELAY_SLOT_ID,
        INVITE_CLAIMED_KIND,
        args.blob,
        seq,
        now
      )
      inserted = true
      return {
        status: 'delivered',
        push: this.#claimPush(meta.inboxId, args, seq),
      }
    })
    if (inserted) {
      this.#broadcastChanged()
      await this.#ensureAlarm(now)
    }
    return delivery
  }

  /** Drops bookkeeping for an invite the invite DO burned. */
  forgetInvite(inviteId: string): void {
    if (!this.#ready()) return
    this.#sql.exec('DELETE FROM invite WHERE invite_id = ?', inviteId)
  }

  /**
   * Deletes devices APNs or FCM rejected, unless they re-registered a new token
   * since.
   */
  removeDevices(devices: StaleDevice[]): void {
    if (!this.#ready()) return
    this.ctx.storage.transactionSync(() => {
      for (const device of devices) {
        this.#sql.exec(
          'DELETE FROM push_device WHERE device_id = ? AND token = ?',
          device.deviceId,
          device.token
        )
      }
    })
  }

  /**
   * Whether this inbox is registered and not deleted or wiped: an inbox's
   * successor must be (witness-work ADR 0039 §5). Reads only; creates
   * nothing.
   */
  async isRegistered(inboxId: string): Promise<boolean> {
    return this.#meta()?.inboxId === inboxId
  }

  /**
   * The accounts database linked this inbox to `accountId`, after this inbox
   * accepted the owner-signed registration: from now on that account's
   * bearer requests act as the owner. It's the database's winner, so when
   * two accounts claimed the inbox at once, the inbox names the same one.
   * `suspended` is the account's status as read after the link was written,
   * so a suspension that listed the account's inboxes just before still
   * applies. Never clears a suspension. Idempotent; a no-op for an inbox
   * that isn't registered.
   */
  async confirmAccount(accountId: string, suspended: boolean): Promise<void> {
    if (!this.#ready() || !this.#meta()) return
    this.ctx.storage.transactionSync(() => {
      this.#ensureOwnerAccount()
      this.#sql.exec(
        `INSERT INTO owner_account (singleton, account_id, suspended, confirmed) VALUES (1, ?, ?, 1)
         ON CONFLICT (singleton) DO UPDATE
         SET account_id = excluded.account_id, confirmed = 1,
             suspended = MAX(suspended, excluded.suspended)`,
        accountId,
        suspended ? 1 : 0
      )
    })
    if (suspended) this.#closeLiveSockets(BUDDIES_LIVE_CLOSE.suspended)
  }

  /**
   * The accounts admin suspended or reinstated this inbox's account. Owner ops
   * other than leaving answer `suspended` until it's reinstated, and live
   * sockets close. The admin found this inbox among the account's in the
   * accounts database, so the link is confirmed too. An inbox that isn't
   * registered keeps nothing: the Worker checks the accounts database before
   * it registers again.
   */
  async setAccountStatus(accountId: string, suspended: boolean): Promise<void> {
    if (!this.#ready() || !this.#meta()) return
    this.ctx.storage.transactionSync(() => {
      this.#ensureOwnerAccount()
      this.#sql.exec(
        `INSERT INTO owner_account (singleton, account_id, suspended, confirmed) VALUES (1, ?, ?, 1)
         ON CONFLICT (singleton) DO UPDATE
         SET account_id = excluded.account_id, suspended = excluded.suspended,
             confirmed = 1`,
        accountId,
        suspended ? 1 : 0
      )
    })
    if (suspended) this.#closeLiveSockets(BUDDIES_LIVE_CLOSE.suspended)
  }

  /**
   * Retention: events at 30 days, blobs at their `expiresAt`, the weekly
   * blob sweep, invite bookkeeping, and the 180-day wipe. Also closes
   * browser sockets whose token expired (their expiries are deadlines too).
   */
  async alarm(): Promise<void> {
    const now = Date.now()
    closeExpiredSockets(this.#liveSockets(), expiryOf, now)
    if (!this.#ready()) return
    const idle = this.#idleOwnerPub(now)
    if (idle) {
      const tombstone = await ownerKeyHash(idle)
      // Hashing let other requests in: wipe only if still idle.
      if (this.#idleOwnerPub(now) === idle) {
        await this.#wipe(now, tombstone)
        return
      }
      if (!this.#ready()) return
    }
    this.ctx.storage.transactionSync(() => this.#prune(now))
    // A socket's expiry can wake the alarm before R2's retry backoff is up.
    const backoff = this.#blobDeleteBackoff()
    if (!backoff || backoff.retryAt <= now) await this.#flushBlobDeletes()
    await this.#sweepBlobs(now)
    await this.#retryInviteDeletes(now)
    if (
      !this.#meta() &&
      !this.#count('SELECT COUNT(*) AS n FROM pending_invite_delete') &&
      !this.#count('SELECT COUNT(*) AS n FROM pending_blob_delete')
    ) {
      await this.#deleteAllButTombstone(this.#tombstone())
      return
    }
    await this.#ensureAlarm(now)
  }

  // --- Authentication -----------------------------------------------------

  #key(call: KeyedCall, ref: KeyRef): BuddiesResult<string> {
    const meta = this.#meta()
    if (!meta || meta.inboxId !== call.inboxId) return fail('not_found')
    if (ref === 'owner') return ok(meta.ownerPub)
    const writerPub = call.slotId ? this.#writerPub(call.slotId) : null
    return writerPub ? ok(writerPub) : fail('gone')
  }

  /**
   * Verifies the signature (or, for an account call, that the inbox is
   * linked to that account), then checks the signer's budget of requests
   * that take effect (`#commit` spends it). Both are about the authenticated
   * signer, so nobody else can use up an inbox's budget. An owner's budget is
   * shared by both ways of authenticating.
   *
   * `linkedOnly` (a signed call admitted after the legacy switch went off):
   * once the signature holds, an inbox without a confirmed account link is
   * `upgrade_required`. Nothing un-confirms a link (a wipe drops the inbox
   * too), so the check holds through `#commit`.
   */
  async #authenticate(
    op: BuddiesSigningOp,
    call: AuthCall,
    ref: KeyRef,
    { linkedOnly = false }: { linkedOnly?: boolean } = {}
  ): Promise<BuddiesResult<string>> {
    const key = this.#key(call, ref)
    if (!key.ok) return key
    if (isAccountCall(call)) {
      const refused = this.#refuseAccount(call.accountId)
      if (refused) return refused
    } else {
      const valid = await verifyBuddiesSignature(
        key.value,
        op,
        call.payloadBytes,
        call.signature
      )
      if (!valid) return fail('bad_signature')
      if (linkedOnly && this.#confirmedAccountId() == null)
        return fail('upgrade_required')
    }
    if (ref === 'owner' && !SUSPENDED_ALLOWED_OPS.has(op) && this.#suspended())
      return fail('suspended')
    // The first seal of an open slot skips the budget: whoever else holds
    // the writer key can spend it, and must not keep the slot open that way.
    // A re-seal counts, so its nonces stay bounded.
    if (op === 'slot/seal' && call.slotId && !this.#sealed(call.slotId))
      return key
    const [budget, limit] =
      ref === 'owner'
        ? [ABUSE.ownerRequests, 'ownerRequests']
        : [ABUSE.writerRequests, 'writerRequests']
    const now = Date.now()
    const signer = signerOf(call, ref)
    if (!this.#signers.allows(signer, budget, now)) {
      logLimitHit(op, limit)
      return fail(
        'rate_limited',
        retryAfterSeconds(this.#signers.waitMs(signer, now))
      )
    }
    return key
  }

  /**
   * After the signature check: the verifying key must be unchanged, `ts`
   * fresh, and the nonce unseen (an account call: the inbox still linked to
   * its account), then `work` runs in the same transaction. Owner ops also
   * count as owner activity for the 180-day retention unless `activity` is
   * false (the live socket).
   *
   * Only a request that took effect keeps its nonce (and spends its signer's
   * budget), so refused ones (caps, rate limits, conflicts) add no rows.
   * Replay protection is unchanged: the check and the record share this
   * synchronous transaction, so each signed request still takes effect at
   * most once, and only within ±5 minutes. Account calls carry no nonce and
   * record none.
   *
   * A writer op from a sealed slot is `sealed` unless `whileSealed` (only
   * `slot/leave` and `slot/seal`), so a writer op added later is refused by
   * default. Checked here, in the transaction the write runs in, after the
   * signature check's await: a write racing `slot/seal` either commits
   * before it or sees the seal.
   */
  #commit<T>(
    call: AuthCall,
    ref: KeyRef,
    verifiedKey: string,
    work: (now: number) => BuddiesResult<T>,
    {
      activity = ref === 'owner',
      whileSealed = false,
    }: { activity?: boolean; whileSealed?: boolean } = {}
  ): BuddiesResult<T> {
    const now = Date.now()
    return this.ctx.storage.transactionSync((): BuddiesResult<T> => {
      const key = this.#key(call, ref)
      if (!key.ok) return key
      if (key.value !== verifiedKey) return fail('bad_signature')
      const denied = isAccountCall(call)
        ? this.#refuseAccount(call.accountId)?.error
        : this.#admit(call, now)
      if (denied) return fail(denied)
      if (
        ref === 'writer' &&
        !whileSealed &&
        call.slotId &&
        this.#sealed(call.slotId)
      )
        return fail('sealed')
      if (activity) this.#touch(now)
      const result = work(now)
      if (result.ok) {
        if (!isAccountCall(call)) this.#recordNonce(call, now)
        this.#signers.spend(signerOf(call, ref), now)
      }
      return result
    })
  }

  /**
   * Whether an account call may act for this inbox: only the account it's
   * confirmed to be linked to. An inbox registered before accounts, or whose
   * link the accounts database hasn't confirmed, has none to compare
   * (`not_linked`); the app links it with `inbox/register` and retries.
   */
  #refuseAccount(accountId: string): BuddiesFailure | null {
    const linked = this.#confirmedAccountId()
    if (linked == null) return fail('not_linked')
    return linked === accountId ? null : fail('forbidden')
  }

  #admit(call: SignedFields, now: number): BuddiesErrorCode | null {
    if (this.#isStale(call, now)) return 'stale'
    return this.#nonceSeen(call, now) ? 'replay' : null
  }

  #isStale(call: SignedFields, now: number): boolean {
    return Math.abs(now - call.ts) > LIMITS.timestampSkewMs
  }

  /**
   * Records the nonce unless it was seen in the last 10 minutes. With ts
   * limited to ±5 minutes, a request can't outlive its nonce record.
   */
  #claimNonce(call: SignedFields, now: number): boolean {
    if (this.#nonceSeen(call, now)) return false
    this.#recordNonce(call, now)
    return true
  }

  /** Whether the nonce was seen in the last 10 minutes (expired ones go). */
  #nonceSeen(call: SignedFields, now: number): boolean {
    this.#sql.exec(
      'DELETE FROM nonce WHERE seen_at < ?',
      now - LIMITS.nonceRetentionMs
    )
    return (
      this.#count(
        'SELECT COUNT(*) AS n FROM nonce WHERE nonce = ?',
        call.nonce
      ) > 0
    )
  }

  #recordNonce(call: SignedFields, now: number): void {
    this.#sql.exec(
      'INSERT INTO nonce (nonce, seen_at) VALUES (?, ?)',
      call.nonce,
      now
    )
  }

  #touch(now: number): void {
    this.#sql.exec(
      'UPDATE meta SET last_active_at = ? WHERE singleton = 1',
      now
    )
  }

  // --- State helpers --------------------------------------------------------

  get #sql(): SqlStorage {
    return this.ctx.storage.sql
  }

  #ready(): boolean {
    if (this.#schemaReady) return true
    const exists = this.#hasTable('meta')
    // Existing inboxes pick up any tables added since they were created.
    if (exists) {
      const backfill = !this.#hasTable('slot_usage')
      this.#ensureSchema()
      if (backfill) this.#backfillUsage()
      if (!this.#hasColumn('push_device', 'app_alerts')) {
        this.#sql.exec(
          'ALTER TABLE push_device ADD COLUMN app_alerts INTEGER NOT NULL DEFAULT 0'
        )
      }
      if (!this.#hasColumn('slot', 'sealed')) {
        this.#sql.exec(
          'ALTER TABLE slot ADD COLUMN sealed INTEGER NOT NULL DEFAULT 0'
        )
      }
      if (this.#hasTable('device')) this.#migrateDevices()
      if (this.#hasTable('owner_account')) this.#ensureOwnerAccount()
    }
    return exists
  }

  /**
   * `owner_account`, with `confirmed` added in place to a table from before
   * it (as 0: those links were never checked against the accounts database).
   */
  #ensureOwnerAccount(): void {
    this.#sql.exec(OWNER_ACCOUNT_SCHEMA)
    if (!this.#hasColumn('owner_account', 'confirmed')) {
      this.#sql.exec(
        'ALTER TABLE owner_account ADD COLUMN confirmed INTEGER NOT NULL DEFAULT 0'
      )
    }
  }

  /**
   * Inboxes from before FCM kept APNs devices in `device`; they move to
   * `push_device` once, in the same synchronous turn, so atomically.
   */
  #migrateDevices(): void {
    this.#sql.exec(
      `INSERT OR IGNORE INTO push_device (device_id, service, token, apns_environment, apns_topic, templates, created_at, updated_at)
       SELECT device_id, 'apns', apns_token, apns_environment, NULL, templates, created_at, updated_at
       FROM device`
    )
    this.#sql.exec('DROP TABLE device')
  }

  #hasColumn(table: string, column: string): boolean {
    return this.#sql
      .exec<{ name: string }>(`PRAGMA table_info(${table})`)
      .toArray()
      .some((row) => row.name === column)
  }

  #hasTable(name: string): boolean {
    return (
      this.#sql
        .exec(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
          name
        )
        .toArray().length > 0
    )
  }

  #ensureSchema(): void {
    for (const statement of SCHEMA) this.#sql.exec(statement)
    this.#schemaReady = true
  }

  #meta(): MetaRow | null {
    if (!this.#ready()) return null
    return (
      this.#sql
        .exec<MetaRow>(
          `SELECT inbox_id AS inboxId, owner_pub AS ownerPub, seq, last_active_at AS lastActiveAt
           FROM meta WHERE singleton = 1`
        )
        .toArray()[0] ?? null
    )
  }

  /** The owner key of an inbox past the inactivity limit, else null. */
  #idleOwnerPub(now: number): string | null {
    const meta = this.#meta()
    return meta && now - meta.lastActiveAt >= LIMITS.inboxInactivityMs
      ? meta.ownerPub
      : null
  }

  /** The account this inbox is confirmed to be linked to, or null. */
  #confirmedAccountId(): string | null {
    if (!this.#hasTable('owner_account')) return null
    return (
      this.#sql
        .exec<{
          accountId: string
        }>(
          'SELECT account_id AS accountId FROM owner_account WHERE singleton = 1 AND confirmed = 1'
        )
        .toArray()[0]?.accountId ?? null
    )
  }

  /** Whether this inbox's account is suspended. */
  #suspended(): boolean {
    if (!this.#hasTable('owner_account')) return false
    return (
      this.#sql
        .exec<{
          suspended: number
        }>('SELECT suspended FROM owner_account WHERE singleton = 1')
        .toArray()[0]?.suspended === 1
    )
  }

  /** The wiped owner's key hash; null if this inbox was never wiped. */
  #tombstone(): string | null {
    if (!this.#hasTable('owner_tombstone')) return null
    return (
      this.#sql
        .exec<{
          hash: string
        }>(
          'SELECT owner_key_hash AS hash FROM owner_tombstone WHERE singleton = 1'
        )
        .toArray()[0]?.hash ?? null
    )
  }

  #count(query: string, ...bindings: (string | number)[]): number {
    return this.#sql.exec<{ n: number }>(query, ...bindings).one().n
  }

  #writerPub(slotId: string): string | null {
    return (
      this.#sql
        .exec<{
          writerPub: string
        }>('SELECT writer_pub AS writerPub FROM slot WHERE slot_id = ?', slotId)
        .toArray()[0]?.writerPub ?? null
    )
  }

  /** Whether the slot's writer sealed it (`slot/seal`). */
  #sealed(slotId: string): boolean {
    return (
      this.#count(
        'SELECT COUNT(*) AS n FROM slot WHERE slot_id = ? AND sealed = 1',
        slotId
      ) > 0
    )
  }

  #slotCount(): number {
    return this.#count('SELECT COUNT(*) AS n FROM slot')
  }

  /** Unclaimed, unexpired invites. A claimed invite stops counting: its confirm runs slot/add. */
  #openInvites(now: number): number {
    return this.#count(
      "SELECT COUNT(*) AS n FROM invite WHERE status = 'open' AND expires_at > ?",
      now
    )
  }

  #nextSeq(): number {
    this.#sql.exec('UPDATE meta SET seq = seq + 1 WHERE singleton = 1')
    return this.#sql
      .exec<{ seq: number }>('SELECT seq FROM meta WHERE singleton = 1')
      .one().seq
  }

  #eventSeq(eventId: string): number | null {
    return (
      this.#sql
        .exec<{
          seq: number
        }>('SELECT seq FROM event WHERE event_id = ?', eventId)
        .toArray()[0]?.seq ?? null
    )
  }

  #blobRow(blobId: string): BlobRow | null {
    return (
      this.#sql
        .exec<BlobRow>(
          `SELECT bytes, token_hash AS tokenHash, expires_at AS expiresAt, written_at AS writtenAt
           FROM blob WHERE blob_id = ?`,
          blobId
        )
        .toArray()[0] ?? null
    )
  }

  /**
   * Which per-inbox blob cap one more blob of `bytes` would pass, counting
   * live (unexpired) blobs, and how long until the soonest of them expires
   * and frees room. Null when it fits.
   */
  #blobCapHit(
    bytes: number,
    now: number
  ): { limit: 'inboxBlobs' | 'inboxBlobBytes'; waitMs: number } | null {
    const { live, total, soonest } = this.#sql
      .exec<{ live: number; total: number; soonest: number | null }>(
        `SELECT COUNT(*) AS live, COALESCE(SUM(bytes), 0) AS total, MIN(expires_at) AS soonest
         FROM blob WHERE expires_at > ?`,
        now
      )
      .one()
    const limit =
      live >= ABUSE.inboxBlobs
        ? 'inboxBlobs'
        : total + bytes > ABUSE.inboxBlobBytes
          ? 'inboxBlobBytes'
          : null
    return limit ? { limit, waitMs: (soonest ?? now) - now } : null
  }

  /**
   * Rolling day of object writes per inbox. A refusal says when the oldest
   * write in the window ages out.
   */
  #recordUpload(id: string, now: number): BuddiesFailure | null {
    this.#sql.exec(
      'DELETE FROM blob_upload WHERE at <= ?',
      now - ABUSE.blobUploadWindowMs
    )
    const { uploads, oldest } = this.#sql
      .exec<{
        uploads: number
        oldest: number | null
      }>('SELECT COUNT(*) AS uploads, MIN(at) AS oldest FROM blob_upload')
      .one()
    if (uploads >= ABUSE.blobUploads) {
      logLimitHit('blob/put', 'blobUploads')
      return fail(
        'rate_limited',
        retryAfterSeconds((oldest ?? now) + ABUSE.blobUploadWindowMs - now)
      )
    }
    this.#sql.exec('INSERT INTO blob_upload (id, at) VALUES (?, ?)', id, now)
    return null
  }

  /**
   * Undoes a reservation whose object write failed. A new blob's row stays,
   * unreadable while unwritten, until `FAILED_UPLOAD_GRACE_MS`: the object
   * may have landed anyway, and the row's expiry deletes it. A retry in the
   * meantime finishes the upload.
   */
  #releaseUpload(
    blobId: string,
    uploadId: string,
    created: boolean,
    now: number
  ): void {
    if (!this.#ready()) return
    this.ctx.storage.transactionSync(() => {
      this.#sql.exec('DELETE FROM blob_upload WHERE id = ?', uploadId)
      if (created) {
        this.#sql.exec(
          `UPDATE blob SET expires_at = MIN(expires_at, ?)
           WHERE blob_id = ? AND written_at IS NULL`,
          now + FAILED_UPLOAD_GRACE_MS,
          blobId
        )
      }
    })
  }

  /**
   * Sliding one-hour window of writes per slot. A refusal says when the
   * oldest write in the window ages out.
   */
  #recordWrite(
    op: BuddiesSigningOp,
    slotId: string,
    now: number
  ): BuddiesFailure | null {
    this.#sql.exec(
      'DELETE FROM slot_write WHERE slot_id = ? AND at <= ?',
      slotId,
      now - LIMITS.writeWindowMs
    )
    const { writes, oldest } = this.#sql
      .exec<{
        writes: number
        oldest: number | null
      }>(
        'SELECT COUNT(*) AS writes, MIN(at) AS oldest FROM slot_write WHERE slot_id = ?',
        slotId
      )
      .one()
    if (writes >= LIMITS.writesPerSlot) {
      logLimitHit(op, 'writesPerSlot')
      return fail(
        'rate_limited',
        retryAfterSeconds((oldest ?? now) + LIMITS.writeWindowMs - now)
      )
    }
    this.#sql.exec(
      'INSERT INTO slot_write (slot_id, at) VALUES (?, ?)',
      slotId,
      now
    )
    return null
  }

  /**
   * When a full slot or inbox gets room back: its oldest stored writer event
   * reaching the 30-day retention. Long, but true; the sender keeps the event.
   */
  #eventCapWait(cap: string, slotId: string, now: number): number {
    const { oldest } =
      cap === 'inboxEventBytes'
        ? this.#sql
            .exec<{
              oldest: number | null
            }>(
              'SELECT MIN(created_at) AS oldest FROM event WHERE slot_id <> ?',
              RELAY_SLOT_ID
            )
            .one()
        : this.#sql
            .exec<{
              oldest: number | null
            }>(
              'SELECT MIN(created_at) AS oldest FROM event WHERE slot_id = ?',
              slotId
            )
            .one()
    return retryAfterSeconds((oldest ?? now) + LIMITS.eventRetentionMs - now)
  }

  /**
   * Which stored-event cap one more event of `bytes` from `slotId` would pass:
   * per slot by count and bytes, or per inbox by bytes. Null when it fits.
   *
   * A full slot refuses new events (`rate_limited`) rather than dropping old
   * ones, so nothing a buddy already delivered vanishes before the owner syncs
   * it. The sender keeps an unsent event and retries on its next publish, and
   * room comes back as stored events reach their 30-day retention.
   */
  #eventCapHit(slotId: string, bytes: number): string | null {
    const slot = this.#sql
      .exec<{
        events: number
        bytes: number
      }>('SELECT events, bytes FROM slot_usage WHERE slot_id = ?', slotId)
      .toArray()[0] ?? { events: 0, bytes: 0 }
    if (slot.events >= ABUSE.slotEvents) return 'slotEvents'
    if (slot.bytes + bytes > ABUSE.slotEventBytes) return 'slotEventBytes'
    const { total } = this.#sql
      .exec<{
        total: number
      }>('SELECT COALESCE(SUM(bytes), 0) AS total FROM slot_usage')
      .one()
    if (total + bytes > ABUSE.inboxEventBytes) return 'inboxEventBytes'
    return null
  }

  /** Counts the writer events an inbox stored before `slot_usage` existed. */
  #backfillUsage(): void {
    this.#sql.exec(
      `INSERT OR REPLACE INTO slot_usage (slot_id, events, bytes)
       SELECT slot_id, COUNT(*), COALESCE(SUM(LENGTH(blob)), 0)
       FROM event WHERE slot_id <> ? GROUP BY slot_id`,
      RELAY_SLOT_ID
    )
  }

  /**
   * Push budget per slot: 10 per 24 h, at least 60 s apart, except that
   * immediate kinds (`isImmediatePushKind`) skip the spacing. Over budget, the
   * event is still stored; it just doesn't alert.
   */
  #reservePush(
    inboxId: string,
    slotId: string,
    kind: string,
    { seq, ...event }: PushJob['event'] & { seq: number },
    now: number
  ): PushJob | null {
    const targets = this.#pushTargets(kind)
    if (!targets.length) return null
    this.#sql.exec(
      'DELETE FROM slot_push WHERE slot_id = ? AND at <= ?',
      slotId,
      now - LIMITS.pushWindowMs
    )
    const { pushes, last } = this.#sql
      .exec<{
        pushes: number
        last: number | null
      }>(
        'SELECT COUNT(*) AS pushes, MAX(at) AS last FROM slot_push WHERE slot_id = ?',
        slotId
      )
      .one()
    if (pushes >= LIMITS.pushesPerSlot) return null
    if (
      last != null &&
      now - last < LIMITS.pushSpacingMs &&
      !isImmediatePushKind(kind)
    ) {
      return null
    }
    this.#sql.exec(
      'INSERT INTO slot_push (slot_id, at) VALUES (?, ?)',
      slotId,
      now
    )
    return { inboxId, kind, seq, event, targets }
  }

  /** The claim's event id is the invite's id. */
  #claimPush(
    inboxId: string,
    claim: { inviteId: string; blob: string },
    seq: number
  ): PushJob | null {
    const targets = this.#pushTargets(INVITE_CLAIMED_KIND)
    return targets.length
      ? {
          inboxId,
          kind: INVITE_CLAIMED_KIND,
          seq,
          event: { eventId: claim.inviteId, blob: claim.blob },
          targets,
        }
      : null
  }

  /** Devices that registered a localized template for `kind`. */
  #pushTargets(kind: string): PushTarget[] {
    const rows = this.#sql
      .exec<DeviceRow>(
        `SELECT device_id AS deviceId, service, token,
                apns_environment AS apnsEnvironment, apns_topic AS apnsTopic,
                app_alerts AS appAlerts, templates
         FROM push_device ORDER BY created_at, device_id`
      )
      .toArray()
    const targets: PushTarget[] = []
    for (const row of rows) {
      let templates: unknown
      try {
        templates = JSON.parse(row.templates)
      } catch {
        continue
      }
      if (!isPlainObject(templates) || !Object.hasOwn(templates, kind)) continue
      const template = templates[kind]
      if (!isPlainObject(template)) continue
      const { title, body } = template
      if (typeof title !== 'string' || typeof body !== 'string') continue
      const address = pushAddressOf(row)
      if (!address) continue
      targets.push({ ...address, deviceId: row.deviceId, title, body })
    }
    return targets
  }

  /**
   * Deletes the slot and everything it wrote. True when that changed what
   * `inbox/sync` returns: the slot existed, or a left sealed slot's events
   * were still kept.
   */
  #deleteSlot(slotId: string): boolean {
    const existed =
      this.#writerPub(slotId) != null ||
      this.#count('SELECT COUNT(*) AS n FROM event WHERE slot_id = ?', slotId) > 0
    this.#sql.exec('DELETE FROM slot WHERE slot_id = ?', slotId)
    this.#sql.exec('DELETE FROM card WHERE slot_id = ?', slotId)
    this.#sql.exec('DELETE FROM event WHERE slot_id = ?', slotId)
    this.#sql.exec('DELETE FROM slot_usage WHERE slot_id = ?', slotId)
    this.#sql.exec('DELETE FROM slot_write WHERE slot_id = ?', slotId)
    this.#sql.exec('DELETE FROM slot_push WHERE slot_id = ?', slotId)
    return existed
  }

  /**
   * `slot/leave` of a sealed slot: the slot goes (no more writes, `gone`),
   * and so do its card and write bookkeeping, but its events stay readable by
   * the owner until they expire (`#prune`) or the owner removes the slot id.
   * Whoever holds a sealed slot's writer key after a key change can't delete
   * the reconnect invite in it by leaving first. Its `slot_usage` row stays
   * with the events, so the caps still count them.
   */
  #departSealedSlot(slotId: string): boolean {
    this.#sql.exec('DELETE FROM slot WHERE slot_id = ?', slotId)
    this.#sql.exec('DELETE FROM card WHERE slot_id = ?', slotId)
    this.#sql.exec('DELETE FROM slot_write WHERE slot_id = ?', slotId)
    this.#sql.exec('DELETE FROM slot_push WHERE slot_id = ?', slotId)
    return true
  }

  // --- Live-socket helpers -------------------------------------------------

  #liveSockets(): WebSocket[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws.readyState === SOCKET_OPEN)
  }

  #signal(ws: WebSocket, message: LiveMessage): void {
    try {
      ws.send(JSON.stringify(message))
    } catch {
      // A socket mid-close; its close handler cleans up.
    }
  }

  /**
   * Tells every live socket that `inbox/sync` would now return something new.
   * Called only after the write committed, and never fails it. `seq` is the
   * inbox head; slot changes alone don't advance it.
   */
  #broadcastChanged(): void {
    try {
      const sockets = this.#liveSockets()
      if (!sockets.length) return
      const message: LiveMessage = {
        type: 'changed',
        seq: this.#meta()?.seq ?? 0,
      }
      for (const ws of sockets) this.#signal(ws, message)
    } catch {
      // The write already committed; a socket problem must not surface.
    }
  }

  #closeLiveSockets(close: { code: number; reason: string }): void {
    for (const ws of this.#liveSockets())
      closeQuietly(ws, close.code, close.reason)
  }

  /**
   * Items with `seq > since`. `slots` is always the full list. Events stop at a
   * size budget, in which case `seq` is the cursor reached rather than the head.
   */
  #snapshot(since: number, now: number): SyncResponse {
    const head = this.#meta()?.seq ?? 0
    const slots = this.#sql
      .exec<{ slotId: string; createdAt: number; sealed: number }>(
        'SELECT slot_id AS slotId, created_at AS createdAt, sealed FROM slot ORDER BY created_at, slot_id'
      )
      .toArray()
      .map(({ sealed, ...slot }): SyncSlot =>
        sealed ? { ...slot, sealed: true } : slot
      )

    // Read in whole chunks (`readSeqPage`): a page cut short must not leave
    // its cursor open.
    let chars = 0
    const page = readSeqPage(
      (after, count) =>
        this.#sql
          .exec<SyncEvent>(
            `SELECT event_id AS eventId, slot_id AS slotId, kind, blob, seq, created_at AS createdAt
             FROM event WHERE seq > ? AND created_at > ? ORDER BY seq LIMIT ?`,
            after,
            now - LIMITS.eventRetentionMs,
            count
          )
          .toArray(),
      since,
      (event, taken) => {
        if (
          taken.length &&
          (chars + event.blob.length > LIMITS.syncEventChars ||
            taken.length >= ABUSE.syncEvents)
        )
          return false
        chars += event.blob.length
        return true
      }
    )
    const events = page.rows
    const cursor = page.more ? events[events.length - 1].seq : head

    const cards = this.#sql
      .exec<SyncCard>(
        `SELECT slot_id AS slotId, blob, seq, updated_at AS updatedAt
         FROM card WHERE seq > ? AND seq <= ? ORDER BY seq`,
        since,
        cursor
      )
      .toArray()
    const roster =
      this.#sql
        .exec<{
          blob: string
          seq: number
        }>(
          'SELECT blob, seq FROM roster WHERE singleton = 1 AND seq > ? AND seq <= ?',
          since,
          cursor
        )
        .toArray()[0] ?? null

    return { seq: cursor, slots, cards, events, roster }
  }

  #invite(inviteId: string) {
    return this.env.BUDDY_INVITE.get(this.env.BUDDY_INVITE.idFromName(inviteId))
  }

  #releaseInvite(inviteId: string, creationId: string): void {
    if (!this.#ready()) return
    this.ctx.storage.transactionSync(() => {
      this.#sql.exec('DELETE FROM invite WHERE invite_id = ?', inviteId)
      this.#sql.exec('DELETE FROM invite_creation WHERE id = ?', creationId)
    })
  }

  // --- Retention ------------------------------------------------------------

  #prune(now: number): void {
    const expiry = now - LIMITS.eventRetentionMs
    const expiring = this.#sql
      .exec<{ slotId: string; events: number; bytes: number }>(
        `SELECT slot_id AS slotId, COUNT(*) AS events,
                COALESCE(SUM(LENGTH(blob)), 0) AS bytes
         FROM event WHERE created_at <= ? GROUP BY slot_id`,
        expiry
      )
      .toArray()
    for (const { slotId, events, bytes } of expiring) {
      this.#sql.exec(
        `UPDATE slot_usage SET events = MAX(0, events - ?), bytes = MAX(0, bytes - ?)
         WHERE slot_id = ?`,
        events,
        bytes,
        slotId
      )
    }
    this.#sql.exec('DELETE FROM event WHERE created_at <= ?', expiry)
    // A left sealed slot's usage row goes with its last event.
    this.#sql.exec(
      'DELETE FROM slot_usage WHERE events = 0 AND slot_id NOT IN (SELECT slot_id FROM slot)'
    )
    this.#sql.exec(
      'DELETE FROM invite WHERE expires_at <= ?',
      now - LIMITS.inviteGraceMs
    )
    this.#sql.exec(
      'DELETE FROM invite_creation WHERE created_at <= ?',
      now - LIMITS.inviteCreationWindowMs
    )
    this.#sql.exec(
      'DELETE FROM slot_write WHERE at <= ?',
      now - LIMITS.writeWindowMs
    )
    this.#sql.exec(
      'DELETE FROM slot_push WHERE at <= ?',
      now - LIMITS.pushWindowMs
    )
    this.#sql.exec(
      'DELETE FROM nonce WHERE seen_at < ?',
      now - LIMITS.nonceRetentionMs
    )
    // Expired blobs stop being readable at once; their objects go next.
    const inboxId = this.#meta()?.inboxId
    if (inboxId) {
      for (const { blobId } of this.#sql
        .exec<{
          blobId: string
        }>('SELECT blob_id AS blobId FROM blob WHERE expires_at <= ?', now)
        .toArray()) {
        this.#sql.exec(
          'INSERT OR IGNORE INTO pending_blob_delete (object_key) VALUES (?)',
          buddyBlobKey(inboxId, blobId)
        )
      }
    }
    this.#sql.exec('DELETE FROM blob WHERE expires_at <= ?', now)
    this.#sql.exec(
      'DELETE FROM blob_upload WHERE at <= ?',
      now - ABUSE.blobUploadWindowMs
    )
  }

  #nextDeadline(now: number): number | null {
    if (!this.#ready()) return null
    const deadlines: number[] = []
    const meta = this.#meta()
    if (meta) deadlines.push(meta.lastActiveAt + LIMITS.inboxInactivityMs)
    const { oldestEvent } = this.#sql
      .exec<{
        oldestEvent: number | null
      }>('SELECT MIN(created_at) AS oldestEvent FROM event')
      .one()
    if (oldestEvent != null)
      deadlines.push(oldestEvent + LIMITS.eventRetentionMs)
    const { nextInvite } = this.#sql
      .exec<{
        nextInvite: number | null
      }>('SELECT MIN(expires_at) AS nextInvite FROM invite')
      .one()
    if (nextInvite != null) deadlines.push(nextInvite + LIMITS.inviteGraceMs)
    if (this.#count('SELECT COUNT(*) AS n FROM pending_invite_delete')) {
      deadlines.push(now + INVITE_DELETE_RETRY_MS)
    }
    const { nextBlob } = this.#sql
      .exec<{
        nextBlob: number | null
      }>('SELECT MIN(expires_at) AS nextBlob FROM blob')
      .one()
    if (nextBlob != null) deadlines.push(nextBlob)
    if (this.#count('SELECT COUNT(*) AS n FROM pending_blob_delete')) {
      deadlines.push(
        this.#blobDeleteBackoff()?.retryAt ?? now + BLOB_DELETE_RETRY_MS
      )
    }
    const sweep = this.#blobSweepDue()
    if (sweep != null) deadlines.push(sweep)
    const expiry = soonestSocketExpiry(this.#liveSockets(), expiryOf)
    if (expiry != null) deadlines.push(expiry)
    return deadlines.length ? Math.min(...deadlines) : null
  }

  /** Moves the alarm earlier when a new deadline needs it; a late alarm just reschedules. */
  async #ensureAlarm(now: number): Promise<void> {
    const deadline = this.#nextDeadline(now)
    if (deadline == null) return
    const current = await this.ctx.storage.getAlarm()
    if (current == null || current > deadline)
      await this.ctx.storage.setAlarm(deadline)
  }

  /**
   * Deletes everything (slots, cards, events, devices, roster, photo blobs)
   * and every invite this inbox created, keeping only `tombstone` (the
   * owner's key hash). Local state goes first so concurrent ops see a missing
   * inbox; invite and R2 deletions that fail are retried from the alarm.
   */
  async #wipe(now: number, tombstone: string): Promise<void> {
    const invites: PendingInviteDelete[] = []
    const objects: string[] = []
    if (this.#ready()) {
      const meta = this.#meta()
      if (meta) {
        for (const row of this.#sql
          .exec<{
            inviteId: string
            expiresAt: number
          }>(
            'SELECT invite_id AS inviteId, expires_at AS expiresAt FROM invite'
          )
          .toArray()) {
          invites.push({ ...row, creatorInboxId: meta.inboxId })
        }
        for (const { blobId } of this.#sql
          .exec<{ blobId: string }>('SELECT blob_id AS blobId FROM blob')
          .toArray()) {
          objects.push(buddyBlobKey(meta.inboxId, blobId))
        }
      }
      invites.push(...this.#pendingInviteDeletes())
      objects.push(...this.#pendingBlobDeletes())
    }
    const inboxId = this.#ready() ? this.#meta()?.inboxId : undefined
    await this.#deleteAllButTombstone(tombstone)
    // Before compatibility date 2026-02-24, deleteAll() keeps the alarm.
    await this.ctx.storage.deleteAlarm()
    this.#closeLiveSockets(BUDDIES_LIVE_CLOSE.gone)
    const unique = new Map(invites.map((invite) => [invite.inviteId, invite]))
    await this.#deleteInvites([...unique.values()], now)
    // Everything under the inbox's prefix goes too, rows or not.
    const bucket = this.env.BUDDY_BLOBS
    if (inboxId && bucket) {
      try {
        objects.push(...(await this.#listObjects(bucket, inboxId)))
      } catch {
        console.warn('buddies: listing blobs for a wipe failed')
      }
    }
    await this.#deleteObjects([...new Set(objects)], now)
  }

  /** Keys under `inboxId`'s R2 prefix, uploaded before `before` if given. */
  async #listObjects(
    bucket: R2Bucket,
    inboxId: string,
    before = Number.POSITIVE_INFINITY
  ): Promise<string[]> {
    const prefix = buddyBlobKey(inboxId, '')
    const keys: string[] = []
    let cursor: string | undefined
    do {
      const page = await bucket.list({ prefix, cursor, limit: 1_000 })
      for (const object of page.objects) {
        if (object.uploaded.getTime() < before) keys.push(object.key)
      }
      cursor = page.truncated ? page.cursor : undefined
    } while (cursor)
    return keys
  }

  #blobSweepDue(): number | null {
    return (
      this.#sql
        .exec<{ dueAt: number }>('SELECT due_at AS dueAt FROM blob_sweep')
        .toArray()[0]?.dueAt ?? null
    )
  }

  /**
   * Deletes objects under this inbox's prefix that no row knows: a put whose
   * object landed after it reported failure, or a cleanup that lost track.
   * Objects newer than `BLOB_SWEEP_MIN_AGE_MS` are left alone, in case their
   * upload is in flight. Weekly while the inbox stores photos, and once more
   * after it stops; the R2 lifecycle rule is the last resort.
   */
  async #sweepBlobs(now: number): Promise<void> {
    const bucket = this.env.BUDDY_BLOBS
    const due = this.#blobSweepDue()
    const inboxId = this.#meta()?.inboxId
    if (due == null || due > now || !inboxId || !bucket) return
    let found: string[] | null = null
    try {
      found = await this.#listObjects(
        bucket,
        inboxId,
        now - BLOB_SWEEP_MIN_AGE_MS
      )
    } catch {
      console.warn('buddies: blob sweep failed; retrying next week')
    }
    // A wipe meanwhile took the rows and the sweep with it.
    if (!this.#ready() || !this.#meta()) return
    const prefix = buddyBlobKey(inboxId, '')
    let orphans = 0
    this.ctx.storage.transactionSync(() => {
      for (const key of found ?? []) {
        if (this.#blobRow(key.slice(prefix.length))) continue
        this.#sql.exec(
          'INSERT OR IGNORE INTO pending_blob_delete (object_key) VALUES (?)',
          key
        )
        orphans++
      }
      const stores = this.#count('SELECT COUNT(*) AS n FROM blob')
      if (found == null || orphans || stores) {
        this.#sql.exec(
          'UPDATE blob_sweep SET due_at = ?',
          now + BLOB_SWEEP_INTERVAL_MS
        )
      } else {
        this.#sql.exec('DELETE FROM blob_sweep')
      }
    })
    if (orphans) {
      console.warn('buddies: blob sweep found objects without a row', {
        orphans,
      })
      await this.#flushBlobDeletes()
    }
  }

  #blobDeleteBackoff(): { failures: number; retryAt: number } | null {
    return (
      this.#sql
        .exec<{
          failures: number
          retryAt: number
        }>('SELECT failures, retry_at AS retryAt FROM blob_delete_backoff')
        .toArray()[0] ?? null
    )
  }

  /** Waits twice as long after each R2 deletion failure in a row. */
  #noteBlobDeleteFailure(now: number): void {
    const failures = (this.#blobDeleteBackoff()?.failures ?? 0) + 1
    const wait = Math.min(
      BLOB_DELETE_RETRY_MS * 2 ** (failures - 1),
      BLOB_DELETE_RETRY_MAX_MS
    )
    this.#sql.exec(
      `INSERT OR REPLACE INTO blob_delete_backoff (singleton, failures, retry_at)
       VALUES (1, ?, ?)`,
      failures,
      now + wait
    )
  }

  #pendingBlobDeletes(): string[] {
    return this.#sql
      .exec<{
        key: string
      }>(
        'SELECT object_key AS key FROM pending_blob_delete ORDER BY object_key'
      )
      .toArray()
      .map((row) => row.key)
  }

  /**
   * Deletes R2 objects in batches; returns the keys whose batch failed.
   * Without a bucket nothing could have been stored, so there is nothing to
   * delete.
   */
  async #deleteFromBucket(keys: string[]): Promise<string[]> {
    const bucket = this.env.BUDDY_BLOBS
    if (!bucket) return []
    const failed: string[] = []
    for (let i = 0; i < keys.length; i += BLOB_DELETE_BATCH) {
      const batch = keys.slice(i, i + BLOB_DELETE_BATCH)
      try {
        await bucket.delete(batch)
      } catch {
        failed.push(...batch)
      }
    }
    return failed
  }

  /** Deletes the queued objects, keeping the ones R2 refused for the alarm. */
  async #flushBlobDeletes(): Promise<void> {
    if (!this.#ready()) return
    const keys = this.#pendingBlobDeletes()
    if (!keys.length) return
    const failed = new Set(await this.#deleteFromBucket(keys))
    if (failed.size)
      console.warn('buddies: blob cleanup failed; retrying from the alarm', {
        failed: failed.size,
      })
    // A wipe meanwhile took the queue with it.
    if (!this.#ready()) return
    this.ctx.storage.transactionSync(() => {
      for (const key of keys) {
        if (failed.has(key)) continue
        this.#sql.exec(
          'DELETE FROM pending_blob_delete WHERE object_key = ?',
          key
        )
      }
      if (failed.size) this.#noteBlobDeleteFailure(Date.now())
      else this.#sql.exec('DELETE FROM blob_delete_backoff')
    })
  }

  /**
   * Deletes objects outside the queue (a wipe, or a put that lost its row),
   * queueing the ones R2 refused, like `#deleteInvites`.
   */
  async #deleteObjects(keys: string[], now: number): Promise<void> {
    if (!keys.length) return
    const failed = await this.#deleteFromBucket(keys)
    if (!failed.length) return
    this.ctx.storage.transactionSync(() => {
      this.#ensureSchema()
      for (const key of failed) {
        this.#sql.exec(
          'INSERT OR IGNORE INTO pending_blob_delete (object_key) VALUES (?)',
          key
        )
      }
      this.#noteBlobDeleteFailure(now)
    })
    console.warn('buddies: blob cleanup failed; retrying from the alarm', {
      failed: failed.length,
    })
    await this.#ensureAlarm(now)
  }

  /**
   * `deleteAll()`, then writes `tombstone` back (`deleteAllThen`). No other
   * event runs in between, so no request ever sees a wiped inbox without its
   * binding.
   */
  async #deleteAllButTombstone(tombstone: string | null): Promise<void> {
    await deleteAllThen(this.ctx, {
      restore:
        tombstone == null
          ? undefined
          : () => {
              this.#sql.exec(TOMBSTONE_SCHEMA)
              this.#sql.exec(
                'INSERT OR REPLACE INTO owner_tombstone (singleton, owner_key_hash) VALUES (1, ?)',
                tombstone
              )
            },
    })
    this.#schemaReady = false
  }

  #pendingInviteDeletes(): PendingInviteDelete[] {
    return this.#sql
      .exec<PendingInviteDelete>(
        `SELECT invite_id AS inviteId, creator_inbox_id AS creatorInboxId, expires_at AS expiresAt
         FROM pending_invite_delete`
      )
      .toArray()
  }

  async #retryInviteDeletes(now: number): Promise<void> {
    const pending = this.#pendingInviteDeletes()
    if (pending.length) await this.#deleteInvites(pending, now)
  }

  async #deleteInvites(
    invites: PendingInviteDelete[],
    now: number
  ): Promise<void> {
    if (!invites.length) return
    // Past expiry plus grace, the invite DO's own alarm has deleted it.
    const live = invites.filter(
      (invite) => invite.expiresAt + LIMITS.inviteGraceMs > now
    )
    const results = await Promise.allSettled(
      live.map((invite) =>
        this.#invite(invite.inviteId).deleteByCreator(invite.creatorInboxId)
      )
    )
    const failed = live.filter(
      (_, index) => results[index].status === 'rejected'
    )
    if (!failed.length && !this.#ready()) return

    this.ctx.storage.transactionSync(() => {
      if (failed.length) this.#ensureSchema()
      for (const invite of invites) {
        this.#sql.exec(
          'DELETE FROM pending_invite_delete WHERE invite_id = ?',
          invite.inviteId
        )
      }
      for (const invite of failed) {
        this.#sql.exec(
          `INSERT OR REPLACE INTO pending_invite_delete (invite_id, creator_inbox_id, expires_at)
           VALUES (?, ?, ?)`,
          invite.inviteId,
          invite.creatorInboxId,
          invite.expiresAt
        )
      }
    })
    if (failed.length) {
      console.warn('buddies: invite cleanup failed; retrying from the alarm')
      await this.#ensureAlarm(now)
    }
  }
}
