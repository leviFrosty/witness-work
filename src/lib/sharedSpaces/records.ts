import { fromB64u, fromUtf8, toB64u, utf8 } from '@/lib/bytes'
import {
  deriveRecordKey as deriveRecordKeyBytes,
  openXChaCha,
  RECORD_ID_PATTERN,
  SPACE_ID_PATTERN,
  sealedLength,
  sealXChaCha,
  SpaceOpenError,
} from '@/lib/sharedSpaces/crypto'

/**
 * A space's records (docs/shared-cars-protocol.md, "Records"): `blob =
 * b64u(0x01 ‖ nonce[24] ‖ XChaCha20-Poly1305(recordKey_e, nonce, UTF-8(JSON),
 * aad))`, whose AAD names the space, the key epoch, the record, whether it's a
 * deletion, and its stamp. So the server picks which version to keep, but it
 * can't change a record's stamp or deletion flag, move it, or forge one.
 *
 * Every plaintext is `{ "v": 1, "kind": "<kind>", "data": { … } }`; a deletion
 * is `{ "v": 1, "kind": "<kind>" }`. Three kinds belong to every space and live
 * here: `member` (`m.<memberId>`), `invite` (`i.<inviteId>`) and `keys`
 * (`k.<e>`). A space's own kinds (a car's) are its user's to define.
 */

/**
 * Each space key's record key, derived once per key: a full sync opens
 * thousands of records under one key. Keyed by the key's bytes, so a keyring
 * that hands out one array per key (`createSpaceKeyring`) hits it every time.
 */
const recordKeys = new WeakMap<Uint8Array, Uint8Array>()

/** Epoch `e`'s record key, `HKDF(K_e, "", "ww-spaces/v1/record", 32)`, cached. */
export function deriveRecordKey(spaceKey: Uint8Array): Uint8Array {
  let recordKey = recordKeys.get(spaceKey)
  if (!recordKey) {
    recordKey = deriveRecordKeyBytes(spaceKey)
    recordKeys.set(spaceKey, recordKey)
  }
  return recordKey
}

/** The plaintext's own version; a newer one is from a newer app. */
export const SPACE_PLAINTEXT_VERSION = 1

/** The server's cap on one record's blob, decoded. */
export const RECORD_BLOB_MAX_BYTES = 16 * 1024

/** The most UTF-8 JSON a record's plaintext may hold under the cap. */
export const RECORD_PLAINTEXT_MAX_BYTES =
  RECORD_BLOB_MAX_BYTES - sealedLength(0)

/** Where a record sits, and the two facts the server compares: all in its AAD. */
export type SpaceRecordAddress = {
  spaceId: string
  epoch: number
  recordId: string
  deleted: boolean
  /** The record's `updatedAt`, or when it was deleted (integer epoch ms). */
  stamp: number
}

export type SpacePlaintext = {
  v: number
  kind: string
  /** Absent on a deletion. */
  data?: Record<string, unknown>
}

export const recordAad = ({
  spaceId,
  epoch,
  recordId,
  deleted,
  stamp,
}: SpaceRecordAddress) =>
  utf8(
    `ww-spaces/v1/record\n${spaceId}\n${epoch}\n${recordId}\n${deleted ? '1' : '0'}\n${stamp}`
  )

function checkAddress(address: SpaceRecordAddress) {
  if (!SPACE_ID_PATTERN.test(address.spaceId))
    throw new Error('Invalid space id')
  if (!RECORD_ID_PATTERN.test(address.recordId))
    throw new Error('Invalid record id')
  if (!Number.isSafeInteger(address.epoch) || address.epoch < 1)
    throw new Error('Invalid epoch')
  if (!Number.isSafeInteger(address.stamp) || address.stamp < 0)
    throw new Error('Invalid stamp')
}

/** The plaintext's bytes: `{ v, kind, data }`, or `{ v, kind }` for a deletion. */
export function encodePlaintext(
  kind: string,
  data: Record<string, unknown> | undefined,
  deleted: boolean
): Uint8Array {
  return utf8(
    JSON.stringify(
      deleted
        ? { v: SPACE_PLAINTEXT_VERSION, kind }
        : { v: SPACE_PLAINTEXT_VERSION, kind, data: data ?? {} }
    )
  )
}

/**
 * Seals a record under epoch `address.epoch`'s space key. `nonce` is 24 random
 * bytes. Throws when the blob would pass the server's cap.
 */
