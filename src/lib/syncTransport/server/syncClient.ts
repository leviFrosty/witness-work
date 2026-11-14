import { toB64u } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import {
  type BearerAccountOptions,
  sendBearerAccountOp,
  sendSignedAccountOp,
  type SignedAccountOptions,
} from '@/lib/serverAccount/client'
import { SYNC_PHOTO_NAME_PATTERN } from '@/lib/syncTransport/server/photoCrypto'
import {
  SYNC_SLOT_ID_PATTERN,
  syncBlobDigest,
} from '@/lib/syncTransport/server/syncCrypto'

export const SYNC_LIMITS = {
  bytes: 20 * 1024 * 1024,

  slots: 20,
} as const

export const BLOB_TIMEOUT_MS = 90_000

export const PHOTO_TIMEOUT_MS = 120_000

const PHOTO_PUT_MIN_WINDOW_MS = 120_000
const PHOTO_PUT_MAX_WINDOW_MS = 600_000
const PHOTO_PUT_SETUP_MS = 60_000
const PHOTO_PUT_MARGIN_MS = 10_000
const PHOTO_PUT_MIN_BYTES_PER_SECOND = 50 * 1024

export const photoPutWindowMs = (bytes: number) =>
  Math.min(
    PHOTO_PUT_MAX_WINDOW_MS,
    Math.max(
      PHOTO_PUT_MIN_WINDOW_MS,
      PHOTO_PUT_SETUP_MS + (bytes / PHOTO_PUT_MIN_BYTES_PER_SECOND) * 1000
    )
  )

export const photoUploadTimeoutMs = (bytes: number) =>
  photoPutWindowMs(bytes) - PHOTO_PUT_MARGIN_MS

export const photoDownloadTimeoutMs = (bytes?: number) =>
  bytes === undefined
    ? PHOTO_TIMEOUT_MS
    : Math.max(PHOTO_TIMEOUT_MS, photoPutWindowMs(bytes))

export const PHOTO_MAX_UPLOAD_TIMEOUT_MS = photoUploadTimeoutMs(
  25 * 1024 * 1024
)

export const PHOTO_MAX_DOWNLOAD_TIMEOUT_MS = photoDownloadTimeoutMs(
  25 * 1024 * 1024
)

export type SyncEntitlement = 'supporter' | 'everyone'

export type SyncStatus = {
  enabled: boolean

  entitled: boolean
  entitlement: SyncEntitlement
  supporter: boolean

  supporterCheckFailed: boolean

  photos: boolean | null

  requestedAt: number | null

  changes?: boolean
}

export type SyncSlotPlatform = 'ios' | 'android' | 'dev' | 'web'

const SLOT_PLATFORMS: readonly unknown[] = ['ios', 'android', 'dev', 'web']

export type SyncSlot = {
  slotId: string

  etag: string
  size: number

  updatedAt: number

  platform: SyncSlotPlatform | null

  live: boolean

  ended: boolean
}

export type SyncListing = {
  seq: number
  slots: SyncSlot[]
}

type ListedSlot = Pick<SyncSlot, 'slotId' | 'etag' | 'size' | 'updatedAt'> & {
  platform?: unknown
  live?: unknown
}

const isSlot = (value: unknown): value is ListedSlot => {
  const slot = value as Partial<ListedSlot> | null
  return (
    typeof slot?.slotId === 'string' &&
    SYNC_SLOT_ID_PATTERN.test(slot.slotId) &&
    typeof slot.etag === 'string' &&
    typeof slot.size === 'number' &&
    typeof slot.updatedAt === 'number'
  )
}

const unexpected = (status: number) =>
  new HttpError('server', status, 'unexpected_response')

export async function fetchSyncStatus(
  options: BearerAccountOptions
): Promise<SyncStatus> {
  const response = await sendBearerAccountOp<Record<string, unknown>>(
    'sync',
    null,
    options,
    { idempotent: true }
  )
  const data = response.data ?? {}
  if (
    data.ok !== true ||
    typeof data.enabled !== 'boolean' ||
    typeof data.entitled !== 'boolean'
  )
    throw unexpected(response.status)
  return {
    enabled: data.enabled,
    entitled: data.entitled,
    entitlement: data.entitlement === 'everyone' ? 'everyone' : 'supporter',
    supporter: data.supporter === true,
    supporterCheckFailed: data.supporterCheckFailed === true,
    photos: typeof data.photos === 'boolean' ? data.photos : null,
    requestedAt: typeof data.requestedAt === 'number' ? data.requestedAt : null,
    changes: data.changes === true,
  }
}

