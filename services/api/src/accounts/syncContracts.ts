/**
 * Cloud Sync's wire constants (witness-work ADR 0030, `docs/accounts-protocol.md`,
 * "Sync"): slot ids, R2 keys, headers, the live socket's messages, and the
 * abuse limits, each sized from the heaviest real use.
 */
import { LIVE_EXPIRED_CLOSE } from '../liveSubprotocol'

const SECOND_MS = 1_000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * 60 * MINUTE_MS
const MIB = 1_024 * 1_024

export const SYNC_LIMITS = {
  /** One snapshot: backup's cap. Real datasets with notes run to a few MiB. */
  blobBytes: 20 * MIB,
  /**
   * Slots an account: 10 live sessions plus devices that left within the
   * 30-day retention, with room to spare.
   */
  slots: 20,
  /**
   * One put a slot this often. The engine debounces pushes by 5 s, so a
   * device typing without pause puts every 5 s; retries back off from 5 s.
   */
  slotPutIntervalMs: 2 * SECOND_MS,
  /**
   * Puts an account a rolling day: 5 devices each pushing every 5 s for an
   * hour straight is 3,600; a real heavy day is ~100 a device (~500), so
   * this only stops runaway clients. Refusals tell the client when to retry.
   */
  accountPutsPerDay: 1_000,
  /** Bytes an account a rolling day: those ~500 puts at ~4 MiB ≈ 2 GiB. */
  accountBytesPerDay: 2 * 1_024 * MIB,
  /** A put whose commit never came (the Worker died) frees its slot after this. */
  putReservationMs: 2 * MINUTE_MS,
  /** Live sockets an account: one a device, 10 sessions, twice over. */
  liveSockets: 20,
  /** A slot whose writer's session ended is kept this long after its last put. */
  endedSessionRetentionMs: 30 * DAY_MS,
  /** Any slot is kept at most this long after its last put (R2's rule too). */
  maxRetentionMs: 400 * DAY_MS,
  /** The retention alarm's period while the account has slots. */
  retentionCheckMs: DAY_MS,
  /** A Cloud Sync request lapses this long after it was last asked for. */
  requestLapseMs: 30 * DAY_MS,
  /**
   * A re-seal put (`x-ww-reseal: 1`) is allowed this long after the
   * account's last key change (ADR 0039).
   */
  resealWindowMs: 7 * DAY_MS,
} as const

/** The device's sync id: the `<deviceId>` in `witness-work-<deviceId>.json`. */
export const SYNC_SLOT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

export const isSyncSlotId = (value: unknown): value is string =>
  typeof value === 'string' && SYNC_SLOT_ID_PATTERN.test(value)

/** `b64u(SHA-256(blob))`, the slot's ETag. */
export const SYNC_ETAG_PATTERN = /^[A-Za-z0-9_-]{43}$/

export const syncPrefix = (accountId: string): string => `v1/${accountId}/`

export const syncObjectKey = (accountId: string, slotId: string): string =>
  `${syncPrefix(accountId)}${slotId}`

export const SYNC_HEADERS = {
  slotId: 'x-ww-slot-id',
  sha256: 'x-ww-sha256',
  updatedAt: 'x-ww-updated-at',
  /**
   * A live upgrade's admission, on the request the Worker forwards to the DO:
   * a random one-use id `admitLive` gave it. Who the socket is for (the
   * account, the session, the slot, the expiry) goes to the DO in that call,
   * never in a header: Workers Logs record every request header, the
   * forwarded request's too. Set only by the Worker.
   */
  admission: 'x-ww-sync-admission',
  /**
   * `1` on a `sync/put` that re-seals a slot under a new account key (ADR
   * 0039): the slot keeps its session, platform, and `updatedAt`.
   */
  reseal: 'x-ww-reseal',
  /**
   * On a `sync/put` that folds the slot's tail into its base (witness-work
   * ADR 0060 §5): the sequence of the slot's last change the base includes.
   * The slot's changes up to it are deleted and it becomes the slot's floor.
   * Without it the whole tail goes and every device reads the base.
   */
  coversSequence: 'x-ww-covers-sequence',
  /**
   * `1` on a `sync/list` from an app that reads record changes. A list
   * without it is a session that reads only snapshots (`snapshotReaders`),
   * until that session reads changes or ends.
   */
  readsChanges: 'x-ww-sync-changes',
} as const

/**
 * Record changes (witness-work ADR 0060): a device sends each edit as a
 * small sealed change, kept in the account's Durable Object until the
 * device folds it into its base.
 */
