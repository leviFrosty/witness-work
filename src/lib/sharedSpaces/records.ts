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
import {
  deriveScopeKey,
  isLinkId,
  isScopeId,
  UUID_PATTERN,
} from '@/lib/sharedSpaces/scopes'

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

export function sealRecordWithKey(
  key: Uint8Array,
  address: SpaceRecordAddress,
  plaintext: { kind: string; data?: Record<string, unknown> },
  nonce: Uint8Array,
  maxBlobBytes = RECORD_BLOB_MAX_BYTES
): string {
  checkAddress(address)
  const bytes = encodePlaintext(plaintext.kind, plaintext.data, address.deleted)
  if (sealedLength(bytes.length) > maxBlobBytes)
    throw new Error('Record too large')
  return sealXChaCha(key, bytes, recordAad(address), nonce)
}

export const sealRecord = (
  spaceKey: Uint8Array,
  address: SpaceRecordAddress,
  plaintext: { kind: string; data?: Record<string, unknown> },
  nonce: Uint8Array
): string =>
  sealRecordWithKey(deriveRecordKey(spaceKey), address, plaintext, nonce)

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const openRecord = (
  spaceKey: Uint8Array,
  address: SpaceRecordAddress,
  blob: string
): SpacePlaintext => openRecordWithKey(deriveRecordKey(spaceKey), address, blob)