export async function askSyncRequest(
  options: BearerAccountOptions & { sign: SignedAccountOptions }
): Promise<number> {
  const response = await options.authorize((authorization) =>
    sendSignedAccountOp<Record<string, unknown>>(
      'sync/request',
      {},
      { ...options.sign, signal: options.signal },

      { headers: { authorization }, body: { requested: true } }
    )
  )
  const { ok, requestedAt } = response.data ?? {}
  if (ok !== true || typeof requestedAt !== 'number')
    throw unexpected(response.status)
  return requestedAt
}

export async function withdrawSyncRequest(
  options: BearerAccountOptions
): Promise<void> {
  const response = await sendBearerAccountOp<Record<string, unknown>>(
    'sync/request',
    { requested: false },
    options,
    { idempotent: true }
  )
  if (response.data?.ok !== true) throw unexpected(response.status)
}

export async function putSyncSlot(
  options: BearerAccountOptions,
  slotId: string,
  blob: Uint8Array,
  {
    ifMatch,
    reseal,
    coversSequence,
  }: { ifMatch?: string; reseal?: boolean; coversSequence?: number } = {}
): Promise<{ etag: string; updatedAt: number; seq: number }> {
  const response = await sendBearerAccountOp<Record<string, unknown>>(
    'sync/put',
    null,
    options,
    {
      rawBody: blob,
      headers: {
        'x-ww-slot-id': slotId,
        'x-ww-sha256': await syncBlobDigest(blob),
        ...(ifMatch && { 'if-match': ifMatch === '*' ? '*' : `"${ifMatch}"` }),
        ...(reseal && { 'x-ww-reseal': '1' }),
        ...(coversSequence !== undefined && {
          'x-ww-covers-sequence': String(coversSequence),
        }),
      },
      timeoutMs: BLOB_TIMEOUT_MS,
    }
  )
  const { ok, etag, updatedAt, seq } = response.data ?? {}
  if (
    ok !== true ||
    typeof etag !== 'string' ||
    typeof updatedAt !== 'number' ||
    typeof seq !== 'number'
  )
    throw unexpected(response.status)
  return { etag, updatedAt, seq }
}

export async function listSyncSlots(
  options: BearerAccountOptions,
  { readsChanges = false }: { readsChanges?: boolean } = {}
): Promise<SyncListing> {
  const response = await sendBearerAccountOp<Record<string, unknown>>(
    'sync/list',
    {},
    options,
    {
      idempotent: true,
      ...(readsChanges && { headers: { 'x-ww-sync-changes': '1' } }),
    }
  )
  const { ok, seq, slots } = response.data ?? {}
  if (ok !== true || typeof seq !== 'number' || !Array.isArray(slots))
    throw unexpected(response.status)

  return {
    seq,
    slots: slots
      .filter(isSlot)
      .map(({ slotId, etag, size, updatedAt, platform, live }) => ({
        slotId,
        etag,
        size,
        updatedAt,
        platform: SLOT_PLATFORMS.includes(platform)
          ? (platform as SyncSlotPlatform)
          : null,
        live: live === true,
        ended: live === false,
      })),
  }
}

export const SYNC_CHANGE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/

export type SyncChange = {
  sequence: number
  slotId: string
  changeId: string

  createdAt: number

  blob: string
}

export type SyncCatchUpSlot = {
  slotId: string
  etag: string
  size: number
  updatedAt: number
  platform: SyncSlotPlatform | null

  floorSequence: number

  changedAt: number
}

export type SyncCatchUp = {
  sequence: number
  slots: SyncCatchUpSlot[]
  changes: SyncChange[]
  more: boolean

  snapshotReaders: boolean
  requestedAt: number | null
  photos: boolean | null
}

const isSequence = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

export function parseSyncChange(value: unknown): SyncChange | null {
  const change = value as Partial<SyncChange> | null
  return isSequence(change?.sequence) &&
    typeof change.slotId === 'string' &&
    SYNC_SLOT_ID_PATTERN.test(change.slotId) &&
    typeof change.changeId === 'string' &&
    SYNC_CHANGE_ID_PATTERN.test(change.changeId) &&
    typeof change.createdAt === 'number' &&
    typeof change.blob === 'string'
    ? {
        sequence: change.sequence,
        slotId: change.slotId,
        changeId: change.changeId,
        createdAt: change.createdAt,
        blob: change.blob,
      }
    : null
}