export function sealRecord(
  spaceKey: Uint8Array,
  address: SpaceRecordAddress,
  plaintext: { kind: string; data?: Record<string, unknown> },
  nonce: Uint8Array
): string {
  checkAddress(address)
  const bytes = encodePlaintext(plaintext.kind, plaintext.data, address.deleted)
  if (bytes.length > RECORD_PLAINTEXT_MAX_BYTES)
    throw new Error('Record too large')
  return sealXChaCha(
    deriveRecordKey(spaceKey),
    bytes,
    recordAad(address),
    nonce
  )
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Opens a record. Throws `SpaceOpenError`: `newer` for a version this app
 * doesn't know, `contents` for anything that isn't a plaintext (a deletion
 * carrying data, or a live record without it).
 */
export function openRecord(
  spaceKey: Uint8Array,
  address: SpaceRecordAddress,
  blob: string
): SpacePlaintext {
  const bytes = openXChaCha(deriveRecordKey(spaceKey), blob, recordAad(address))
  let parsed: unknown
  try {
    parsed = JSON.parse(fromUtf8(bytes))
  } catch {
    throw new SpaceOpenError('contents')
  }
  if (!isPlainObject(parsed) || typeof parsed.v !== 'number')
    throw new SpaceOpenError('contents')
  if (parsed.v > SPACE_PLAINTEXT_VERSION) throw new SpaceOpenError('newer')
  if (parsed.v !== SPACE_PLAINTEXT_VERSION || typeof parsed.kind !== 'string')
    throw new SpaceOpenError('contents')
  if (address.deleted) {
    if ('data' in parsed) throw new SpaceOpenError('contents')
    return { v: parsed.v, kind: parsed.kind }
  }
  if (!isPlainObject(parsed.data)) throw new SpaceOpenError('contents')
  return { v: parsed.v, kind: parsed.kind, data: parsed.data }
}

// --- The kinds every space has -------------------------------------------

export const memberRecordId = (memberId: string) => `m.${memberId}`
export const inviteRecordId = (inviteId: string) => `i.${inviteId}`
export const keysRecordId = (epoch: number) => `k.${epoch}`

/** The space-level kind a record id names, or null for a space's own kinds. */
export function spaceKindOf(
  recordId: string
): 'member' | 'invite' | 'keys' | null {
  if (recordId.startsWith('m.')) return 'member'
  if (recordId.startsWith('i.')) return 'invite'
  if (recordId.startsWith('k.')) return 'keys'
  return null
}

/** The member a `m.` id names, the invite an `i.` id names; null otherwise. */
export const idInRecordId = (recordId: string): string | null => {
  const id = recordId.slice(2)
  return SPACE_ID_PATTERN.test(id) ? id : null
}

/**
 * Whether member `memberId` may put `recordId` (docs/shared-cars-protocol.md,
 * "Reserved ids"): an `m.` record only when it's their own, and a `k.` record
 * only as the owner. ww-api refuses a put that names anyone else's
 * (`forbidden`), storing none of it.
 */
export function mayPutRecord(
  recordId: string,
  memberId: string,
  isOwner: boolean
): boolean {
  if (recordId.startsWith('m.')) return recordId === memberRecordId(memberId)
  if (recordId.startsWith('k.')) return isOwner
  return true
}

/** The epoch a `k.<e>` id names (2 or more), or null. */
export function epochOfKeysRecord(recordId: string): number | null {
  const match = /^k\.([1-9][0-9]{0,8})$/.exec(recordId)
  const epoch = match ? Number(match[1]) : NaN
  return epoch >= 2 ? epoch : null
}

/** A member record's longest `name`. */
export const MEMBER_NAME_MAX = 40
/** A member record's longest `avatar` (an emoji, or a 40 px JPEG). */
export const MEMBER_AVATAR_MAX = 4000

/**
 * A `member` record's data. Their key isn't in it: `sync` lists each member's
 * `dhPub`, which their `memberId` commits to. Its `check` isn't either: the
 * device that writes the record works it out as it seals it (`memberCheck`).
 */
export type MemberRecordData = {
  name: string
  avatar?: string
  /** Their Buddies inbox, hashed for this space (`memberTag`). */
  tag: string
  /** Epoch ms. */
  joinedAt: number
}

/** The fields a `member` record's data has in this version. */
export const MEMBER_RECORD_FIELDS: readonly string[] = [
  'name',
  'avatar',
  'tag',
  'joinedAt',
  'check',
]

/** An `invite` record's data. */
export type InviteRecordData = {
  /** The `memberId` of the person who sent it. */
  invitedBy: string
  /** The invitee's Buddy Card name. */
  name: string
  /** The invitee's tag (`memberTag` of their inbox). */
  tag: string
  /** Epoch ms. */
  expiresAt: number
}

const isB64uKey = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  try {
    return fromB64u(value).length === 32
  } catch {
    return false
  }
}

/** Cuts `text` to at most `max` characters without splitting a surrogate pair. */
export function clip(text: string, max: number): string {
  const chars = Array.from(text)
  return chars.length <= max ? text : chars.slice(0, max).join('')
}

/** A member record's data as sent, or null when it isn't one. */
export function readMemberData(
  data: Record<string, unknown>
): MemberRecordData | null {
  const { name, avatar, tag, joinedAt } = data
  if (
    typeof name !== 'string' ||
    typeof tag !== 'string' ||
    typeof joinedAt !== 'number' ||
    !Number.isFinite(joinedAt)
  )
    return null
  return {
    name: clip(name, MEMBER_NAME_MAX),
    ...(typeof avatar === 'string' &&
      avatar.length > 0 &&
      avatar.length <= MEMBER_AVATAR_MAX && { avatar }),
    tag,
    joinedAt,
  }
}

/** An invite record's data as sent, or null when it isn't one. */
export function readInviteData(
  data: Record<string, unknown>
): InviteRecordData | null {
  const { invitedBy, name, tag, expiresAt } = data
  if (
    typeof invitedBy !== 'string' ||
    !SPACE_ID_PATTERN.test(invitedBy) ||
    typeof name !== 'string' ||
    typeof tag !== 'string' ||
    typeof expiresAt !== 'number' ||
    !Number.isFinite(expiresAt)
  )
    return null
  return { invitedBy, name: clip(name, MEMBER_NAME_MAX), tag, expiresAt }
}

/** A `keys` record's data: the previous epoch's key. */
export const keysRecordData = (previousKey: Uint8Array) => ({
  prev: toB64u(previousKey),
})

/** The previous epoch's key a `keys` record holds, or null. */
export function readKeysData(data: Record<string, unknown>): Uint8Array | null {
  return isB64uKey(data.prev) ? fromB64u(data.prev) : null
}