export const SYNC_CHANGE_LIMITS = {
  /** One sealed change. A larger set of edits is published as the base. */
  blobBytes: 256 * 1_024,
  /** A sealed change is padded to a multiple of this, so its size says little. */
  blockBytes: 256,
  /** Changes a slot's tail holds; the device folds them into its base at 50. */
  tailChanges: 200,
  /** Bytes a slot's tail holds. 20 slots are 20 MiB at the very most. */
  tailBytes: MIB,
  /**
   * Changes a slot a minute. The app sends at most one every 2 s while edits
   * keep coming (30), so twice that only stops a runaway client.
   */
  slotChangesPerMinute: 60,
  /** Changes an account a rolling day: an hour of typing on a device is ~1,800. */
  accountChangesPerDay: 3_000,
  /** Sealed bytes a catch-up page holds before it says `more`; always one change. */
  pageBytes: 256 * 1_024,
  /** Changes a catch-up page holds. */
  pageChanges: 500,
  /** A session that listed without reading changes counts toward `snapshotReaders` this long. */
  snapshotReaderMs: 14 * DAY_MS,
  /** A session's snapshot-only list is noted at most this often. */
  snapshotReaderNoteMs: HOUR_MS,
  /** A catch-up marks the caller's slot as seen at most this often (retention). */
  seenNoteMs: DAY_MS,
  /**
   * A socket gets changes while its session was confirmed live within this:
   * an access token's life, so a socket reads no longer than its token could.
   */
  liveConfirmMs: 15 * MINUTE_MS,
  /** An ended session is refused this long: its last token's life, and the skew. */
  endedSessionMs: 16 * MINUTE_MS,
  /** A socket message a device sends (`sync`) is at most this long. */
  messageChars: 256,
  /** A live upgrade follows its admission within this. */
  admissionMs: 30 * SECOND_MS,
} as const

/** A change's id: 16 random bytes the device made, base64url. */
export const SYNC_CHANGE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/

export const isSyncChangeId = (value: unknown): value is string =>
  typeof value === 'string' && SYNC_CHANGE_ID_PATTERN.test(value)

/**
 * The byte length of a sealed change in unpadded base64url, or null when it
 * isn't one: not base64url, empty, over `blobBytes`, or not a whole number
 * of `blockBytes` blocks.
 */
export const sealedChangeBytes = (blob: unknown): number | null => {
  if (typeof blob !== 'string' || !/^[A-Za-z0-9_-]+$/.test(blob)) return null
  if (blob.length % 4 === 1) return null
  const bytes = Math.floor((blob.length * 3) / 4)
  const { blobBytes, blockBytes } = SYNC_CHANGE_LIMITS
  return bytes > 0 && bytes <= blobBytes && bytes % blockBytes === 0
    ? bytes
    : null
}

/** A change as a catch-up and the live socket give it. */
export type SyncChangeView = {
  sequence: number
  slotId: string
  changeId: string
  /** The key epoch of the session that sealed it (or re-sealed it). */
  keyEpoch: number
  createdAt: number
  /** The sealed change, unpadded base64url. */
  blob: string
}

/** A slot in a catch-up: `sync/list`'s, less `live`, plus the tail's facts. */
export type SyncSlotCatchUp = {
  slotId: string
  etag: string
  size: number
  updatedAt: number
  platform: string | null
  /** A device whose cursor is behind this reads the slot's base. */
  floorSequence: number
  /** The slot's last base put or change. */
  changedAt: number
}

/** What a device missed since `afterSequence` (ADR 0060 §4). */
export type SyncCatchUp = {
  /** The account's sequence: the device's cursor once it merged all of this. */
  sequence: number
  slots: SyncSlotCatchUp[]
  /** Other slots' changes after `afterSequence`, oldest first. */
  changes: SyncChangeView[]
  /** More changes follow: ask again from the last one's sequence. */
  more: boolean
  /** A device read only snapshots lately: also write the base after a change. */
  snapshotReaders: boolean
  /** The account's standing Cloud Sync request (`GET /sync`'s). */
  requestedAt: number | null
  /** Whether photo puts are on (`GET /sync`'s). */
  photos: boolean
}

/** What a device sends on the live socket: a catch-up from its cursor. */
export type SyncLiveRequest = { type: 'sync'; afterSequence: number }

/**
 * Live socket messages. `hello` and `changed` are notices with the account's
 * `seq`. A socket that asked for a catch-up (`SyncLiveRequest`) also gets
 * each other slot's change as it's put, sealed (ADR 0060 §6).
 */
export type SyncLiveMessage =
  | { type: 'hello' | 'changed'; seq: number }
  | { type: 'change'; change: SyncChangeView }
  | ({ type: 'sync' } & SyncCatchUp)
  | { type: 'error'; error: 'changes_disabled' | 'unavailable' | 'bad_request' }

export const SYNC_LIVE_CLOSE = {
  replaced: { code: 4000, reason: 'replaced' },
  /** A browser socket's token expired (`LIVE_EXPIRED_CLOSE`). */
  expired: LIVE_EXPIRED_CLOSE,
  /**
   * The account key changed (ADR 0039): every socket of the account closes,
   * and the device that changed it reconnects with its new token.
   */
  keyChanged: { code: 4005, reason: 'key_changed' },
  /** The socket's session ended (signed out, revoked, replaced). */
  sessionEnded: { code: 4006, reason: 'session_ended' },
} as const

/** `If-Match`: a quoted ETag, or `*` (the slot exists). */
export type SyncIfMatch = { etag: string } | { any: true } | null

/** Null without the header; undefined when it's malformed. */
export const parseIfMatch = (header: string | null): SyncIfMatch | undefined => {
  if (header == null) return null
  const value = header.trim()
  if (value === '*') return { any: true }
  const match = /^(?:W\/)?"([A-Za-z0-9_-]{43})"$/.exec(value)
  return match ? { etag: match[1] } : undefined
}