export function parseSyncCatchUp(value: unknown): SyncCatchUp | null {
  const data = value as Record<string, unknown> | null
  if (
    !data ||
    !isSequence(data.sequence) ||
    !Array.isArray(data.slots) ||
    !Array.isArray(data.changes)
  )
    return null
  const slots: SyncCatchUpSlot[] = []
  for (const slot of data.slots as unknown[]) {
    if (!isSlot(slot)) continue
    const { floorSequence, changedAt } = slot as Partial<SyncCatchUpSlot>
    if (!isSequence(floorSequence)) return null
    slots.push({
      slotId: slot.slotId,
      etag: slot.etag,
      size: slot.size,
      updatedAt: slot.updatedAt,
      platform: SLOT_PLATFORMS.includes(slot.platform)
        ? (slot.platform as SyncSlotPlatform)
        : null,
      floorSequence,
      changedAt: typeof changedAt === 'number' ? changedAt : slot.updatedAt,
    })
  }
  const changes: SyncChange[] = []
  for (const each of data.changes as unknown[]) {
    const change = parseSyncChange(each)
    if (!change) return null
    changes.push(change)
  }
  return {
    sequence: data.sequence,
    slots,
    changes,
    more: data.more === true,
    snapshotReaders: data.snapshotReaders === true,
    requestedAt: typeof data.requestedAt === 'number' ? data.requestedAt : null,
    photos: typeof data.photos === 'boolean' ? data.photos : null,
  }
}

export async function listSyncChanges(
  options: BearerAccountOptions,
  slotId: string,
  afterSequence: number
): Promise<SyncCatchUp> {
  const response = await sendBearerAccountOp<Record<string, unknown>>(
    'sync/changes/list',
    { slotId, afterSequence },
    options,
    { idempotent: true }
  )
  const catchUp =
    response.data?.ok === true ? parseSyncCatchUp(response.data) : null
  if (!catchUp) throw unexpected(response.status)
  return catchUp
}

export type SyncChangePut = {
  sequence: number

  tailCount: number
  tailBytes: number
  snapshotReaders: boolean

  changedAt: number | null
}

export async function putSyncChange(
  options: BearerAccountOptions,
  change: { slotId: string; changeId: string; blob: Uint8Array }
): Promise<SyncChangePut> {
  const response = await sendBearerAccountOp<Record<string, unknown>>(
    'sync/changes/put',
    {
      slotId: change.slotId,
      changeId: change.changeId,
      blob: toB64u(change.blob),
    },
    options,
    { idempotent: true }
  )
  const data = response.data ?? {}
  if (
    data.ok !== true ||
    !isSequence(data.sequence) ||
    !isSequence(data.tailCount) ||
    !isSequence(data.tailBytes)
  )
    throw unexpected(response.status)
  return {
    sequence: data.sequence,
    tailCount: data.tailCount,
    tailBytes: data.tailBytes,
    snapshotReaders: data.snapshotReaders === true,
    changedAt: typeof data.changedAt === 'number' ? data.changedAt : null,
  }
}

export async function resealSyncChange(
  options: BearerAccountOptions,
  change: { sequence: number; changeId: string; blob: Uint8Array }
): Promise<void> {
  const response = await sendBearerAccountOp<Record<string, unknown>>(
    'sync/changes/reseal',
    {
      sequence: change.sequence,
      changeId: change.changeId,
      blob: toB64u(change.blob),
    },
    options,
    { idempotent: true }
  )
  if (response.data?.ok !== true) throw unexpected(response.status)
}

export async function getSyncSlot(
  options: BearerAccountOptions,
  slotId: string
): Promise<Uint8Array> {
  const response = await sendBearerAccountOp<Uint8Array>(
    'sync/get',
    { slotId },
    options,
    { responseType: 'bytes', timeoutMs: BLOB_TIMEOUT_MS, idempotent: true }
  )
  return response.data
}

export async function deleteSyncSlot(
  options: BearerAccountOptions,
  slotId?: string
): Promise<void> {
  const response = await sendBearerAccountOp<{ ok?: boolean }>(
    'sync/delete',
    slotId ? { slotId } : {},
    options,
    { idempotent: true }
  )
  if (response.data?.ok !== true) throw unexpected(response.status)
}

export type SyncPhotoUsage = { bytes: number; count: number; limit: number }

export type SyncPhoto = {
  name: string
  size: number

  sha256: string

  createdAt: number

  meta: string
}

