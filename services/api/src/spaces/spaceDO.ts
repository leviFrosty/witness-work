import { DurableObject } from 'cloudflare:workers'
import type { Environment } from '../types'
import { timingSafeEqual } from '../crypto'
import { retryAfterSeconds } from '../errors'
import { captureOperationFailure } from '../sentry'
import { decodedLength, ok } from '../buddies/contracts'
import { isWebSocketUpgrade } from '../buddies/envelope'
import { rollingWindowWaitMs, type WindowBucket } from '../buddies/limits'
import {
  SEQ_PAGE_CHUNK,
  deleteAllThen,
  readSeqPage,
} from '../durableObjectStorage'
import {
  SPACES_HEADERS,
  SPACES_LIMITS as LIMITS,
  SPACES_LIVE_CLOSE,
  classifyScopedRecord,
  decodeLiveMember,
  fail,
  goneBecause,
  logSpacesLimitHit,
  mayPutRecord,
  rekeyLinkId,
  scopeOf,
  spacesErrorResponse,
  type PutRecord,
  type RekeyLink,
  type RekeyWrap,
  type ScopedRecordClass,
  type SpaceMode,
  type SpacesErrorCode,
  type SpacesFailure,
  type SpacesLiveMessage,
  type SpacesResult,
} from './contracts'

/**
 * One SQLite Durable Object per shared space (witness-work ADR 0037;
 * `docs/shared-cars-protocol.md` there), `idFromName(spaceId)`. It holds the
 * space's sealed records (the current version of each, with the `seq` it was
 * stored at), its members (a token hash, the X25519 public key their id
 * commits to, and the current epoch's wrap each, never an account), its
 * invites (a verifier and the inviter, never the secret), the change `seq`,
 * the record and byte counts, the put limits, and the live sockets. The
 * server is blind: it never learns what the space is or who is on it.
 *
 * Every change advances `seq`: each stored record takes the next one, and
 * joins, leaves, removals, invite changes, and rekeys take one each, so a
 * socket's `hello` or `changed` past a device's cursor always means `sync`
 * has something new.
 *
 * An invite lives only as long as its inviter is on the space and the key
 * epoch it was made at: `leave` closes the open invites the member made,
 * and `member/remove` and `rekey` close them all. So a member who's gone
 * can't come back through an open invite before the key changes, and nobody
 * joins with an old key. A closed invite's id is kept until it expires, so
 * no retried `invite/create` opens it again.
 *
 * Deleting the space (the owner's `delete`, the last member's `leave`, or
 * 400 days without a `sync` or `put`) drops every table and writes a
 * tombstone in the same transaction as the decision, so later requests are
 * `gone` and the id can't be created again; `#purge` then frees the storage.
 *
 * A scoped space (a territory, witness-work ADR 0047 and
 * `docs/territories-protocol.md` there) adds roles and scopes on top: each
 * street is a scope the server sees only as an opaque id. Members carry the
 * streets they were given (`scopes`, null for the whole territory) and who
 * invited them; `holder` says which member (or pending hand-off invite)
 * holds a street; `link` holds guest links (a token's verifier, never the
 * token). Reads are filtered and writes checked per record (`#mayRead`,
 * `#mayWrite`). The owner never changes: it can't leave, and nothing passes
 * the space on, so only the owner can hand a street off and a holder never
 * can. Spaces without a mode keep every rule above, unchanged.
 *
 * Privacy: nothing here logs or reports ids, token hashes, keys, wraps,
 * verifiers, or blobs.
 */

type Empty = Record<string, never>

/** A member op's credentials, with the token already hashed by the Worker. */
export interface MemberAuth {
  spaceId: string
  memberId: string
  /** Canonical b64u of SHA-256(token). */
  tokenHash: string
}

/** `memberId` is checked against `dhPub` by the Worker (`spacesMemberId`). */
export interface CreateSpaceArgs {
  spaceId: string
  memberId: string
  dhPub: string
  tokenHash: string
  wrap: string
  /** `scoped` for a territory; null or absent keeps the original rules. */
  mode?: SpaceMode | null
}

export interface SyncSpaceArgs extends MemberAuth {
  since: number
  limit: number
}

export interface PutRecordArgs extends PutRecord {
  /** Lowercase hex SHA-256 of the decoded blob: the last tie-break. */
  blobHash: string
}

export interface PutSpaceArgs extends MemberAuth {
  records: PutRecordArgs[]
}

export interface CreateSpaceInviteArgs extends MemberAuth {
  inviteId: string
  joinVerifier: string
  expiresAt: number
  /** The epoch of the key the invitation carries; must be current. */
  epoch: number
  /** Members plus open invites the space may hold (KV `spaces:maxMembers`). */
  maxMembers: number
  /** Scoped spaces: the invitee's streets (null: the whole territory, or absent). */
  scopes?: string[] | null
  /** Scoped spaces: a hand-off of `scopes`' one street (null: absent). */
  handoff?: boolean | null
}

export interface DeleteSpaceInviteArgs extends MemberAuth {
  inviteId: string
}

/** `memberId` is checked against `dhPub` by the Worker (`spacesMemberId`). */
export interface JoinSpaceArgs {
  spaceId: string
  inviteId: string
  /** Canonical b64u of SHA-256(joinSecret), computed by the Worker. */
  joinHash: string
  /** The invitation's epoch: a fresh join's must be current. */
  epoch: number
  memberId: string
  dhPub: string
  tokenHash: string
  wrap: string
  maxMembers: number
}

export interface RemoveSpaceMemberArgs extends MemberAuth {
  removeId: string
}

export interface RekeyLinkArgs extends RekeyLink {
  /** Lowercase hex SHA-256 of the decoded blob, as a put record's. */
  blobHash: string
}

export interface RekeySpaceArgs extends MemberAuth {
  epoch: number
  wraps: RekeyWrap[]
  /** The record `k.<epoch>`, sealed under the new epoch's key. */
  link: RekeyLinkArgs
}

export interface MemberScopesArgs extends MemberAuth {
  target: string
  scopes: string[] | null
}

export interface HandoffCreateArgs extends MemberAuth {
  scopeId: string
  target: string
}

export interface HandoffEndArgs extends MemberAuth {
  scopeId: string
}

export interface LinkCreateArgs extends MemberAuth {
  linkId: string
  verifier: string
  scopes: string[]
  expiresAt: number
  epoch: number
}

export interface LinkEndArgs extends MemberAuth {
  linkId: string
}

export interface LinkExpiryArgs extends MemberAuth {
  linkId: string
  expiresAt: number
}

/** A guest op's link, with its token already hashed by the Worker. */
export interface GuestAuth {
  spaceId: string
  linkId: string
  /** Canonical b64u of SHA-256(linkToken). */
  verifier: string
}

export interface GuestSyncArgs extends GuestAuth {
  since: number
  limit: number
}

export interface GuestPutArgs extends GuestAuth {
  records: PutRecordArgs[]
}

/** `create`'s answer. */
export interface SpaceCreated {
  seq: number
  joinedAt: number
}

/** `join`'s answer. */
export interface SpaceJoined {
  seq: number
  epoch: number
  joinedAt: number
}

export interface SpaceRecordView {
  recordId: string
  epoch: number
  stamp: number
  deleted: boolean
  blob: string
  seq: number
}

export type SpaceMemberView = {
  memberId: string
  dhPub: string
  joinedAt: number
  /** Scoped spaces only: the member's streets, or null for the whole territory. */
  scopes?: string[] | null
  /** Scoped spaces only: who invited them (null for the owner). */
  invitedBy?: string | null
}

export type SpaceInviteView = {
  inviteId: string
  invitedBy: string
  expiresAt: number
  /** Scoped spaces only. */
  scopes?: string[] | null
  /** Scoped spaces only. */
  handoff?: boolean
}

/** Who holds a street: a member, or (`memberId` null) a pending hand-off invite. */
export type SpaceHolderView = {
  scopeId: string
  memberId: string | null
  inviteId: string | null
  since: number
}

export type SpaceLinkView = {
  linkId: string
  createdBy: string
  scopes: string[]
  createdAt: number
  expiresAt: number
  endedAt: number | null
}

export interface SpaceSyncView {
  /** The head, or the last record's `seq` when `more`. */
  seq: number
  epoch: number
  /** The caller's own wrap of the current epoch's key. */
  wrap: string
  ownerId: string
  members: SpaceMemberView[]
  invites: SpaceInviteView[]
  rekeyNeeded: boolean
  records: SpaceRecordView[]
  more: boolean
  /** Scoped spaces only, from here on. */
  mode?: SpaceMode
  holders?: SpaceHolderView[]
  links?: SpaceLinkView[]
}

/** `guest/sync`'s answer. */
export interface GuestSyncView {
  seq: number
  epoch: number
  /** When the link stops working. */
  expiresAt: number
  records: SpaceRecordView[]
  more: boolean
}

export interface PutResult {
  recordId: string
  stored: boolean
}

type SpaceRow = {
  spaceId: string
  ownerId: string
  /** Null for a space without a mode (cars). */
  mode: SpaceMode | null
  epoch: number
  rekeyNeeded: number
  seq: number
  recordCount: number
  /** Decoded blob bytes of every record held, deletions included. */
  blobBytes: number
  lastActiveAt: number
}

type MemberRow = {
  memberId: string
  dhPub: string
  tokenHash: string
  wrap: string
  joinedAt: number
  /** Scoped spaces: a JSON array of scope ids, or null for the whole territory. */
  scopes: string | null
  invitedBy: string | null
}

type InviteRow = {
  inviteId: string
  invitedBy: string
  joinVerifier: string
  expiresAt: number
  badJoins: number
  /** Set once the invite is used; kept until it expires, for a retried join. */
  joinedMemberId: string | null
  joinedTokenHash: string | null
  /** Scoped spaces: a JSON array of scope ids, or null for the whole territory. */
  scopes: string | null
  handoff: number
}

type HoldRow = {
  scopeId: string
  memberId: string | null
  inviteId: string | null
  since: number
}

type LinkRow = {
  linkId: string
  createdBy: string
  verifier: string
  /** A JSON array of scope ids. */
  scopes: string
  createdAt: number
  expiresAt: number
  endedAt: number | null
}

/** A member of a scoped space, as its permissions see them. */
type Caller = {
  memberId: string
  isOwner: boolean
  /** Null: the whole territory (the owner, and whole members). */
  scopes: ReadonlySet<string> | null
  invitedBy: string | null
}

/** What a scoped space's permission checks read, once per request. */
type Access = {
  ownerId: string
  holds: Map<string, HoldRow>
  /** Memos of who made each invite and link the checks asked about. */
  inviteAuthors: Map<string, string | null>
  linkCreators: Map<string, string | null>
}

const scopeList = (value: string | null): string[] | null =>
  value == null ? null : (JSON.parse(value) as string[])

const sameScopes = (a: string | null, b: string[] | null | undefined): boolean =>
  (a ?? null) === (b == null ? null : JSON.stringify(b))

type StoredRecord = {
  stamp: number
  deleted: number
  blobHash: string
  /** The decoded blob's size. */
  bytes: number
}

type RecordRow = {
  recordId: string
  epoch: number
  stamp: number
  deleted: number
  blob: string
  seq: number
}

/** Which records a page reads: SQL that narrows the scan, and a final check. */
type RecordFilter = {
  where: string
  bindings: (string | number)[]
  keep: (row: RecordRow) => boolean
}

const EVERY_RECORD: RecordFilter = { where: '', bindings: [], keep: () => true }