export function openRecordWithKey(
  key: Uint8Array,
  address: SpaceRecordAddress,
  blob: string
): SpacePlaintext {
  const bytes = openXChaCha(key, blob, recordAad(address))
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

export const SCOPED_RECORD_ID_PATTERN =
  /^(h|s\.[A-Za-z0-9_-]{22}(\.(w|[0-9a-f-]{36}))?|d\.[0-9a-f-]{36}|[mig]\.[A-Za-z0-9_-]{22}|k\.[1-9][0-9]{0,8})$/

export const GUEST_BLOB_MAX_BYTES = 4 * 1024

export const GUEST_PLAINTEXT_MAX_BYTES = GUEST_BLOB_MAX_BYTES - sealedLength(0)

export type ScopedRecordClass =
  | { class: 'header' }
  | { class: 'street'; scopeId: string }
  | { class: 'worked'; scopeId: string }
  | { class: 'inScope'; scopeId: string; id: string }
  | { class: 'territoryWide'; id: string }
  | { class: 'member'; memberId: string }
  | { class: 'invite'; inviteId: string }
  | { class: 'keys'; epoch: number }
  | { class: 'linkKeys'; linkId: string }

export const HEADER_RECORD_ID = 'h'

function checkUuid(id: string): string {
  if (!UUID_PATTERN.test(id))
    throw new Error('Record id must be a lowercase UUID')
  return id
}

function checkScope(scopeId: string): string {
  if (!isScopeId(scopeId)) throw new Error('Invalid scope id')
  return scopeId
}

export const streetRecordId = (scopeId: string) => `s.${checkScope(scopeId)}`

export const workedRecordId = (scopeId: string) => `s.${checkScope(scopeId)}.w`

export const inScopeRecordId = (scopeId: string, id: string) =>
  `s.${checkScope(scopeId)}.${checkUuid(id)}`

export const territoryWideRecordId = (id: string) => `d.${checkUuid(id)}`

export function guestKeysRecordId(linkId: string): string {
  if (!isLinkId(linkId)) throw new Error('Invalid link id')
  return `g.${linkId}`
}

export function parseScopedRecordId(
  recordId: string
): ScopedRecordClass | null {
  if (!SCOPED_RECORD_ID_PATTERN.test(recordId)) return null
  if (recordId === HEADER_RECORD_ID) return { class: 'header' }
  const [prefix, first, second] = recordId.split('.')
  switch (prefix) {
    case 's':
      if (second === undefined) return { class: 'street', scopeId: first }
      if (second === 'w') return { class: 'worked', scopeId: first }
      return UUID_PATTERN.test(second)
        ? { class: 'inScope', scopeId: first, id: second }
        : null
    case 'd':
      return UUID_PATTERN.test(first)
        ? { class: 'territoryWide', id: first }
        : null
    case 'm':
      return { class: 'member', memberId: first }
    case 'i':
      return { class: 'invite', inviteId: first }
    case 'g':
      return { class: 'linkKeys', linkId: first }
    default:
      return { class: 'keys', epoch: Number(first) }
  }
}

export const isScopedRecordId = (recordId: string) =>
  parseScopedRecordId(recordId) !== null

export function scopeOfRecordId(recordId: string): string | null {
  const parsed = parseScopedRecordId(recordId)
  return parsed && 'scopeId' in parsed ? parsed.scopeId : null
}

export function scopedRecordKey(
  spaceKey: Uint8Array,
  recordId: string
): Uint8Array {
  const parsed = parseScopedRecordId(recordId)
  if (!parsed) throw new Error('Invalid scoped record id')
  if (parsed.class === 'linkKeys')
    throw new Error('Link keys records are sealed under the link key')
  return 'scopeId' in parsed
    ? deriveScopeKey(spaceKey, parsed.scopeId)
    : deriveRecordKey(spaceKey)
}

export type ScopedMember = {
  memberId: string

  scopes: readonly string[] | null

  invitedBy: string | null
}

export type ScopedInvite = {
  inviteId: string
  invitedBy: string

  scopes: readonly string[] | null
  handoff: boolean
}

export type ScopedHolder = {
  scopeId: string

  memberId: string | null

  inviteId: string | null
}

export type ScopedLink = {
  linkId: string
  createdBy: string
  scopes: readonly string[]
  expiresAt: number

  endedAt: number | null
}

export type ScopedSpaceView = {
  ownerId: string
  members: readonly ScopedMember[]
  invites: readonly ScopedInvite[]
  holders: readonly ScopedHolder[]
  links: readonly ScopedLink[]
}

export type ScopedActor = { memberId: string } | { guest: ScopedLink }

export type ScopedRole = 'owner' | 'whole' | 'street' | 'onward'

export type ScopedCheck = 'ok' | 'forbidden' | 'conflict' | 'bad_request'

export const SCOPED_LIMITS = {
  scopesPerInvite: 100,

  scopesPerLink: 30,

  linkLifetimeMs: 24 * 60 * 60 * 1000,

  maxLinkLifetimeMs: 30 * 24 * 60 * 60 * 1000,

  linkLifetimeSlackMs: 5 * 60 * 1000,

  openLinks: 10,

  linksPerDay: 30,
} as const

const memberIn = (view: ScopedSpaceView, memberId: string) =>
  view.members.find((member) => member.memberId === memberId)

export const holdOf = (view: ScopedSpaceView, scopeId: string) =>
  view.holders.find(
    (holder) =>
      holder.scopeId === scopeId &&
      (holder.memberId !== null || holder.inviteId !== null)
  ) ?? null

export const heldStreets = (view: ScopedSpaceView, memberId: string) =>
  view.holders
    .filter((holder) => holder.memberId === memberId)
    .map((holder) => holder.scopeId)

export function scopedRoleOf(
  view: ScopedSpaceView,
  memberId: string
): ScopedRole | null {
  if (memberId === view.ownerId) return 'owner'
  const member = memberIn(view, memberId)
  if (!member) return null
  if (member.scopes === null) return 'whole'
  return member.invitedBy === view.ownerId ? 'street' : 'onward'
}

export function validScopeList(
  scopes: unknown,
  max: number
): scopes is string[] {
  return (
    Array.isArray(scopes) &&
    scopes.length >= 1 &&
    scopes.length <= max &&
    scopes.every(isScopeId) &&
    new Set(scopes).size === scopes.length
  )
}

export function mayReadScope(
  view: ScopedSpaceView,
  memberId: string,
  scopeId: string
): boolean {
  if (memberId === view.ownerId) return true
  const member = memberIn(view, memberId)
  return !!member && (member.scopes === null || member.scopes.includes(scopeId))
}

export function mayWriteScope(
  view: ScopedSpaceView,
  memberId: string,
  scopeId: string
): boolean {
  const member = memberIn(view, memberId)
  if (!member && memberId !== view.ownerId) return false
  const hold = holdOf(view, scopeId)
  if (hold) {
    if (hold.memberId === null) return false
    if (memberId === hold.memberId) return true
    return (
      member?.invitedBy === hold.memberId &&
      member.scopes !== null &&
      member.scopes.includes(scopeId)
    )
  }
  if (memberId === view.ownerId || member?.scopes === null) return true
  return (
    !!member &&
    member.invitedBy === view.ownerId &&
    member.scopes.includes(scopeId)
  )
}

export const guestMayWriteScope = (
  view: ScopedSpaceView,
  link: ScopedLink,
  scopeId: string
) =>
  link.scopes.includes(scopeId) && mayWriteScope(view, link.createdBy, scopeId)

const linkIn = (view: ScopedSpaceView, linkId: string) =>
  view.links.find((link) => link.linkId === linkId)

const inviteIn = (view: ScopedSpaceView, inviteId: string) =>
  view.invites.find((invite) => invite.inviteId === inviteId)

function access(
  view: ScopedSpaceView,
  actor: ScopedActor,
  recordId: string
): { read: boolean; write: boolean } {
  const none = { read: false, write: false }
  const parsed = parseScopedRecordId(recordId)
  if (!parsed) return none
  if ('guest' in actor) {
    const link = actor.guest
    if (parsed.class === 'linkKeys')
      return { read: parsed.linkId === link.linkId, write: false }
    if (!('scopeId' in parsed)) return none
    const allowed = guestMayWriteScope(view, link, parsed.scopeId)
    return { read: allowed, write: allowed && parsed.class !== 'street' }
  }
  const { memberId } = actor
  const role = scopedRoleOf(view, memberId)
  if (!role) return none
  const owner = role === 'owner'
  const whole = owner || role === 'whole'
  switch (parsed.class) {
    case 'header':
    case 'keys':
      return { read: true, write: owner }
    case 'member':
      return { read: true, write: parsed.memberId === memberId }
    case 'territoryWide':
      return { read: whole, write: whole }
    case 'invite': {
      const invite = inviteIn(view, parsed.inviteId)
      const own = invite ? invite.invitedBy === memberId : false
      return { read: own || whole, write: own || owner }
    }
    case 'linkKeys': {
      const link = linkIn(view, parsed.linkId)
      const own = link ? link.createdBy === memberId : false
      return { read: own || whole, write: own }
    }
    default: {
      const read = mayReadScope(view, memberId, parsed.scopeId)
      return {
        read,
        write: read && mayWriteScope(view, memberId, parsed.scopeId),
      }
    }
  }
}

export const mayReadRecord = (
  view: ScopedSpaceView,
  actor: ScopedActor,
  recordId: string
) => access(view, actor, recordId).read

export const mayWriteRecord = (
  view: ScopedSpaceView,
  actor: ScopedActor,
  recordId: string
) => access(view, actor, recordId).write

export function checkShare(
  view: ScopedSpaceView,
  memberId: string,
  {
    scopes,
    handoff = false,
  }: { scopes: readonly string[] | null; handoff?: boolean }
): ScopedCheck {
  if (scopes !== null && !validScopeList(scopes, SCOPED_LIMITS.scopesPerInvite))
    return 'bad_request'
  const owner = memberId === view.ownerId
  if (handoff) {
    if (scopes === null || scopes.length !== 1) return 'bad_request'
    if (!owner) return 'forbidden'
    return holdOf(view, scopes[0]) ? 'conflict' : 'ok'
  }
  if (owner)
    return scopes === null || scopes.every((scopeId) => !holdOf(view, scopeId))
      ? 'ok'
      : 'forbidden'
  const held = heldStreets(view, memberId)
  return scopes !== null &&
    held.length > 0 &&
    scopes.every((scopeId) => held.includes(scopeId))
    ? 'ok'
    : 'forbidden'
}

export function checkInviteDelete(
  view: ScopedSpaceView,
  memberId: string,
  inviteId: string
): ScopedCheck {
  const invite = inviteIn(view, inviteId)
  return !invite || memberId === view.ownerId || invite.invitedBy === memberId
    ? 'ok'
    : 'forbidden'
}

export function checkHandoffCreate(
  view: ScopedSpaceView,
  memberId: string,
  { scopeId, target }: { scopeId: string; target: string }
): ScopedCheck {
  if (!isScopeId(scopeId)) return 'bad_request'
  if (memberId !== view.ownerId) return 'forbidden'
  if (target === view.ownerId) return 'bad_request'
  if (!memberIn(view, target)) return 'conflict'
  return holdOf(view, scopeId) ? 'conflict' : 'ok'
}

export function checkHandoffEnd(
  view: ScopedSpaceView,
  memberId: string,
  scopeId: string
): ScopedCheck {
  if (!isScopeId(scopeId)) return 'bad_request'
  const hold = holdOf(view, scopeId)
  return !hold || memberId === view.ownerId || hold.memberId === memberId
    ? 'ok'
    : 'forbidden'
}

export function checkMemberScopes(
  view: ScopedSpaceView,
  memberId: string,
  { target, scopes }: { target: string; scopes: readonly string[] | null }
): ScopedCheck {
  if (scopes !== null && !validScopeList(scopes, SCOPED_LIMITS.scopesPerInvite))
    return 'bad_request'
  if (memberId !== view.ownerId) return 'forbidden'
  if (target === view.ownerId) return 'bad_request'
  const member = memberIn(view, target)
  if (!member) return 'conflict'
  if (member.invitedBy !== view.ownerId) return 'forbidden'
  if (scopes === null) return 'ok'
  const keepsHeld = heldStreets(view, target).every((scopeId) =>
    scopes.includes(scopeId)
  )
  const had = member.scopes ?? []
  const takesOthers = scopes.some((scopeId) => {
    if (had.includes(scopeId)) return false
    const hold = holdOf(view, scopeId)
    return hold !== null && hold.memberId !== target
  })
  return keepsHeld && !takesOthers ? 'ok' : 'conflict'
}

export function checkMemberRemove(
  view: ScopedSpaceView,
  memberId: string,
  target: string
): ScopedCheck {
  if (target === memberId) return 'bad_request'
  const member = memberIn(view, target)
  return !member || memberId === view.ownerId || member.invitedBy === memberId
    ? 'ok'
    : 'forbidden'
}

export function checkLinkCreate(
  view: ScopedSpaceView,
  memberId: string,
  scopes: readonly string[]
): ScopedCheck {
  if (!validScopeList(scopes, SCOPED_LIMITS.scopesPerLink)) return 'bad_request'
  if (memberId === view.ownerId)
    return scopes.every((scopeId) => !holdOf(view, scopeId))
      ? 'ok'
      : 'forbidden'
  const held = heldStreets(view, memberId)
  return scopes.every((scopeId) => held.includes(scopeId)) ? 'ok' : 'forbidden'
}

export function checkLinkEnd(
  view: ScopedSpaceView,
  memberId: string,
  linkId: string,
  now: number
): ScopedCheck {
  const link = linkIn(view, linkId)
  return !link ||
    link.endedAt !== null ||
    link.expiresAt <= now ||
    memberId === view.ownerId ||
    link.createdBy === memberId
    ? 'ok'
    : 'forbidden'
}

export const checkLeave = (
  view: ScopedSpaceView,
  memberId: string
): ScopedCheck => (memberId === view.ownerId ? 'bad_request' : 'ok')