export type SyncPhotoPut = {
  size: number
  sha256: string
  createdAt: number

  existed: boolean
  usage: SyncPhotoUsage | null
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

export function parsePhotoUsage(value: unknown): SyncPhotoUsage | null {
  const usage = (value as { usage?: Partial<SyncPhotoUsage> } | null)?.usage
  if (!isCount(usage?.bytes) || !isCount(usage.count) || !isCount(usage.limit))
    return null
  return { bytes: usage.bytes, count: usage.count, limit: usage.limit }
}

const isPhoto = (value: unknown): value is SyncPhoto => {
  const photo = value as Partial<SyncPhoto> | null
  return (
    typeof photo?.name === 'string' &&
    SYNC_PHOTO_NAME_PATTERN.test(photo.name) &&
    isCount(photo.size) &&
    typeof photo.sha256 === 'string' &&
    isCount(photo.createdAt) &&
    typeof photo.meta === 'string'
  )
}

export async function putSyncPhoto(
  options: BearerAccountOptions,
  photo: { name: string; meta: string; blob: Uint8Array },

  slotId?: string | null
): Promise<SyncPhotoPut> {
  const response = await sendBearerAccountOp<Record<string, unknown>>(
    'sync/photos/put',
    null,
    options,
    {
      rawBody: photo.blob,
      headers: {
        'x-ww-photo-name': photo.name,
        'x-ww-sha256': await syncBlobDigest(photo.blob),
        'x-ww-photo-meta': photo.meta,
        ...(slotId && { 'x-ww-slot-id': slotId }),
      },
      timeoutMs: photoUploadTimeoutMs(photo.blob.length),
    }
  )
  const data = response.data ?? {}
  if (
    data.ok !== true ||
    !isCount(data.size) ||
    typeof data.sha256 !== 'string' ||
    !isCount(data.createdAt)
  )
    throw unexpected(response.status)
  return {
    size: data.size,
    sha256: data.sha256,
    createdAt: data.createdAt,
    existed: data.existed === true,
    usage: parsePhotoUsage(data),
  }
}

export async function listSyncPhotos(
  options: BearerAccountOptions,
  cursor: string | null = null
): Promise<{
  photos: SyncPhoto[]
  cursor: string | null
  usage: SyncPhotoUsage | null
}> {
  const response = await sendBearerAccountOp<Record<string, unknown>>(
    'sync/photos/list',
    cursor ? { cursor } : {},
    options,
    { idempotent: true }
  )
  const data = response.data ?? {}
  if (data.ok !== true || !Array.isArray(data.photos))
    throw unexpected(response.status)
  return {
    photos: data.photos
      .filter(isPhoto)
      .map(({ name, size, sha256, createdAt, meta }) => ({
        name,
        size,
        sha256,
        createdAt,
        meta,
      })),
    cursor: typeof data.cursor === 'string' && data.cursor ? data.cursor : null,
    usage: parsePhotoUsage(data),
  }
}

export async function getSyncPhoto(
  options: BearerAccountOptions,
  name: string,
  size?: number
): Promise<{ blob: Uint8Array; createdAt: number | null }> {
  const response = await sendBearerAccountOp<Uint8Array>(
    'sync/photos/get',
    { name },
    options,
    {
      responseType: 'bytes',
      timeoutMs: photoDownloadTimeoutMs(size),
      idempotent: true,
      retryTimeouts: false,
    }
  )
  const createdAt = Number(response.headers.get('x-ww-created-at'))
  return {
    blob: response.data,
    createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : null,
  }
}

export async function deleteSyncPhotos(
  options: BearerAccountOptions,
  which: { names: string[] } | { all: true },

  slotId?: string | null
): Promise<{ usage: SyncPhotoUsage | null }> {
  const response = await sendBearerAccountOp<Record<string, unknown>>(
    'sync/photos/delete',
    which,
    options,
    {
      idempotent: true,
      ...(slotId && { headers: { 'x-ww-slot-id': slotId } }),
    }
  )
  if (response.data?.ok !== true) throw unexpected(response.status)
  return { usage: parsePhotoUsage(response.data) }
}

export async function fetchSyncPhotoUsage(
  options: BearerAccountOptions
): Promise<SyncPhotoUsage> {
  const response = await sendBearerAccountOp<Record<string, unknown>>(
    'sync/photos/usage',
    null,
    options,
    { idempotent: true }
  )
  const usage = parsePhotoUsage(response.data)
  if (response.data?.ok !== true || !usage) throw unexpected(response.status)
  return usage
}