/**
 * Every table is created by `create`, never for a probe: an unknown space
 * stores nothing, and a deleted one keeps only `tombstone`. A space made
 * before a table was added gets it when its object next starts.
 */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS space (
     singleton      INTEGER PRIMARY KEY CHECK (singleton = 1),
     space_id       TEXT NOT NULL,
     owner_id       TEXT NOT NULL,
     epoch          INTEGER NOT NULL,
     rekey_needed   INTEGER NOT NULL,
     seq            INTEGER NOT NULL,
     record_count   INTEGER NOT NULL,
     blob_bytes     INTEGER NOT NULL,
     created_at     INTEGER NOT NULL,
     last_active_at INTEGER NOT NULL,
     mode           TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS member (
     member_id  TEXT PRIMARY KEY,
     dh_pub     TEXT NOT NULL,
     token_hash TEXT NOT NULL,
     wrap       TEXT NOT NULL,
     joined_at  INTEGER NOT NULL,
     scopes     TEXT,
     invited_by TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS invite (
     invite_id         TEXT PRIMARY KEY,
     invited_by        TEXT NOT NULL,
     join_verifier     TEXT NOT NULL,
     expires_at        INTEGER NOT NULL,
     created_at        INTEGER NOT NULL,
     bad_joins         INTEGER NOT NULL,
     joined_member_id  TEXT,
     joined_token_hash TEXT,
     scopes            TEXT,
     handoff           INTEGER NOT NULL DEFAULT 0
   )`,
  // Invites closed before they were used (deleted, burned, or closed by a
  // leave, removal, or rekey): only the id, until it would have expired, so
  // it can't be opened again.
  `CREATE TABLE IF NOT EXISTS closed_invite (
     invite_id  TEXT PRIMARY KEY,
     expires_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS record (
     record_id  TEXT PRIMARY KEY,
     epoch      INTEGER NOT NULL,
     stamp      INTEGER NOT NULL,
     deleted    INTEGER NOT NULL,
     blob       TEXT NOT NULL,
     blob_hash  TEXT NOT NULL,
     blob_bytes INTEGER NOT NULL,
     seq        INTEGER NOT NULL,
     scope      TEXT
   )`,
  'CREATE INDEX IF NOT EXISTS record_seq ON record (seq)',
  // Records put per hour over the last day: counts, not a list of puts.
  `CREATE TABLE IF NOT EXISTS put_hour (
     hour    INTEGER PRIMARY KEY,
     records INTEGER NOT NULL
   )`,
  // Each member's puts over the last minute, counted per millisecond, so
  // the budget holds across eviction: counts, not a list of puts.
  `CREATE TABLE IF NOT EXISTS member_put (
     member_id TEXT NOT NULL,
     at        INTEGER NOT NULL,
     puts      INTEGER NOT NULL,
     PRIMARY KEY (member_id, at)
   )`,
  // Scoped spaces. Who holds each held street: a member, or a pending
  // hand-off invite (member_id null).
  `CREATE TABLE IF NOT EXISTS holder (
     scope_id  TEXT PRIMARY KEY,
     member_id TEXT,
     invite_id TEXT,
     since     INTEGER NOT NULL
   )`,
  // Guest links: the token's verifier, never the token or the link's secret.
  // Kept as long as the space, so a link id is never reused and its
  // creator can always rewrite its `g.` record.
  `CREATE TABLE IF NOT EXISTS link (
     link_id    TEXT PRIMARY KEY,
     created_by TEXT NOT NULL,
     verifier   TEXT NOT NULL,
     scopes     TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL,
     ended_at   INTEGER
   )`,
  // Who made each invite of a scoped space, for its `i.` record, which
  // outlives the invite itself.
  `CREATE TABLE IF NOT EXISTS invite_author (
     invite_id  TEXT PRIMARY KEY,
     invited_by TEXT NOT NULL
   )`,
  // Each link's guest syncs and puts over the last minute, per millisecond.
  `CREATE TABLE IF NOT EXISTS link_request (
     link_id TEXT NOT NULL,
     kind    TEXT NOT NULL,
     at      INTEGER NOT NULL,
     count   INTEGER NOT NULL,
     PRIMARY KEY (link_id, kind, at)
   )`,
  // Records each link put per hour over the last day.
  `CREATE TABLE IF NOT EXISTS link_record_hour (
     link_id TEXT NOT NULL,
     hour    INTEGER NOT NULL,
     records INTEGER NOT NULL,
     PRIMARY KEY (link_id, hour)
   )`,
]

/**
 * Columns added for scoped spaces, as `[table, column, definition]`: a
 * space made before them gets them (`ALTER TABLE`, only when missing) when
 * its object next starts, null or 0 throughout, so it keeps its old rules.
 */
const ADDED_COLUMNS: [string, string, string][] = [
  ['space', 'mode', 'TEXT'],
  ['member', 'scopes', 'TEXT'],
  ['member', 'invited_by', 'TEXT'],
  ['invite', 'scopes', 'TEXT'],
  ['invite', 'handoff', 'INTEGER NOT NULL DEFAULT 0'],
  ['record', 'scope', 'TEXT'],
]

/** Indexes on added columns, made after them. */
const ADDED_INDEXES = [
  'CREATE INDEX IF NOT EXISTS record_scope ON record (scope, seq)',
]

const SPACE_TABLES = [
  'record',
  'invite',
  'closed_invite',
  'member',
  'put_hour',
  'member_put',
  'holder',
  'link',
  'invite_author',
  'link_request',
  'link_record_hour',
  'space',
]

const TOMBSTONE_SCHEMA = `CREATE TABLE IF NOT EXISTS tombstone (
  singleton  INTEGER PRIMARY KEY CHECK (singleton = 1),
  deleted_at INTEGER NOT NULL
)`

const HOUR_MS = 60 * 60_000
/** How soon the alarm tries `#purge` again after it failed. */
const PURGE_RETRY_MS = 10 * 60_000

/** `WebSocket.READY_STATE_OPEN`. */
const SOCKET_OPEN = 1

/** Stored on each live socket; survives hibernation. */
type LiveAttachment = { openedAt: number; memberId: string }

const attachmentOf = (ws: WebSocket): LiveAttachment | null =>
  (ws.deserializeAttachment() as LiveAttachment | null) ?? null

const closeQuietly = (ws: WebSocket, code: number, reason: string): void => {
  try {
    ws.close(code, reason)
  } catch {
    // Already closing or gone.
  }
}

const failure = (result: SpacesFailure): Response =>
  spacesErrorResponse(result.error, {
    retryAfterSeconds: result.retryAfterSeconds,
  })

/** When a space whose activity was last recorded at `lastActiveAt` goes. */
const retentionDeadline = (lastActiveAt: number): number =>
  lastActiveAt + LIMITS.retentionMs + LIMITS.activityGranularityMs

/**
 * What a write did: its answer, whether the space changed (the sockets hear
 * `changed`), whose sockets close because they're no longer members, and
 * whether the space is gone (every socket closes, the storage is purged).
 */
type Change<T> = {
  result: SpacesResult<T>
  changed?: boolean
  dropped?: string[]
  wiped?: boolean
}

const refusal = (error: SpacesErrorCode, retryAfter?: number): Change<never> => ({
  result: fail(error, retryAfter),
})

/**
 * The open invites a close takes: one, those a member made (naming one
 * street, when `scope` says), or all.
 */
type OpenInvites =
  | { inviteId: string }
  | { invitedBy: string }
  | { invitedBy: string; scope: string }
  | 'all'

/**
 * Which of `others` (oldest first) a new socket of `opener` replaces when
 * the space is `excess` past its socket cap, chosen one at a time: the
 * opener's own oldest while they hold `liveSocketsPerMember` or more, else
 * the oldest socket of whichever member holds the most (on a tie, the
 * oldest of theirs). So a member who keeps opening sockets replaces only
 * their own, and an excess bigger than one member's share (after KV
 * lowered the cap) spills over the biggest holders until the space is at
 * the cap.
 */
const replacedSockets = (
  others: readonly WebSocket[],
  opener: string,
  excess: number
): WebSocket[] => {
  const pool = others.map((ws) => ({ ws, memberId: attachmentOf(ws)?.memberId }))
  const replaced: WebSocket[] = []
  while (replaced.length < excess && pool.length > 0) {
    const held = new Map<string | undefined, number>()
    for (const { memberId } of pool) held.set(memberId, (held.get(memberId) ?? 0) + 1)
    const own = (held.get(opener) ?? 0) >= LIMITS.liveSocketsPerMember
    const most = Math.max(...held.values())
    const index = pool.findIndex(({ memberId }) =>
      own ? memberId === opener : held.get(memberId) === most
    )
    replaced.push(pool.splice(index, 1)[0].ws)
  }
  return replaced
}

type Verdict = 'newer' | 'older' | 'same'

/**
 * Which version of a record the space keeps: the newer `stamp`; on a tie a
 * deletion, then the lower SHA-256 of the blob. `same` is the version
 * already held (a retried put).
 */
const compareVersions = (incoming: PutRecordArgs, held: StoredRecord): Verdict => {
  if (incoming.stamp !== held.stamp)
    return incoming.stamp > held.stamp ? 'newer' : 'older'
  const deleted = held.deleted === 1
  if (incoming.deleted !== deleted) return incoming.deleted ? 'newer' : 'older'
  if (incoming.blobHash === held.blobHash) return 'same'
  return incoming.blobHash < held.blobHash ? 'newer' : 'older'
}

export class SharedSpace extends DurableObject<Environment> {
  #schemaReady = false

  constructor(ctx: DurableObjectState, env: Environment) {
    super(ctx, env)
    // Keepalives get their answer from the runtime without waking the object.
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong')
    )
    // Before any request: a space made before a table was added gets it,
    // and a deleted space that lost its tombstone gets it back. An unknown
    // space stays as it is.
    void ctx.blockConcurrencyWhile(async () => {
      if (this.#hasTable('space')) {
        this.#ensureSchema()
        this.#schemaReady = true
        return
      }
      if (this.#hasTable('tombstone')) return
      // Only an object that once held a space has an alarm, so one with
      // neither a space nor a tombstone lost its tombstone after
      // `deleteAll()` (`#purge`), and its id must stay `gone`.
      if ((await ctx.storage.getAlarm()) != null)
        ctx.storage.transactionSync(() => this.#writeTombstone(Date.now()))
    })
  }

  // --- Creating and joining --------------------------------------------------

  /**
   * Makes the space at epoch 1 with the caller as its only member and owner.
   * An identical retry on a space nothing has changed since gets the same
   * answer again (`#existingCreate`).
   */
  async create(args: CreateSpaceArgs): Promise<SpacesResult<SpaceCreated>> {
    let created = false
    const { result } = this.#commit((now): Change<SpaceCreated> => {
      const existing = this.#existingCreate(args)
      if (existing) return { result: existing }
      this.#ensureSchema()
      this.#sql.exec(
        `INSERT INTO space (singleton, space_id, owner_id, epoch, rekey_needed,
                            seq, record_count, blob_bytes, created_at, last_active_at,
                            mode)
         VALUES (1, ?, ?, 1, 0, 1, 0, 0, ?, ?, ?)`,
        args.spaceId,
        args.memberId,
        now,
        now,
        args.mode ?? null
      )
      this.#insertMember({ ...args, scopes: null, invitedBy: null }, now)
      created = true
      return { result: ok({ seq: 1, joinedAt: now }) }
    })
    if (created) {
      // Only once it committed: a create that rolled back left no tables.
      this.#schemaReady = true
      await this.ctx.storage.setAlarm(retentionDeadline(Date.now()))
    }
    return result
  }

  /**
   * What `create` answers for an id that exists or existed, without
   * changing anything: an identical retry's answer, `conflict`, or `gone`.
   * Null when `create` would make the space. The Worker asks first, so a
   * retry (a lost answer) doesn't count against the account's daily
   * creates again.
   */
  async existingCreate(
    args: CreateSpaceArgs
  ): Promise<SpacesResult<SpaceCreated> | null> {
    return this.#existingCreate(args)
  }

  /**
   * Uses an invite: the caller becomes a member with its own token hash,
   * public key, and wrap. Five wrong secrets burn the invite. An invite
   * whose inviter is no longer on the space is closed (`not_found`). A fresh
   * join's `epoch` (the invitation's) must be current (`stale_key`), so
   * nobody joins with a key for another epoch.
   *
   * A retry of a join that went through (same secret, `memberId`, `dhPub`,
   * and `tokenHash`, the member still there, whatever its `epoch`) answers
   * with the space's head and current epoch now, and the member's original
   * `joinedAt`. Any other join by a current member is `conflict`.
   */
  async join(args: JoinSpaceArgs): Promise<SpacesResult<SpaceJoined>> {
    return this.#commit((now): Change<SpaceJoined> => {
      if (this.#deleted()) return refusal('gone')
      if (!this.#space() || this.#space()!.spaceId !== args.spaceId)
        return refusal('not_found')
      this.#prune(now)
      const space = this.#space()!
      const invite = this.#invite(args.inviteId)
      if (!invite) return refusal('not_found')
      const secretMatches = timingSafeEqual(args.joinHash, invite.joinVerifier)
      const member = this.#member(args.memberId)
      if (invite.joinedMemberId != null) {
        // A used invite counts no wrong secrets (it can't be burned) and
        // answers only the people already on the space.
        if (!secretMatches || !member) return refusal('not_found')
        const retry =
          invite.joinedMemberId === args.memberId &&
          member.dhPub === args.dhPub &&
          timingSafeEqual(args.tokenHash, invite.joinedTokenHash ?? '') &&
          timingSafeEqual(args.tokenHash, member.tokenHash)
        return retry
          ? {
              result: ok({
                seq: space.seq,
                epoch: space.epoch,
                joinedAt: member.joinedAt,
              }),
            }
          : refusal('conflict')
      }
      // `leave` and `member/remove` close their member's invites; this holds
      // even for one that slipped past them.
      if (!this.#member(invite.invitedBy)) return refusal('not_found')
      // A scoped invite stays good only while what it gives is still the
      // inviter's to give: a holder's streets still theirs, a hand-off's
      // street still held by it.
      if (space.mode === 'scoped' && !this.#inviteStillGood(space, invite))
        return refusal('not_found')
      if (!secretMatches) {
        if (invite.badJoins + 1 >= LIMITS.badJoins) {
          this.#closeInvites({ inviteId: args.inviteId }, now)
          this.#advance()
          return { result: fail('forbidden'), changed: true }
        }
        this.#sql.exec(
          'UPDATE invite SET bad_joins = bad_joins + 1 WHERE invite_id = ?',
          args.inviteId
        )
        return refusal('forbidden')
      }
      if (member) return refusal('conflict')
      // An open invite was made at the current epoch (a rekey closes them
      // all), so another epoch means the invitation carries another key.
      if (args.epoch !== space.epoch) return refusal('stale_key')
      // The invite already holds a place; a lowered cap still applies.
      if (this.#memberCount() + this.#openInviteCount(now) > args.maxMembers) {
        logSpacesLimitHit('spaces/join', 'maxMembers')
        return refusal('limit')
      }
      const scoped = space.mode === 'scoped'
      this.#insertMember(
        {
          ...args,
          scopes: scoped ? invite.scopes : null,
          invitedBy: scoped ? invite.invitedBy : null,
        },
        now
      )
      this.#sql.exec(
        `UPDATE invite SET joined_member_id = ?, joined_token_hash = ?
         WHERE invite_id = ?`,
        args.memberId,
        args.tokenHash,
        args.inviteId
      )
      // A hand-off invite's street is now held by the one who joined.
      if (scoped && invite.handoff === 1)
        this.#sql.exec(
          `UPDATE holder SET member_id = ?, invite_id = NULL, since = ?
           WHERE invite_id = ?`,
          args.memberId,
          now,
          args.inviteId
        )
      const seq = this.#advance()
      return {
        result: ok({ seq, epoch: space.epoch, joinedAt: now }),
        changed: true,
      }
    }).result
  }

  // --- Records ---------------------------------------------------------------

  /**
   * Records with `seq > since` in `seq` order, up to `limit` (and the page's
   * size budget), plus the complete members and open invites. Records the
   * space's activity when it was last recorded more than
   * `activityGranularityMs` ago, so most syncs write nothing.
   */
  async sync(args: SyncSpaceArgs): Promise<SpacesResult<SpaceSyncView>> {
    return this.#commit((now): Change<SpaceSyncView> => {
      const auth = this.#authenticate(args)
      if (!auth.ok) return { result: auth }
      this.#prune(now)
      // Pruning can advance `seq` (a hand-off invite that lapsed).
      const space = this.#space()!
      if (now - space.lastActiveAt > LIMITS.activityGranularityMs)
        this.#touch(now)
      return {
        result: ok(
          this.#snapshot(space, args.memberId, args.since, args.limit, now)
        ),
      }
    }).result
  }

  /**
   * Stores each record unless the space holds a newer version of it
   * (`compareVersions`); each stored record takes the next `seq`. A record
   * id reserved to someone else (`m.<memberId>` but the caller's own, or
   * `k.<x>` from anyone but the owner: `mayPutRecord`) is `forbidden`, and
   * every record must be sealed under the current epoch (`stale_key`);
   * either way nothing is stored, and the member's put budget isn't spent.
   * Refused whole past the record or byte cap (`limit`), the member's puts a
   * rolling minute, or the space's records a rolling day (`rate_limited`).
   * Touches `lastActiveAt`.
   */
  async put(
    args: PutSpaceArgs
  ): Promise<SpacesResult<{ seq: number; results: PutResult[] }>> {
    return this.#commit((now): Change<{ seq: number; results: PutResult[] }> => {
      const auth = this.#authenticate(args)
      if (!auth.ok) return { result: auth }
      const space = auth.value
      // Refused before anything is written, so none of them costs a put.
      let scopes: (string | null)[] | null = null
      if (space.mode === 'scoped') {
        const classes = args.records.map((record) =>
          classifyScopedRecord(record.recordId)
        )
        if (classes.some((record) => record == null)) return refusal('bad_request')
        this.#prune(now)
        const access = this.#access(space)
        const caller = this.#caller(space, args.memberId)!
        if (
          classes.some((record) => !this.#mayWrite(access, caller, record!))
        )
          return refusal('forbidden')
        scopes = classes.map((record) => scopeOf(record!))
      } else if (
        args.records.some(
          (record) => !mayPutRecord(record.recordId, args.memberId, space.ownerId)
        )
      )
        return refusal('forbidden')
      if (args.records.some((record) => record.epoch !== space.epoch))
        return refusal('stale_key')
      const wait = this.#memberPutWaitMs(args.memberId, now)
      if (wait != null) {
        logSpacesLimitHit('spaces/put', 'memberPuts')
        return refusal('rate_limited', retryAfterSeconds(wait))
      }
      // From here the put counts against the member, refused or not. It's
      // counted in this transaction, so a put that throws costs nothing.
      this.#countPut(args.memberId, now)

      return this.#store('spaces/put', args.records, scopes, now)
    }).result
  }

  /**
   * Stores a put's records (each under its scope, when the space is scoped)
   * once every check that refuses without counting has passed: the record
   * and byte caps (`limit`), then the space's records a rolling day
   * (`rate_limited`). Each stored record takes the next `seq`.
   */
  #store(
    op: string,
    records: PutRecordArgs[],
    scopes: (string | null)[] | null,
    now: number
  ): Change<{ seq: number; results: PutResult[] }> {
    // Re-read: pruning may have advanced `seq`.
    const space = this.#space()!
    const plan = this.#plan(records)
    // Running counts, so a put never scans the table.
    const capped = this.#refuseOverCaps(op, space, plan)
    if (capped) return { result: capped }
    const budget = this.#refuseOverDailyRecords(op, records.length, now)
    if (budget) return { result: budget }

    let seq = space.seq
    const results: PutResult[] = []
    records.forEach((record, index) => {
      const verdict = plan.verdicts[index]
      if (verdict === 'newer') this.#storeRecord(record, ++seq, scopes?.[index] ?? null)
      results.push({ recordId: record.recordId, stored: verdict !== 'older' })
    })
    this.#sql.exec(
      `INSERT INTO put_hour (hour, records) VALUES (?, ?)
       ON CONFLICT (hour) DO UPDATE SET records = records + excluded.records`,
      Math.floor(now / HOUR_MS),
      records.length
    )
    this.#sql.exec(
      `UPDATE space SET seq = ?, record_count = record_count + ?,
                        blob_bytes = blob_bytes + ?, last_active_at = ?
       WHERE singleton = 1`,
      seq,
      plan.added,
      plan.bytes,
      now
    )
    return { result: ok({ seq, results }), changed: seq !== space.seq }
  }

  // --- Invites ---------------------------------------------------------------

  /**
   * Opens an invite for any member at the current epoch (`stale_key`
   * otherwise), keeping who made it. Members plus open invites may not pass
   * `maxMembers` (`limit`). Sending the same invite again (a lost answer) is
   * a no-op while it's open; any other reuse of the id, one closed, used, or
   * burned before it expired included, is `conflict`.
   */
  async createInvite(args: CreateSpaceInviteArgs): Promise<SpacesResult<Empty>> {
    return this.#commit((now): Change<Empty> => {
      const auth = this.#authenticate(args)
      if (!auth.ok) return { result: auth }
      if (auth.value.mode === 'scoped') return this.#createScopedInvite(auth.value, args, now)
      if (args.scopes != null || args.handoff != null) return refusal('bad_request')
      // A rekey closes every open invite, so an open one always matches.
      if (args.epoch !== auth.value.epoch) return refusal('stale_key')
      this.#prune(now)
      const existing = this.#invite(args.inviteId)
      if (existing) {
        const same =
          existing.joinedMemberId == null &&
          existing.invitedBy === args.memberId &&
          existing.expiresAt === args.expiresAt &&
          timingSafeEqual(existing.joinVerifier, args.joinVerifier)
        return same ? { result: ok({}) } : refusal('conflict')
      }
      if (this.#inviteClosed(args.inviteId)) return refusal('conflict')
      if (this.#memberCount() + this.#openInviteCount(now) >= args.maxMembers) {
        logSpacesLimitHit('spaces/invite/create', 'maxMembers')
        return refusal('limit')
      }
      this.#sql.exec(
        `INSERT INTO invite (invite_id, invited_by, join_verifier, expires_at,
                             created_at, bad_joins)
         VALUES (?, ?, ?, ?, ?, 0)`,
        args.inviteId,
        args.memberId,
        args.joinVerifier,
        args.expiresAt,
        now
      )
      this.#advance()
      return { result: ok({}), changed: true }
    }).result
  }

  /**
   * `invite/create` in a scoped space. Only the owner (the whole territory,
   * or streets nobody holds) and holders (only streets they hold, never a
   * hand-off) invite; anyone else is `forbidden`, checked before
   * `stale_key`. A hand-off invite's street must be unheld (`conflict`) and
   * becomes held by the invite at once; a share naming a held street is
   * `forbidden`. The rest is as in a space without a mode.
   */
  #createScopedInvite(
    space: SpaceRow,
    args: CreateSpaceInviteArgs,
    now: number
  ): Change<Empty> {
    this.#prune(now)
    const caller = this.#caller(space, args.memberId)!
    const scopes = args.scopes ?? null
    const handoff = args.handoff === true
    const holds = this.#holds()
    if (!caller.isOwner) {
      const held = this.#heldBy(holds, args.memberId)
      if (handoff || scopes == null || held.size === 0) return refusal('forbidden')
      if (scopes.some((scope) => !held.has(scope))) return refusal('forbidden')
    }
    if (args.epoch !== space.epoch) return refusal('stale_key')
    const existing = this.#invite(args.inviteId)
    if (existing) {
      const same =
        existing.joinedMemberId == null &&
        existing.invitedBy === args.memberId &&
        existing.expiresAt === args.expiresAt &&
        sameScopes(existing.scopes, scopes) &&
        existing.handoff === (handoff ? 1 : 0) &&
        timingSafeEqual(existing.joinVerifier, args.joinVerifier)
      return same ? { result: ok({}) } : refusal('conflict')
    }
    if (this.#inviteClosed(args.inviteId)) return refusal('conflict')
    if (this.#count('SELECT COUNT(*) AS n FROM invite_author WHERE invite_id = ?', args.inviteId) > 0)
      return refusal('conflict')
    if (caller.isOwner && scopes) {
      const taken = scopes.some((scope) => holds.has(scope))
      if (taken) return refusal(handoff ? 'conflict' : 'forbidden')
    }
    if (this.#memberCount() + this.#openInviteCount(now) >= args.maxMembers) {
      logSpacesLimitHit('spaces/invite/create', 'maxMembers')
      return refusal('limit')
    }
    this.#sql.exec(
      `INSERT INTO invite (invite_id, invited_by, join_verifier, expires_at,
                           created_at, bad_joins, scopes, handoff)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      args.inviteId,
      args.memberId,
      args.joinVerifier,
      args.expiresAt,
      now,
      scopes ? JSON.stringify(scopes) : null,
      handoff ? 1 : 0
    )
    this.#sql.exec(
      'INSERT INTO invite_author (invite_id, invited_by) VALUES (?, ?)',
      args.inviteId,
      args.memberId
    )
    if (handoff)
      this.#sql.exec(
        'INSERT INTO holder (scope_id, member_id, invite_id, since) VALUES (?, NULL, ?, ?)',
        scopes![0],
        args.inviteId,
        now
      )
    this.#advance()
    return { result: ok({}), changed: true }
  }

  /**
   * Closes an open invite: its inviter's or the owner's to close
   * (`forbidden` for anyone else). Idempotent: an unknown, closed, used, or
   * expired invite is already closed, so any member gets `ok` and nothing
   * changes.
   */
  async deleteInvite(args: DeleteSpaceInviteArgs): Promise<SpacesResult<Empty>> {
    return this.#commit((now): Change<Empty> => {
      const auth = this.#authenticate(args)
      if (!auth.ok) return { result: auth }
      this.#prune(now)
      const invite = this.#invite(args.inviteId)
      if (!invite || invite.joinedMemberId != null) return { result: ok({}) }
      if (invite.invitedBy !== args.memberId && auth.value.ownerId !== args.memberId)
        return refusal('forbidden')
      this.#closeInvites({ inviteId: args.inviteId }, now)
      this.#advance()
      return { result: ok({}), changed: true }
    }).result
  }

  // --- Leaving, removal, rekeying, deleting ----------------------------------

  /**
   * Deletes the caller's token hash, key, and wrap, and closes the invites
   * they made that nobody used. An owner who leaves passes the space to the
   * member who joined first; the last member to leave deletes it.
   */
  async leave(args: MemberAuth): Promise<SpacesResult<Empty>> {
    return this.#run((now): Change<Empty> => {
      const auth = this.#authenticate(args)
      if (!auth.ok) return { result: auth }
      if (auth.value.mode === 'scoped') {
        // A territory's owner never changes: they delete it instead.
        if (auth.value.ownerId === args.memberId) return refusal('bad_request')
        const dropped = this.#dropMember(args.memberId, now)
        this.#advance()
        return { result: ok({}), changed: true, dropped }
      }
      this.#dropMember(args.memberId, now)
      if (this.#memberCount() === 0) {
        this.#wipe(now)
        return { result: ok({}), wiped: true }
      }
      if (auth.value.ownerId === args.memberId) {
        const next = this.#sql
          .exec<{ memberId: string }>(
            'SELECT member_id AS memberId FROM member ORDER BY joined_at, member_id LIMIT 1'
          )
          .one().memberId
        this.#sql.exec('UPDATE space SET owner_id = ? WHERE singleton = 1', next)
      }
      this.#advance()
      return { result: ok({}), changed: true, dropped: [args.memberId] }
    })
  }

  /**
   * The owner removes a member (never themselves: they leave or delete), as
   * if they'd left, and closes every open invite, not only theirs: else the
   * removed member could come back through another member's invitation
   * before the rekey. The inviters send theirs again after it. An unknown
   * `removeId` is `ok` and changes nothing.
   */
  async removeMember(args: RemoveSpaceMemberArgs): Promise<SpacesResult<Empty>> {
    return this.#run((now): Change<Empty> => {
      const scoped = this.#authenticate(args)
      if (scoped.ok && scoped.value.mode === 'scoped')
        return this.#removeScopedMember(scoped.value, args, now)
      const auth = this.#authenticateOwner(args)
      if (!auth.ok) return { result: auth }
      if (args.removeId === args.memberId) return refusal('bad_request')
      if (!this.#member(args.removeId)) return { result: ok({}) }
      this.#dropMember(args.removeId, now)
      this.#closeInvites('all', now)
      this.#advance()
      return { result: ok({}), changed: true, dropped: [args.removeId] }
    })
  }

  /**
   * `member/remove` in a scoped space: the owner removes anyone but
   * themselves; anyone else only members they invited (only holders
   * invite). Removing a holder first gives back each street they hold
   * (`#endHold`), which can remove their onward members too. An unknown
   * `removeId` is `ok` for any member.
   */
  #removeScopedMember(
    space: SpaceRow,
    args: RemoveSpaceMemberArgs,
    now: number
  ): Change<Empty> {
    if (args.removeId === args.memberId) return refusal('bad_request')
    const target = this.#member(args.removeId)
    if (!target) return { result: ok({}) }
    if (space.ownerId !== args.memberId && target.invitedBy !== args.memberId)
      return refusal('forbidden')
    const dropped = this.#dropMember(args.removeId, now)
    this.#closeInvites('all', now)
    this.#advance()
    return { result: ok({}), changed: true, dropped }
  }

  /**
   * The owner moves the space to the next epoch (`stale_key` for any other)
   * with a wrap for every current member, exactly: missing one or naming
   * someone not on the space is `conflict`, since membership changed under
   * the owner's device (it syncs and tries again). Closes every open invite.
   *
   * In the same transaction it stores `link`, the record `k.<epoch>`, at the
   * new epoch and a `seq` of its own after the rekey's, replacing any version
   * of it the space holds whatever its stamp, so a link planted ahead of
   * time can't block it. It counts against the record and byte caps
   * (`limit`), as a put's records do. The answer's `seq` is the head, the
   * link's.
   */
  async rekey(args: RekeySpaceArgs): Promise<SpacesResult<{ seq: number }>> {
    return this.#run((): Change<{ seq: number }> => {
      const auth = this.#authenticateOwner(args)
      if (!auth.ok) return { result: auth }
      const space = auth.value
      const named = new Set(args.wraps.map((entry) => entry.memberId))
      // The parser refuses these first; malformed either way.
      if (named.size !== args.wraps.length) return refusal('bad_request')
      if (args.epoch !== space.epoch + 1) return refusal('stale_key')
      const members = new Set(
        this.#sql
          .exec<{ memberId: string }>('SELECT member_id AS memberId FROM member')
          .toArray()
          .map((row) => row.memberId)
      )
      if (
        named.size !== members.size ||
        [...named].some((memberId) => !members.has(memberId))
      )
        return refusal('conflict')

      const link: PutRecordArgs = {
        ...args.link,
        recordId: rekeyLinkId(args.epoch),
        epoch: args.epoch,
        deleted: false,
      }
      const held = this.#record(link.recordId)
      const size = decodedLength(link.blob)
      const plan = { added: held ? 0 : 1, bytes: size - (held?.bytes ?? 0) }
      const capped = this.#refuseOverCaps('spaces/rekey', space, plan)
      if (capped) return { result: capped }

      for (const entry of args.wraps)
        this.#sql.exec(
          'UPDATE member SET wrap = ? WHERE member_id = ?',
          entry.wrap,
          entry.memberId
        )
      this.#sql.exec(
        'UPDATE space SET epoch = ?, rekey_needed = 0 WHERE singleton = 1',
        args.epoch
      )
      this.#closeInvites('all', Date.now())
      const seq = this.#advance() + 1
      this.#storeRecord(link, seq)
      this.#sql.exec(
        `UPDATE space SET seq = ?, record_count = record_count + ?,
                          blob_bytes = blob_bytes + ?
         WHERE singleton = 1`,
        seq,
        plan.added,
        plan.bytes
      )
      return { result: ok({ seq }), changed: true }
    })
  }

  /** The owner wipes the space: records, members, wraps, and invites. */
  async deleteSpace(args: MemberAuth): Promise<SpacesResult<Empty>> {
    return this.#run((now): Change<Empty> => {
      const auth = this.#authenticateOwner(args)
      if (!auth.ok) return { result: auth }
      this.#wipe(now)
      return { result: ok({}), wiped: true }
    })
  }

  // --- Territories: scopes, hand-offs, guest links ---------------------------

  /**
   * The owner sets the streets of a member they invited (never their own):
   * `scopes`, or null for the whole territory. The new streets must keep
   * every street the target holds, and may add none someone else holds or a
   * pending hand-off holds (`conflict`); a street the target already had
   * stays even if it's held now. Narrowing asks for a rekey. An unknown
   * target is `conflict` (the owner's device syncs and tries again).
   */
  async setMemberScopes(args: MemberScopesArgs): Promise<SpacesResult<Empty>> {
    return this.#commit((now): Change<Empty> => {
      const auth = this.#authenticateScopedOwner(args)
      if (!auth.ok) return { result: auth }
      this.#prune(now)
      if (args.target === args.memberId) return refusal('bad_request')
      const target = this.#member(args.target)
      if (!target) return refusal('conflict')
      if (target.invitedBy !== args.memberId) return refusal('forbidden')
      const before = scopeList(target.scopes)
      if (args.scopes) {
        const next = new Set(args.scopes)
        const holds = this.#holds()
        for (const scope of this.#heldBy(holds, args.target))
          if (!next.has(scope)) return refusal('conflict')
        const had = new Set(before ?? [])
        for (const scope of next) {
          const hold = holds.get(scope)
          if (hold && hold.memberId !== args.target && !had.has(scope))
            return refusal('conflict')
        }
      }
      const narrowed =
        args.scopes != null &&
        (before == null || before.some((scope) => !args.scopes!.includes(scope)))
      this.#sql.exec(
        'UPDATE member SET scopes = ? WHERE member_id = ?',
        args.scopes ? JSON.stringify(args.scopes) : null,
        args.target
      )
      if (narrowed)
        this.#sql.exec('UPDATE space SET rekey_needed = 1 WHERE singleton = 1')
      this.#advance()
      return { result: ok({}), changed: true }
    }).result
  }

  /**
   * The owner makes a member (not themselves) the holder of one street
   * nobody holds (`conflict` when it's held or a hand-off is pending). A
   * street-scoped target gains it. Only the owner hands off (`forbidden`
   * for anyone else), and the owner never changes, so a holder can't hand
   * a street on. An unknown target is `conflict`.
   */
  async createHandoff(
    args: HandoffCreateArgs
  ): Promise<SpacesResult<{ seq: number }>> {
    return this.#commit((now): Change<{ seq: number }> => {
      const auth = this.#authenticateScopedOwner(args)
      if (!auth.ok) return { result: auth }
      this.#prune(now)
      if (args.target === args.memberId) return refusal('bad_request')
      if (this.#holds().has(args.scopeId)) return refusal('conflict')
      const target = this.#member(args.target)
      if (!target) return refusal('conflict')
      const scopes = scopeList(target.scopes)
      if (scopes && !scopes.includes(args.scopeId))
        this.#sql.exec(
          'UPDATE member SET scopes = ? WHERE member_id = ?',
          JSON.stringify([...scopes, args.scopeId]),
          args.target
        )
      this.#sql.exec(
        'INSERT INTO holder (scope_id, member_id, invite_id, since) VALUES (?, ?, NULL, ?)',
        args.scopeId,
        args.target,
        now
      )
      return { result: ok({ seq: this.#advance() }), changed: true }
    }).result
  }

  /**
   * Takes a street back (the owner) or gives it back (its holder):
   * `#endHold`. Idempotent: a street nobody holds is `ok` for any member.
   * Anyone but the owner and the holder is `forbidden`.
   */
  async endHandoff(args: HandoffEndArgs): Promise<SpacesResult<{ seq: number }>> {
    return this.#run((now): Change<{ seq: number }> => {
      const auth = this.#authenticateScoped(args)
      if (!auth.ok) return { result: auth }
      this.#prune(now)
      const hold = this.#holds().get(args.scopeId)
      if (!hold) return { result: ok({ seq: this.#space()!.seq }) }
      if (auth.value.ownerId !== args.memberId && hold.memberId !== args.memberId)
        return refusal('forbidden')
      const dropped = this.#endHold(args.scopeId, now)
      return { result: ok({ seq: this.#advance() }), changed: true, dropped }
    })
  }

  /**
   * Opens a guest link on `scopes`: the owner's on streets nobody holds,
   * a holder's on streets they hold (`forbidden` otherwise). `epoch` must be
   * current (`stale_key`). At most 10 open links a space and 30 made a
   * rolling day (`limit`). An identical retry by its creator is `ok`; any
   * other reuse of the id, ever, is `conflict`.
   */
  async createLink(args: LinkCreateArgs): Promise<SpacesResult<{ seq: number }>> {
    return this.#commit((now): Change<{ seq: number }> => {
      const auth = this.#authenticateScoped(args)
      if (!auth.ok) return { result: auth }
      this.#prune(now)
      const existing = this.#link(args.linkId)
      if (existing) {
        const same =
          existing.createdBy === args.memberId &&
          existing.expiresAt === args.expiresAt &&
          sameScopes(existing.scopes, args.scopes) &&
          timingSafeEqual(existing.verifier, args.verifier)
        return same ? { result: ok({ seq: this.#space()!.seq }) } : refusal('conflict')
      }
      const holds = this.#holds()
      const allowed =
        auth.value.ownerId === args.memberId
          ? args.scopes.every((scope) => !holds.has(scope))
          : (() => {
              const held = this.#heldBy(holds, args.memberId)
              return held.size > 0 && args.scopes.every((scope) => held.has(scope))
            })()
      if (!allowed) return refusal('forbidden')
      if (args.epoch !== auth.value.epoch) return refusal('stale_key')
      const open = this.#count(
        'SELECT COUNT(*) AS n FROM link WHERE ended_at IS NULL AND expires_at > ?',
        now
      )
      if (open >= LIMITS.openLinks) {
        logSpacesLimitHit('spaces/link/create', 'openLinks')
        return refusal('limit')
      }
      const today = this.#count(
        'SELECT COUNT(*) AS n FROM link WHERE created_at > ?',
        now - LIMITS.linkWindowMs
      )
      if (today >= LIMITS.linksPerDay) {
        logSpacesLimitHit('spaces/link/create', 'linksPerDay')
        return refusal('limit')
      }
      this.#sql.exec(
        `INSERT INTO link (link_id, created_by, verifier, scopes, created_at,
                           expires_at, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        args.linkId,
        args.memberId,
        args.verifier,
        JSON.stringify(args.scopes),
        now,
        args.expiresAt
      )
      return { result: ok({ seq: this.#advance() }), changed: true }
    }).result
  }

  /**
   * Ends a guest link at once: its creator's or the owner's to end
   * (`forbidden` for anyone else). Idempotent: an unknown, ended, or
   * expired link is `ok` for any member.
   */
  async endLink(args: LinkEndArgs): Promise<SpacesResult<{ seq: number }>> {
    return this.#commit((now): Change<{ seq: number }> => {
      const auth = this.#authenticateScoped(args)
      if (!auth.ok) return { result: auth }
      const link = this.#link(args.linkId)
      if (!link || link.endedAt != null || link.expiresAt <= now)
        return { result: ok({ seq: auth.value.seq }) }
      if (link.createdBy !== args.memberId && auth.value.ownerId !== args.memberId)
        return refusal('forbidden')
      this.#sql.exec('UPDATE link SET ended_at = ? WHERE link_id = ?', now, args.linkId)
      return { result: ok({ seq: this.#advance() }), changed: true }
    }).result
  }

  /**
   * Moves a live guest link's `expiresAt`, sooner or later: its creator's
   * or the owner's (`forbidden` for anyone else). An unknown, ended, or
   * expired link is `not_found`: make a new one. The Worker has already
   * held `expiresAt` to the longest a link may last from now.
   */
  async setLinkExpiry(args: LinkExpiryArgs): Promise<SpacesResult<{ seq: number }>> {
    return this.#commit((now): Change<{ seq: number }> => {
      const auth = this.#authenticateScoped(args)
      if (!auth.ok) return { result: auth }
      const link = this.#link(args.linkId)
      if (!link || link.endedAt != null || link.expiresAt <= now) return refusal('not_found')
      if (link.createdBy !== args.memberId && auth.value.ownerId !== args.memberId)
        return refusal('forbidden')
      if (link.expiresAt === args.expiresAt) return { result: ok({ seq: auth.value.seq }) }
      this.#sql.exec('UPDATE link SET expires_at = ? WHERE link_id = ?', args.expiresAt, args.linkId)
      return { result: ok({ seq: this.#advance() }), changed: true }
    }).result
  }

  // --- Guests ----------------------------------------------------------------

  /**
   * A guest link's page reads `g.<linkId>` and the streets it may read
   * (`#guestScopes`), past `since`, up to `limit`. Checked: the link
   * (`#authenticateGuest`), then 120 syncs a link a rolling minute.
   */
  async guestSync(args: GuestSyncArgs): Promise<SpacesResult<GuestSyncView>> {
    return this.#commit((now): Change<GuestSyncView> => {
      const auth = this.#authenticateGuest(args, now)
      if (!auth.ok) return { result: auth }
      const limited = this.#refuseOverLinkRequests(args.linkId, 'sync', now)
      if (limited) return { result: limited }
      this.#prune(now)
      const space = this.#space()!
      if (now - space.lastActiveAt > LIMITS.activityGranularityMs) this.#touch(now)
      const scopes = this.#guestScopes(space, auth.value)
      const page = this.#readRecords(args.since, args.limit, {
        where: ` AND (record_id = ? OR scope IN (SELECT value FROM json_each(?)))`,
        bindings: [`g.${args.linkId}`, JSON.stringify([...scopes])],
        keep: () => true,
      })
      return {
        result: ok({
          seq: page.more ? page.records[page.records.length - 1].seq : space.seq,
          epoch: space.epoch,
          expiresAt: auth.value.expiresAt,
          records: page.records,
          more: page.more,
        }),
      }
    }).result
  }

  /**
   * A guest link's page stores records in its streets: `s.<S>.w` and
   * `s.<S>.<uuid>` only (never `s.<S>`), for streets it may write. Checked
   * in order: the link, 30 puts a link a rolling minute (`rate_limited`),
   * the ids' grammar (`bad_request`), each record (`forbidden`, nothing
   * stored), the epoch (`stale_key`), 2,000 records a link a rolling day
   * (`rate_limited`), then the space's caps as `put`.
   */
  async guestPut(
    args: GuestPutArgs
  ): Promise<SpacesResult<{ seq: number; results: PutResult[] }>> {
    return this.#commit((now): Change<{ seq: number; results: PutResult[] }> => {
      const auth = this.#authenticateGuest(args, now)
      if (!auth.ok) return { result: auth }
      const limited = this.#refuseOverLinkRequests(args.linkId, 'put', now)
      if (limited) return { result: limited }
      const classes = args.records.map((record) => classifyScopedRecord(record.recordId))
      if (classes.some((record) => record == null)) return refusal('bad_request')
      this.#prune(now)
      const space = this.#space()!
      const scopes = this.#guestScopes(space, auth.value)
      if (
        classes.some(
          (record) => record!.kind !== 'inScope' || !scopes.has(record!.scope)
        )
      )
        return refusal('forbidden')
      if (args.records.some((record) => record.epoch !== space.epoch))
        return refusal('stale_key')
      const daily = this.#refuseOverLinkRecords(args.linkId, args.records.length, now)
      if (daily) return { result: daily }
      const change = this.#store(
        'spaces/guest/put',
        args.records,
        classes.map((record) => scopeOf(record!)),
        now
      )
      if (change.result.ok)
        this.#sql.exec(
          `INSERT INTO link_record_hour (link_id, hour, records) VALUES (?, ?, ?)
           ON CONFLICT (link_id, hour) DO UPDATE SET records = records + excluded.records`,
          args.linkId,
          Math.floor(now / HOUR_MS),
          args.records.length
        )
      return change
    }).result
  }

  // --- Retention -------------------------------------------------------------

  /**
   * Set when the space is made; each time it fires, the space goes if it's
   * had no `sync` or `put` for 400 days (`retentionDeadline`), else the
   * alarm moves to that deadline. On a deleted space it's `#purge`'s retry.
   * Only an object that once held a space has an alarm, so one with neither
   * a space nor a tombstone lost its tombstone after `deleteAll()` (`#purge`):
   * it writes it back (the constructor already does, before any request;
   * this is the backup).
   */
  async alarm(): Promise<void> {
    if (this.#deleted()) {
      await this.#purge()
      return
    }
    const space = this.#space()
    if (!space) {
      if (!this.#ready() && !this.#hasTable('tombstone'))
        this.ctx.storage.transactionSync(() => this.#writeTombstone(Date.now()))
      return
    }
    const deadline = retentionDeadline(space.lastActiveAt)
    if (Date.now() < deadline) {
      await this.ctx.storage.setAlarm(deadline)
      return
    }
    await this.#run((now): Change<Empty> => {
      this.#wipe(now)
      return { result: ok({}), wiped: true }
    })
  }

  // --- Live socket -----------------------------------------------------------

  /**
   * `GET /spaces/v1/live`, forwarded by the Worker after it checked the
   * session and the headers' shape and hashed the token: the member and the
   * member cap in `SPACES_HEADERS.member`, which only the Worker sets. Says
   * `hello` with the current `seq`.
   *
   * Past the cap (4 sockets per member the cap allows), a member who
   * already holds 4 or more replaces their own oldest; anyone else's opens
   * by closing the oldest of whoever holds the most (`replacedSockets`). So
   * no member can keep the others' sockets closed.
   */
  async fetch(request: Request): Promise<Response> {
    if (!isWebSocketUpgrade(request)) return failure(fail('upgrade_required'))
    const member = decodeLiveMember(request.headers.get(SPACES_HEADERS.member))
    if (!member) return failure(fail('bad_request'))
    const auth = this.#authenticate(member)
    if (!auth.ok) return failure(auth)

    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server)
    const attachment: LiveAttachment = {
      openedAt: Date.now(),
      memberId: member.memberId,
    }
    server.serializeAttachment(attachment)
    const others = this.#liveSockets()
      .filter((ws) => ws !== server)
      .sort(
        (a, b) => (attachmentOf(a)?.openedAt ?? 0) - (attachmentOf(b)?.openedAt ?? 0)
      )
    const excess = others.length + 1 - LIMITS.liveSocketsPerMember * member.maxMembers
    if (excess > 0) {
      const { code, reason } = SPACES_LIVE_CLOSE.replaced
      for (const ws of replacedSockets(others, member.memberId, excess))
        closeQuietly(ws, code, reason)
    }
    this.#signal(server, { type: 'hello', seq: auth.value.seq })
    return new Response(null, { status: 101, webSocket: client })
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

  // --- Helpers ---------------------------------------------------------------

  get #sql() {
    return this.ctx.storage.sql
  }

  /**
   * Runs `work` in one transaction, then (once it committed) tells the
   * sockets: `changed` to every open socket, `gone` to members who left or
   * were removed, and to everyone when the space was wiped.
   */
  #commit<T>(work: (now: number) => Change<T>): Change<T> {
    const now = Date.now()
    this.#advanced = false
    const change = this.ctx.storage.transactionSync(() => work(now))
    if (change.wiped) {
      this.#closeSockets(null)
    } else {
      if (change.dropped?.length) this.#closeSockets(new Set(change.dropped))
      // A refusal can still have advanced `seq` (pruning a lapsed hand-off).
      if (change.changed || this.#advanced) this.#broadcast()
    }
    return change
  }

  /** Set by `#advance` during a `#commit`, so a refusal that changed `seq` still signals. */
  #advanced = false

  /** `#commit`, then `#purge` once the space is wiped. */
  async #run<T>(work: (now: number) => Change<T>): Promise<SpacesResult<T>> {
    const change = this.#commit(work)
    if (change.wiped) await this.#purge()
    return change.result
  }

  #hasTable(name: string): boolean {
    return (
      this.#sql
        .exec<{ n: number }>(
          "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?",
          name
        )
        .one().n > 0
    )
  }

  #ready(): boolean {
    if (!this.#schemaReady) this.#schemaReady = this.#hasTable('space')
    return this.#schemaReady
  }

  /**
   * Creates the space's tables, and adds the columns and indexes a space
   * made before them lacks; the caller sets `#schemaReady` once committed.
   */
  #ensureSchema(): void {
    for (const statement of SCHEMA) this.#sql.exec(statement)
    for (const [table, column, definition] of ADDED_COLUMNS) {
      const has = this.#sql
        .exec<{ name: string }>(`PRAGMA table_info(${table})`)
        .toArray()
        .some((row) => row.name === column)
      if (!has) this.#sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
    for (const statement of ADDED_INDEXES) this.#sql.exec(statement)
  }

  /** True once the space was deleted (only its tombstone is left). */
  #deleted(): boolean {
    return !this.#ready() && this.#hasTable('tombstone')
  }

  /**
   * Drops every table but the tombstone, inside the caller's transaction,
   * so the space is gone at once for every request after it; the caller
   * then `#purge`s.
   */
  #wipe(now: number): void {
    for (const table of SPACE_TABLES)
      this.#sql.exec(`DROP TABLE IF EXISTS ${table}`)
    this.#schemaReady = false
    this.#writeTombstone(now)
  }

  #writeTombstone(deletedAt: number): void {
    this.#sql.exec(TOMBSTONE_SCHEMA)
    this.#sql.exec(
      'INSERT OR REPLACE INTO tombstone (singleton, deleted_at) VALUES (1, ?)',
      deletedAt
    )
  }

  /**
   * Frees a deleted space's storage. Dropping its tables (`#wipe`) already
   * made it gone, atomically with the check that allowed it, but Cloudflare
   * says dropped tables don't free a SQLite Durable Object's storage, which
   * is billed until `deleteAll()`. So: `deleteAll()` (all or nothing), then
   * the retry alarm set again and the tombstone written back, all inside
   * `blockConcurrencyWhile` (`deleteAllThen`), so no request ever sees the
   * space without its tombstone.
   *
   * If a step fails, workerd resets the object, and the request that wiped
   * the space fails (500) although the space is already gone: a retry gets
   * `gone`. The alarm, set before `deleteAll()` and again after it (from
   * compatibility date 2026-02-24 `deleteAll()` drops it), tries again. A
   * tombstone the failure lost is written back by the next instance's
   * constructor, before any request, and by the alarm otherwise.
   */
  async #purge(): Promise<void> {
    try {
      const deletedAt =
        this.#sql
          .exec<{ at: number }>('SELECT deleted_at AS at FROM tombstone')
          .toArray()[0]?.at ?? Date.now()
      const retryAt = Date.now() + PURGE_RETRY_MS
      await this.ctx.storage.setAlarm(retryAt)
      await deleteAllThen(this.ctx, {
        afterDeleteAll: () => this.ctx.storage.setAlarm(retryAt),
        restore: () => this.#writeTombstone(deletedAt),
      })
      this.#schemaReady = false
      await this.ctx.storage.deleteAlarm()
    } catch (error) {
      // The space is already gone; only its storage waits for the alarm.
      console.warn('spaces: storage purge failed; retrying from the alarm')
      captureOperationFailure(error, 'spaces/purge')
    }
  }

  #space(): SpaceRow | null {
    if (!this.#ready()) return null
    return (
      this.#sql
        .exec<SpaceRow>(
          `SELECT space_id AS spaceId, owner_id AS ownerId, mode, epoch,
                  rekey_needed AS rekeyNeeded, seq, record_count AS recordCount,
                  blob_bytes AS blobBytes, last_active_at AS lastActiveAt
           FROM space WHERE singleton = 1`
        )
        .toArray()[0] ?? null
    )
  }

  /**
   * `create`'s answer for an id that exists or existed: `gone` once deleted;
   * on a space nothing has changed since (`seq` 1), the same answer for an
   * identical retry (same `memberId`, `dhPub`, `tokenHash`, and `wrap`);
   * else `conflict`. Null for an id never used.
   */
  #existingCreate(args: CreateSpaceArgs): SpacesResult<SpaceCreated> | null {
    if (this.#deleted()) return fail('gone')
    const space = this.#space()
    if (!space) return null
    const member = space.seq === 1 ? this.#member(args.memberId) : null
    const retry =
      member != null &&
      space.spaceId === args.spaceId &&
      space.ownerId === args.memberId &&
      (space.mode ?? null) === (args.mode ?? null) &&
      member.dhPub === args.dhPub &&
      member.wrap === args.wrap &&
      timingSafeEqual(args.tokenHash, member.tokenHash)
    return retry ? ok({ seq: 1, joinedAt: member.joinedAt }) : fail('conflict')
  }

  /**
   * The space, for a member whose token hash matches: `gone` when the space
   * doesn't exist (deleted, or never made) or the member isn't on it,
   * `forbidden` for a member's wrong token.
   */
  #authenticate(auth: MemberAuth): SpacesResult<SpaceRow> {
    const space = this.#space()
    if (!space || space.spaceId !== auth.spaceId) return fail('gone')
    const member = this.#member(auth.memberId)
    if (!member) return fail('gone')
    if (!timingSafeEqual(auth.tokenHash, member.tokenHash)) return fail('forbidden')
    return ok(space)
  }

  /** `#authenticate`, then only the owner (`forbidden`). */
  #authenticateOwner(auth: MemberAuth): SpacesResult<SpaceRow> {
    const space = this.#authenticate(auth)
    if (space.ok && space.value.ownerId !== auth.memberId) return fail('forbidden')
    return space
  }

  /** `#authenticate`, then only a scoped space (`bad_request` for one without a mode). */
  #authenticateScoped(auth: MemberAuth): SpacesResult<SpaceRow> {
    const space = this.#authenticate(auth)
    if (space.ok && space.value.mode !== 'scoped') return fail('bad_request')
    return space
  }

  /** `#authenticateScoped`, then only the owner (`forbidden`). */
  #authenticateScopedOwner(auth: MemberAuth): SpacesResult<SpaceRow> {
    const space = this.#authenticateScoped(auth)
    if (space.ok && space.value.ownerId !== auth.memberId) return fail('forbidden')
    return space
  }

  /**
   * A guest link of a scoped space, for a token whose hash matches its
   * verifier (compared in constant time). A space that never existed (or
   * has no mode), an unknown link, and a wrong token are all `not_found`,
   * the same answer. Past that: a deleted space or an ended link is `gone`
   * with `reason: "ended"`, and a link past `expiresAt` `gone` with
   * `reason: "expired"`. A wrong token never ends or counts against a link.
   */
  #authenticateGuest(auth: GuestAuth, now: number): SpacesResult<LinkRow> {
    if (this.#deleted()) return goneBecause('ended')
    const space = this.#space()
    if (!space || space.spaceId !== auth.spaceId || space.mode !== 'scoped')
      return fail('not_found')
    const link = this.#link(auth.linkId)
    // Compared even for an unknown link, so the answer takes as long.
    const matches = timingSafeEqual(auth.verifier, link?.verifier ?? auth.verifier.replace(/./g, '-'))
    if (!link || !matches) return fail('not_found')
    if (link.endedAt != null) return goneBecause('ended')
    if (link.expiresAt <= now) return goneBecause('expired')
    return ok(link)
  }

  #member(memberId: string): MemberRow | null {
    return (
      this.#sql
        .exec<MemberRow>(
          `SELECT member_id AS memberId, dh_pub AS dhPub, token_hash AS tokenHash,
                  wrap, joined_at AS joinedAt, scopes, invited_by AS invitedBy
           FROM member WHERE member_id = ?`,
          memberId
        )
        .toArray()[0] ?? null
    )
  }

  #insertMember(
    member: Pick<MemberRow, 'memberId' | 'dhPub' | 'tokenHash' | 'wrap' | 'scopes' | 'invitedBy'>,
    now: number
  ): void {
    this.#sql.exec(
      `INSERT INTO member (member_id, dh_pub, token_hash, wrap, joined_at,
                           scopes, invited_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      member.memberId,
      member.dhPub,
      member.tokenHash,
      member.wrap,
      now,
      member.scopes,
      member.invitedBy
    )
  }

  /**
   * Takes a member off the space: their token hash, key, and wrap go, and
   * the invites they made that nobody used close, freeing those places. The
   * owner should rekey. In a scoped space it first gives back every street
   * they hold (`#endHold`, which can remove their onward members too) and
   * ends the guest links they made. Returns everyone it removed.
   */
  #dropMember(memberId: string, now: number): string[] {
    const dropped = [memberId]
    if (this.#space()?.mode === 'scoped') {
      for (const scope of this.#heldBy(this.#holds(), memberId))
        dropped.push(...this.#endHold(scope, now, memberId))
      this.#sql.exec(
        'UPDATE link SET ended_at = ? WHERE created_by = ? AND ended_at IS NULL',
        now,
        memberId
      )
    }
    this.#sql.exec('DELETE FROM member WHERE member_id = ?', memberId)
    this.#closeInvites({ invitedBy: memberId }, now)
    this.#sql.exec('UPDATE space SET rekey_needed = 1 WHERE singleton = 1')
    return dropped
  }

  /**
   * Ends the hold on `scope` (`handoff/end`): the hold clears, and a pending
   * hand-off invite closes. Then, for a member's hold: `scope` leaves the
   * scopes of the holder (unless they're a whole member) and of every member
   * the holder invited, and anyone left with no streets is removed (but
   * `except`, whom the caller is removing already); the holder's open
   * invites and guest links naming it close; and if anyone was removed,
   * every open invite closes and the owner should rekey. Returns everyone
   * it removed. The caller advances `seq`.
   */
  #endHold(scope: string, now: number, except?: string): string[] {
    const hold = this.#holds().get(scope)
    if (!hold) return []
    this.#sql.exec('DELETE FROM holder WHERE scope_id = ?', scope)
    if (hold.memberId == null) {
      if (hold.inviteId) this.#closeInvites({ inviteId: hold.inviteId }, now)
      return []
    }
    const holder = hold.memberId
    // Else someone could still join through them with the street.
    this.#closeInvites({ invitedBy: holder, scope }, now)
    this.#sql.exec(
      `UPDATE link SET ended_at = ?
       WHERE created_by = ? AND ended_at IS NULL
         AND EXISTS (SELECT 1 FROM json_each(link.scopes) WHERE value = ?)`,
      now,
      holder,
      scope
    )
    const affected = this.#sql
      .exec<{ memberId: string; scopes: string }>(
        `SELECT member_id AS memberId, scopes FROM member
         WHERE (member_id = ? OR invited_by = ?) AND scopes IS NOT NULL
         ORDER BY joined_at, member_id`,
        holder,
        holder
      )
      .toArray()
    const emptied: string[] = []
    for (const member of affected) {
      const scopes = scopeList(member.scopes)!
      if (!scopes.includes(scope)) continue
      const left = scopes.filter((each) => each !== scope)
      this.#sql.exec(
        'UPDATE member SET scopes = ? WHERE member_id = ?',
        JSON.stringify(left),
        member.memberId
      )
      if (left.length === 0 && member.memberId !== except) emptied.push(member.memberId)
    }
    const removed: string[] = []
    for (const memberId of emptied)
      if (this.#member(memberId)) removed.push(...this.#dropMember(memberId, now))
    if (removed.length) this.#closeInvites('all', now)
    return removed
  }

  /**
   * Closes `which` open invites: each one's id moves to `closed_invite`
   * until it would have expired, so it can't be opened again. Used ones
   * stay until they expire, for a retried join. A pending hand-off whose
   * invite closed is no longer held.
   */
  #closeInvites(which: OpenInvites, now: number): void {
    const [filter, bindings]: [string, string[]] =
      which === 'all'
        ? ['', []]
        : 'inviteId' in which
          ? [' AND invite_id = ?', [which.inviteId]]
          : 'scope' in which
            ? [
                ' AND invited_by = ? AND EXISTS (SELECT 1 FROM json_each(invite.scopes) WHERE value = ?)',
                [which.invitedBy, which.scope],
              ]
            : [' AND invited_by = ?', [which.invitedBy]]
    this.#sql.exec(
      `INSERT OR REPLACE INTO closed_invite (invite_id, expires_at)
       SELECT invite_id, expires_at FROM invite
       WHERE joined_member_id IS NULL${filter}`,
      ...bindings
    )
    this.#sql.exec(
      `DELETE FROM invite WHERE joined_member_id IS NULL${filter}`,
      ...bindings
    )
    this.#clearLapsedHolds(now)
  }

  /**
   * Clears every pending hand-off whose invite is no longer open (closed,
   * or expired), so its street is the owner's again. True when it cleared
   * one; the caller advances `seq`.
   */
  #clearLapsedHolds(now: number): boolean {
    const lapsed = this.#count(
      `SELECT COUNT(*) AS n FROM holder
       WHERE member_id IS NULL AND invite_id NOT IN (
         SELECT invite_id FROM invite WHERE joined_member_id IS NULL AND expires_at > ?)`,
      now
    )
    if (lapsed === 0) return false
    this.#sql.exec(
      `DELETE FROM holder
       WHERE member_id IS NULL AND invite_id NOT IN (
         SELECT invite_id FROM invite WHERE joined_member_id IS NULL AND expires_at > ?)`,
      now
    )
    return true
  }

  // --- Scoped permissions ----------------------------------------------------

  /** Every held street: by a member, or by a pending hand-off invite. */
  #holds(): Map<string, HoldRow> {
    return new Map(
      this.#sql
        .exec<HoldRow>(
          `SELECT scope_id AS scopeId, member_id AS memberId,
                  invite_id AS inviteId, since
           FROM holder ORDER BY scope_id`
        )
        .toArray()
        .map((row) => [row.scopeId, row])
    )
  }

  /** The streets `memberId` holds. */
  #heldBy(holds: Map<string, HoldRow>, memberId: string): Set<string> {
    const held = new Set<string>()
    for (const hold of holds.values()) if (hold.memberId === memberId) held.add(hold.scopeId)
    return held
  }

  #caller(space: SpaceRow, memberId: string): Caller | null {
    const member = this.#member(memberId)
    if (!member) return null
    const scopes = scopeList(member.scopes)
    return {
      memberId,
      isOwner: memberId === space.ownerId,
      scopes: scopes ? new Set(scopes) : null,
      invitedBy: member.invitedBy,
    }
  }

  #access(space: SpaceRow): Access {
    return {
      ownerId: space.ownerId,
      holds: this.#holds(),
      inviteAuthors: new Map(),
      linkCreators: new Map(),
    }
  }

  /**
   * Whether `caller` may write street `scope`. Held by a member: the holder,
   * and members the holder invited who have the street. Held by a pending
   * hand-off: nobody. Not held: the owner, whole members, and members the
   * owner invited who have the street.
   */
  #mayWriteScope(access: Access, caller: Caller, scope: string): boolean {
    const hold = access.holds.get(scope)
    if (hold) {
      if (hold.memberId == null) return false
      if (caller.memberId === hold.memberId) return true
      return caller.invitedBy === hold.memberId && caller.scopes?.has(scope) === true
    }
    if (caller.isOwner || caller.scopes == null) return true
    return caller.invitedBy === access.ownerId && caller.scopes.has(scope)
  }

  /** Whether `caller` may read street `scope`: the whole territory, or a street they have. */
  #mayReadScope(caller: Caller, scope: string): boolean {
    return caller.isOwner || caller.scopes == null || caller.scopes.has(scope)
  }

  #inviteAuthor(access: Access, inviteId: string): string | null {
    if (!access.inviteAuthors.has(inviteId))
      access.inviteAuthors.set(
        inviteId,
        this.#sql
          .exec<{ by: string }>(
            'SELECT invited_by AS by FROM invite_author WHERE invite_id = ?',
            inviteId
          )
          .toArray()[0]?.by ?? null
      )
    return access.inviteAuthors.get(inviteId)!
  }

  #linkCreator(access: Access, linkId: string): string | null {
    if (!access.linkCreators.has(linkId))
      access.linkCreators.set(linkId, this.#link(linkId)?.createdBy ?? null)
    return access.linkCreators.get(linkId)!
  }

  /**
   * Whether `caller` may put a record of class `record` in a scoped space
   * (the protocol's "Who reads and writes which records").
   */
  #mayWrite(access: Access, caller: Caller, record: ScopedRecordClass): boolean {
    switch (record.kind) {
      case 'header':
      case 'keys':
        return caller.isOwner
      case 'street':
      case 'inScope':
        return this.#mayWriteScope(access, caller, record.scope)
      case 'territory':
        return caller.isOwner || caller.scopes == null
      case 'member':
        return record.id === caller.memberId
      case 'invite':
        return caller.isOwner || this.#inviteAuthor(access, record.id) === caller.memberId
      case 'linkKeys':
        return this.#linkCreator(access, record.id) === caller.memberId
    }
  }

  /** Whether `caller` may read a record of class `record` in a scoped space. */
  #mayRead(access: Access, caller: Caller, record: ScopedRecordClass): boolean {
    switch (record.kind) {
      case 'header':
      case 'keys':
      case 'member':
        return true
      case 'street':
      case 'inScope':
        return this.#mayReadScope(caller, record.scope)
      case 'territory':
        return caller.isOwner || caller.scopes == null
      case 'invite':
        return (
          caller.isOwner ||
          caller.scopes == null ||
          this.#inviteAuthor(access, record.id) === caller.memberId
        )
      case 'linkKeys':
        return (
          caller.isOwner ||
          caller.scopes == null ||
          this.#linkCreator(access, record.id) === caller.memberId
        )
    }
  }

  /**
   * Whether a scoped invite still gives only what its inviter may give: a
   * holder's invite, streets they still hold; a hand-off invite, a street
   * it still holds.
   */
  #inviteStillGood(space: SpaceRow, invite: InviteRow): boolean {
    const holds = this.#holds()
    const scopes = scopeList(invite.scopes)
    if (invite.handoff === 1)
      return scopes != null && holds.get(scopes[0])?.inviteId === invite.inviteId
    if (invite.invitedBy === space.ownerId) return true
    const held = this.#heldBy(holds, invite.invitedBy)
    return scopes != null && scopes.every((scope) => held.has(scope))
  }

  #link(linkId: string): LinkRow | null {
    return (
      this.#sql
        .exec<LinkRow>(
          `SELECT link_id AS linkId, created_by AS createdBy, verifier, scopes,
                  created_at AS createdAt, expires_at AS expiresAt, ended_at AS endedAt
           FROM link WHERE link_id = ?`,
          linkId
        )
        .toArray()[0] ?? null
    )
  }

  /**
   * The streets a guest link reads and writes now: those of its scopes its
   * creator may write now. None once its creator is off the space.
   */
  #guestScopes(space: SpaceRow, link: LinkRow): Set<string> {
    const creator = this.#caller(space, link.createdBy)
    if (!creator) return new Set()
    const access = this.#access(space)
    return new Set(
      scopeList(link.scopes)!.filter((scope) => this.#mayWriteScope(access, creator, scope))
    )
  }

  /**
   * `rate_limited` when a link has used its guest `kind` requests (`sync`
   * or `put`) for the rolling minute; else counts this one. Drops every
   * link's counts older than the minute.
   */
  #refuseOverLinkRequests(
    linkId: string,
    kind: 'sync' | 'put',
    now: number
  ): SpacesFailure | null {
    this.#sql.exec(
      'DELETE FROM link_request WHERE at <= ?',
      now - LIMITS.guestLinkWindowMs
    )
    const buckets = this.#sql
      .exec<WindowBucket>(
        `SELECT at AS start, count FROM link_request
         WHERE link_id = ? AND kind = ? ORDER BY at`,
        linkId,
        kind
      )
      .toArray()
    const limit = kind === 'sync' ? LIMITS.guestLinkSyncs : LIMITS.guestLinkPuts
    const wait = rollingWindowWaitMs(buckets, 1, limit, LIMITS.guestLinkWindowMs, now)
    if (wait != null) {
      logSpacesLimitHit(`spaces/guest/${kind}`, kind === 'sync' ? 'guestLinkSyncs' : 'guestLinkPuts')
      return fail('rate_limited', retryAfterSeconds(wait))
    }
    this.#sql.exec(
      `INSERT INTO link_request (link_id, kind, at, count) VALUES (?, ?, ?, 1)
       ON CONFLICT (link_id, kind, at) DO UPDATE SET count = count + 1`,
      linkId,
      kind,
      now
    )
    return null
  }

  /** `rate_limited` when `count` more records would pass a link's records a rolling day. */
  #refuseOverLinkRecords(linkId: string, count: number, now: number): SpacesFailure | null {
    const windowHours = Math.round(LIMITS.guestLinkRecordWindowMs / HOUR_MS)
    this.#sql.exec(
      'DELETE FROM link_record_hour WHERE hour <= ?',
      Math.floor(now / HOUR_MS) - windowHours
    )
    const buckets = this.#sql
      .exec<{ hour: number; records: number }>(
        'SELECT hour, records FROM link_record_hour WHERE link_id = ? ORDER BY hour',
        linkId
      )
      .toArray()
      .map((bucket) => ({ start: bucket.hour * HOUR_MS, count: bucket.records }))
    const wait = rollingWindowWaitMs(
      buckets,
      count,
      LIMITS.guestLinkRecordsPerDay,
      windowHours * HOUR_MS,
      now
    )
    if (wait == null) return null
    logSpacesLimitHit('spaces/guest/put', 'guestLinkRecordsPerDay')
    return fail('rate_limited', retryAfterSeconds(wait))
  }

  /** Whether `inviteId` was closed before it was used, and hasn't expired. */
  #inviteClosed(inviteId: string): boolean {
    return (
      this.#count(
        'SELECT COUNT(*) AS n FROM closed_invite WHERE invite_id = ?',
        inviteId
      ) > 0
    )
  }

  #invite(inviteId: string): InviteRow | null {
    return (
      this.#sql
        .exec<InviteRow>(
          `SELECT invite_id AS inviteId, invited_by AS invitedBy,
                  join_verifier AS joinVerifier, expires_at AS expiresAt,
                  bad_joins AS badJoins, joined_member_id AS joinedMemberId,
                  joined_token_hash AS joinedTokenHash, scopes, handoff
           FROM invite WHERE invite_id = ?`,
          inviteId
        )
        .toArray()[0] ?? null
    )
  }

  #record(recordId: string): StoredRecord | null {
    return (
      this.#sql
        .exec<StoredRecord>(
          `SELECT stamp, deleted, blob_hash AS blobHash, blob_bytes AS bytes
           FROM record WHERE record_id = ?`,
          recordId
        )
        .toArray()[0] ?? null
    )
  }

  /** Writes `record` as the version the space holds, at `seq`, under its street's `scope`. */
  #storeRecord(record: PutRecordArgs, seq: number, scope: string | null = null): void {
    this.#sql.exec(
      `INSERT INTO record (record_id, epoch, stamp, deleted, blob, blob_hash,
                           blob_bytes, seq, scope)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (record_id) DO UPDATE SET
         epoch = excluded.epoch, stamp = excluded.stamp,
         deleted = excluded.deleted, blob = excluded.blob,
         blob_hash = excluded.blob_hash, blob_bytes = excluded.blob_bytes,
         seq = excluded.seq, scope = excluded.scope`,
      record.recordId,
      record.epoch,
      record.stamp,
      record.deleted ? 1 : 0,
      record.blob,
      record.blobHash,
      decodedLength(record.blob),
      seq,
      scope
    )
  }

  /**
   * What a put would do, without writing: each record's verdict in order (a
   * record put twice meets its own earlier version), how many records are
   * new to the space, and the change in decoded blob bytes (a replaced
   * version gives its bytes back).
   */
  #plan(records: PutRecordArgs[]): {
    verdicts: Verdict[]
    added: number
    bytes: number
  } {
    const pending = new Map<string, StoredRecord>()
    let added = 0
    let bytes = 0
    const verdicts = records.map((record) => {
      const held = pending.get(record.recordId) ?? this.#record(record.recordId)
      const verdict = held ? compareVersions(record, held) : 'newer'
      if (verdict === 'newer') {
        const size = decodedLength(record.blob)
        if (!held) added++
        bytes += size - (held?.bytes ?? 0)
        pending.set(record.recordId, {
          stamp: record.stamp,
          deleted: record.deleted ? 1 : 0,
          blobHash: record.blobHash,
          bytes: size,
        })
      }
      return verdict
    })
    return { verdicts, added, bytes }
  }

  /**
   * `limit` when `added` more records or `bytes` more decoded bytes would
   * take the space past its record or byte cap (from the running counts, so
   * nothing scans the table); or null.
   */
  #refuseOverCaps(
    op: string,
    space: SpaceRow,
    plan: { added: number; bytes: number }
  ): SpacesFailure | null {
    if (space.recordCount + plan.added > LIMITS.records) {
      logSpacesLimitHit(op, 'records')
      return fail('limit')
    }
    if (space.blobBytes + plan.bytes > LIMITS.spaceBytes) {
      logSpacesLimitHit(op, 'spaceBytes')
      return fail('limit')
    }
    return null
  }

  #count(query: string, ...bindings: (string | number)[]): number {
    return this.#sql.exec<{ n: number }>(query, ...bindings).one().n
  }

  #memberCount(): number {
    return this.#count('SELECT COUNT(*) AS n FROM member')
  }

  #openInviteCount(now: number): number {
    return this.#count(
      'SELECT COUNT(*) AS n FROM invite WHERE joined_member_id IS NULL AND expires_at > ?',
      now
    )
  }

  /**
   * Expired invites go, used and closed ones included: a retried join can't
   * outlive them, and a retried `invite/create` can't name a past expiry. A
   * pending hand-off whose invite expired is no longer held, which advances
   * `seq`.
   */
  #prune(now: number): void {
    this.#sql.exec('DELETE FROM invite WHERE expires_at <= ?', now)
    this.#sql.exec('DELETE FROM closed_invite WHERE expires_at <= ?', now)
    if (this.#clearLapsedHolds(now)) this.#advance()
  }

  #touch(now: number): void {
    this.#sql.exec('UPDATE space SET last_active_at = ? WHERE singleton = 1', now)
  }

  #advance(): number {
    this.#sql.exec('UPDATE space SET seq = seq + 1 WHERE singleton = 1')
    this.#advanced = true
    return this.#space()?.seq ?? 0
  }

  /**
   * How long until `memberId` may put again, past their puts a rolling
   * minute; or null. Drops every member's counts older than the minute.
   */
  #memberPutWaitMs(memberId: string, now: number): number | null {
    this.#sql.exec(
      'DELETE FROM member_put WHERE at <= ?',
      now - LIMITS.memberPutWindowMs
    )
    const buckets = this.#sql
      .exec<WindowBucket>(
        'SELECT at AS start, puts AS count FROM member_put WHERE member_id = ? ORDER BY at',
        memberId
      )
      .toArray()
    return rollingWindowWaitMs(
      buckets,
      1,
      LIMITS.memberPuts,
      LIMITS.memberPutWindowMs,
      now
    )
  }

  #countPut(memberId: string, now: number): void {
    this.#sql.exec(
      `INSERT INTO member_put (member_id, at, puts) VALUES (?, ?, 1)
       ON CONFLICT (member_id, at) DO UPDATE SET puts = puts + 1`,
      memberId,
      now
    )
  }

  /**
   * `rate_limited` when `count` more records would pass the space's records
   * a rolling day, until enough of the oldest hours leave the window; or
   * null.
   */
  #refuseOverDailyRecords(op: string, count: number, now: number): SpacesFailure | null {
    const windowHours = Math.round(LIMITS.spaceRecordWindowMs / HOUR_MS)
    this.#sql.exec(
      'DELETE FROM put_hour WHERE hour <= ?',
      Math.floor(now / HOUR_MS) - windowHours
    )
    const buckets = this.#sql
      .exec<{ hour: number; records: number }>(
        'SELECT hour, records FROM put_hour ORDER BY hour'
      )
      .toArray()
      .map((bucket) => ({ start: bucket.hour * HOUR_MS, count: bucket.records }))
    const wait = rollingWindowWaitMs(
      buckets,
      count,
      LIMITS.spaceRecordsPerDay,
      windowHours * HOUR_MS,
      now
    )
    if (wait == null) return null
    logSpacesLimitHit(op, 'spaceRecordsPerDay')
    return fail('rate_limited', retryAfterSeconds(wait))
  }

  /**
   * Records with `seq > since` that `filter` lets through, in `seq` order,
   * up to `limit` and the page's size budget. Records are read in whole
   * chunks (`readSeqPage`), so a page cut short leaves no cursor open to
   * block a later `#wipe`.
   */
  #readRecords(
    since: number,
    limit: number,
    filter: RecordFilter = EVERY_RECORD
  ): { records: SpaceRecordView[]; more: boolean } {
    let chars = 0
    const page = readSeqPage(
      (after, count) =>
        this.#sql
          .exec<RecordRow>(
            `SELECT record_id AS recordId, epoch, stamp, deleted, blob, seq
             FROM record WHERE seq > ?${filter.where} ORDER BY seq LIMIT ?`,
            after,
            ...filter.bindings,
            count
          )
          .toArray(),
      since,
      (row, taken) => {
        if (
          taken.length === limit ||
          (taken.length > 0 && chars + row.blob.length > LIMITS.syncChars)
        )
          return false
        chars += row.blob.length
        return true
      },
      // One past `limit` tells whether there's more.
      Math.min(SEQ_PAGE_CHUNK, limit + 1),
      filter.keep
    )
    return {
      records: page.rows.map((row) => ({ ...row, deleted: row.deleted === 1 })),
      more: page.more,
    }
  }

  /**
   * Which records `caller` reads in a scoped space: the SQL leaves out
   * streets a street member doesn't have, and `#mayRead` decides the rest.
   */
  #scopedFilter(access: Access, caller: Caller): RecordFilter {
    const keep = (row: RecordRow) => {
      const record = classifyScopedRecord(row.recordId)
      return record != null && this.#mayRead(access, caller, record)
    }
    if (caller.isOwner || caller.scopes == null) return { where: '', bindings: [], keep }
    return {
      where: ' AND (scope IS NULL OR scope IN (SELECT value FROM json_each(?)))',
      bindings: [JSON.stringify([...caller.scopes])],
      keep,
    }
  }

  /**
   * `sync`'s answer for `memberId`; see `SpaceSyncView`. A scoped space's
   * adds its mode, each member's streets and inviter, holders, and links,
   * and leaves out records the member may not read; invites and links are
   * everyone's for the owner and whole members, and only their own for
   * anyone else.
   */
  #snapshot(
    space: SpaceRow,
    memberId: string,
    since: number,
    limit: number,
    now: number
  ): SpaceSyncView {
    const scoped = space.mode === 'scoped'
    const access = scoped ? this.#access(space) : null
    const caller = scoped ? this.#caller(space, memberId)! : null
    const page = this.#readRecords(
      since,
      limit,
      scoped ? this.#scopedFilter(access!, caller!) : EVERY_RECORD
    )
    const records = page.records
    const base: SpaceSyncView = {
      seq: page.more ? records[records.length - 1].seq : space.seq,
      epoch: space.epoch,
      wrap: this.#member(memberId)?.wrap ?? '',
      ownerId: space.ownerId,
      members: [],
      invites: [],
      rekeyNeeded: space.rekeyNeeded === 1,
      records,
      more: page.more,
    }
    if (!scoped) {
      base.members = this.#sql
        .exec<{ memberId: string; dhPub: string; joinedAt: number }>(
          `SELECT member_id AS memberId, dh_pub AS dhPub, joined_at AS joinedAt
           FROM member ORDER BY joined_at, member_id`
        )
        .toArray()
      base.invites = this.#sql
        .exec<{ inviteId: string; invitedBy: string; expiresAt: number }>(
          `SELECT invite_id AS inviteId, invited_by AS invitedBy, expires_at AS expiresAt
           FROM invite WHERE joined_member_id IS NULL AND expires_at > ?
           ORDER BY created_at, invite_id`,
          now
        )
        .toArray()
      return base
    }
    const everything = caller!.isOwner || caller!.scopes == null
    const own = everything ? '' : ' AND invited_by = ?'
    const ownLinks = everything ? '' : ' AND created_by = ?'
    const mine = everything ? [] : [memberId]
    return {
      ...base,
      mode: 'scoped',
      members: this.#sql
        .exec<{ memberId: string; dhPub: string; joinedAt: number; scopes: string | null; invitedBy: string | null }>(
          `SELECT member_id AS memberId, dh_pub AS dhPub, joined_at AS joinedAt,
                  scopes, invited_by AS invitedBy
           FROM member ORDER BY joined_at, member_id`
        )
        .toArray()
        .map((row) => ({ ...row, scopes: scopeList(row.scopes) })),
      invites: this.#sql
        .exec<{ inviteId: string; invitedBy: string; expiresAt: number; scopes: string | null; handoff: number }>(
          `SELECT invite_id AS inviteId, invited_by AS invitedBy, expires_at AS expiresAt,
                  scopes, handoff
           FROM invite WHERE joined_member_id IS NULL AND expires_at > ?${own}
           ORDER BY created_at, invite_id`,
          now,
          ...mine
        )
        .toArray()
        .map((row) => ({ ...row, scopes: scopeList(row.scopes), handoff: row.handoff === 1 })),
      holders: [...access!.holds.values()],
      links: this.#sql
        .exec<LinkRow>(
          `SELECT link_id AS linkId, created_by AS createdBy, scopes,
                  created_at AS createdAt, expires_at AS expiresAt, ended_at AS endedAt
           FROM link WHERE expires_at > ?${ownLinks}
           ORDER BY created_at, link_id`,
          now - LIMITS.linkListedMs,
          ...mine
        )
        .toArray()
        .map((row) => ({
          linkId: row.linkId,
          createdBy: row.createdBy,
          scopes: scopeList(row.scopes)!,
          createdAt: row.createdAt,
          expiresAt: row.expiresAt,
          endedAt: row.endedAt,
        })),
    }
  }

  #liveSockets(): WebSocket[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws.readyState === SOCKET_OPEN)
  }

  #signal(ws: WebSocket, message: SpacesLiveMessage): void {
    try {
      ws.send(JSON.stringify(message))
    } catch {
      // A socket mid-close; its close handler cleans up.
    }
  }

  /** `changed` with the head to every open socket. Never fails the write. */
  #broadcast(): void {
    try {
      const sockets = this.#liveSockets()
      if (!sockets.length) return
      const message: SpacesLiveMessage = {
        type: 'changed',
        seq: this.#space()?.seq ?? 0,
      }
      for (const ws of sockets) this.#signal(ws, message)
    } catch {
      // The write already committed; a socket problem must not surface.
    }
  }

  /** Closes `members`' sockets (everyone's for null) with `4001 "gone"`. */
  #closeSockets(members: ReadonlySet<string> | null): void {
    const { code, reason } = SPACES_LIVE_CLOSE.gone
    for (const ws of this.#liveSockets()) {
      const memberId = attachmentOf(ws)?.memberId
      if (members == null || (memberId != null && members.has(memberId)))
        closeQuietly(ws, code, reason)
    }
  }
}