/**
 * Cloud Sync photos (witness-work ADR 0040 §6, `docs/cloud-sync-photos.md`):
 * end-to-end encrypted blobs stored once under the account, each under an
 * immutable keyed name, in R2 `ACCOUNT_PHOTOS`.
 */
export const SYNC_PHOTO_LIMITS = {
  /** One photo: an original from a modern phone camera runs to ~10 MiB. */
  blobBytes: 25 * MIB,
  /** Live photo blobs an account; `SYNC_PHOTO_LIMIT_BYTES` overrides it. */
  storageBytes: 2_000_000_000,
  /** Live photos an account: ~2,000 contacts' and notes' photos, 10 times over. */
  livePhotos: 20_000,
  /**
   * Puts an account a rolling day, `existed` ones included: a first sync of
   * the largest account fits; a runaway client stops here.
   */
  accountPutsPerDay: 20_000,
  /** Bytes stored by puts an account a rolling day: twice the storage limit. */
  accountPutBytesPerDay: 4 * 1_024 * MIB,
  /** Gets an account a rolling day: a few devices each downloading every photo. */
  accountGetsPerDay: 50_000,
  /**
   * Space a put reserved is freed this long after it began, if its commit never
   * came: at least this, and longer for a large body (`photoPutReservationMs`).
   */
  putReservationMs: 2 * MINUTE_MS,
  /** A put's reservation is never longer than this. */
  putReservationMaxMs: 10 * MINUTE_MS,
  /** Time a put's reservation allows for its request to start, besides its body. */
  putSetupMs: MINUTE_MS,
  /** The slowest upload a reservation waits for, a second: about 400 kbit/s. */
  putMinBytesPerSecond: 50 * 1_024,
  /** A deleted photo's R2 object is purged this long after the delete. */
  deletedRetentionMs: 30 * DAY_MS,
  /** An account with no slot this long has its photos deleted by the next alarm. */
  noSlotMs: DAY_MS,
  /** Photos a `photos/list` page: a typical account's photos in one page, ~200 KB of JSON. */
  listPage: 1_000,
  /** Names a `photos/delete`: one cleanup pass's photos in a few calls. */
  deleteNames: 100,
  /** A sealed meta's characters: the padded 256-byte JSON sealed is ~395. */
  metaChars: 512,
} as const

/**
 * How long a put of `size` bytes holds its reservation: a minute to start plus
 * the body at `putMinBytesPerSecond`, between `putReservationMs` and
 * `putReservationMaxMs`. A 25 MiB blob on a slow phone connection takes
 * minutes, and the app waits for just this long (less a margin).
 */
export const photoPutReservationMs = (size: number): number =>
  Math.min(
    SYNC_PHOTO_LIMITS.putReservationMaxMs,
    Math.max(
      SYNC_PHOTO_LIMITS.putReservationMs,
      SYNC_PHOTO_LIMITS.putSetupMs +
        Math.ceil((size / SYNC_PHOTO_LIMITS.putMinBytesPerSecond) * 1_000)
    )
  )

/** `b64u(HMAC-SHA256(nameKey, filename))`: what the server knows a photo by. */
export const SYNC_PHOTO_NAME_PATTERN = /^[A-Za-z0-9_-]{43}$/

export const isSyncPhotoName = (value: unknown): value is string =>
  typeof value === 'string' && SYNC_PHOTO_NAME_PATTERN.test(value)

/**
 * The sealed filename, stored as given: unpadded base64url (no length that
 * leaves one character over, which no bytes encode to), at most `metaChars`.
 */
export const isSyncPhotoMeta = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= SYNC_PHOTO_LIMITS.metaChars &&
  value.length % 4 !== 1 &&
  /^[A-Za-z0-9_-]+$/.test(value)

/** A put's object: `putId` is random per put, so no two puts share a key. */
export const syncPhotoObjectKey = (
  accountId: string,
  name: string,
  putId: string
): string => `${syncPrefix(accountId)}${name}/${putId}`

export const SYNC_PHOTO_HEADERS = {
  name: 'x-ww-photo-name',
  meta: 'x-ww-photo-meta',
  sha256: SYNC_HEADERS.sha256,
  createdAt: 'x-ww-created-at',
} as const

/** The account's storage limit: `SYNC_PHOTO_LIMIT_BYTES` when it's a positive integer. */
export const syncPhotoLimitBytes = (env: {
  SYNC_PHOTO_LIMIT_BYTES?: string
}): number => {
  const value = Number(env.SYNC_PHOTO_LIMIT_BYTES?.trim() || NaN)
  return Number.isSafeInteger(value) && value > 0
    ? value
    : SYNC_PHOTO_LIMITS.storageBytes
}

/** `usage` in every photo answer. */
export type SyncPhotoUsage = { bytes: number; count: number; limit: number }

export type SyncPhotoView = {
  name: string
  size: number
  sha256: string
  createdAt: number
}

export type SyncPhotoListed = SyncPhotoView & { meta: string }
