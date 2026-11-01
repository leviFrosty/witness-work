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

const recordKeys = new WeakMap<Uint8Array, Uint8Array>()

export function deriveRecordKey(spaceKey: Uint8Array): Uint8Array {
  let recordKey = recordKeys.get(spaceKey)
  if (!recordKey) {
    recordKey = deriveRecordKeyBytes(spaceKey)
    recordKeys.set(spaceKey, recordKey)
  }
  return recordKey
}

export const SPACE_PLAINTEXT_VERSION = 1

export const RECORD_BLOB_MAX_BYTES = 16 * 1024

export const RECORD_PLAINTEXT_MAX_BYTES =
  RECORD_BLOB_MAX_BYTES - sealedLength(0)

export type SpaceRecordAddress = {
  spaceId: string
  epoch: number
  recordId: string
  deleted: boolean

  stamp: number
}

export type SpacePlaintext = {
  v: number
  kind: string

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

export const memberRecordId = (memberId: string) => `m.${memberId}`
export const inviteRecordId = (inviteId: string) => `i.${inviteId}`
export const keysRecordId = (epoch: number) => `k.${epoch}`

export function spaceKindOf(
  recordId: string
): 'member' | 'invite' | 'keys' | null {
  if (recordId.startsWith('m.')) return 'member'
  if (recordId.startsWith('i.')) return 'invite'
  if (recordId.startsWith('k.')) return 'keys'
  return null
}

export const idInRecordId = (recordId: string): string | null => {
  const id = recordId.slice(2)
  return SPACE_ID_PATTERN.test(id) ? id : null
}

export function mayPutRecord(
  recordId: string,
  memberId: string,
  isOwner: boolean
): boolean {
  if (recordId.startsWith('m.')) return recordId === memberRecordId(memberId)
  if (recordId.startsWith('k.')) return isOwner
  return true
}

export function epochOfKeysRecord(recordId: string): number | null {
  const match = /^k\.([1-9][0-9]{0,8})$/.exec(recordId)
  const epoch = match ? Number(match[1]) : NaN
  return epoch >= 2 ? epoch : null
}

export const MEMBER_NAME_MAX = 40

export const MEMBER_AVATAR_MAX = 4000

export type MemberRecordData = {
  name: string
  avatar?: string

  tag: string

  joinedAt: number
}

export const MEMBER_RECORD_FIELDS: readonly string[] = [
  'name',
  'avatar',
  'tag',
  'joinedAt',
  'check',
]

export type InviteRecordData = {
  invitedBy: string

  name: string

  tag: string

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

export function clip(text: string, max: number): string {
  const chars = Array.from(text)
  return chars.length <= max ? text : chars.slice(0, max).join('')
}

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

export const keysRecordData = (previousKey: Uint8Array) => ({
  prev: toB64u(previousKey),
})

export function readKeysData(data: Record<string, unknown>): Uint8Array | null {
  return isB64uKey(data.prev) ? fromB64u(data.prev) : null
}
