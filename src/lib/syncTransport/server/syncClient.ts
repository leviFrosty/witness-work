import { HttpError } from '@/lib/http/request'
import {
  type BearerAccountOptions,
  sendBearerAccountOp,
} from '@/lib/serverAccount/client'
import { SYNC_PHOTO_NAME_PATTERN } from '@/lib/syncTransport/server/photoCrypto'
import {
  SYNC_SLOT_ID_PATTERN,
  syncBlobDigest,
} from '@/lib/syncTransport/server/syncCrypto'

/**
 * `/accounts/v1/sync*` (docs/accounts-protocol.md, "Sync"; ADR 0030): every op
 * is **Bearer**, with the account session's token. `put` sends the blob as the
 * raw body with its slot and digest in headers; the rest send JSON. Failures
 * throw `HttpError`, whose `serverCode` is the server's (`disabled`,
 * `supporter_required`, `too_large`, `limit`, `rate_limited`, `not_found`, …).
 * Photos (`sync/photos/*`, docs/cloud-sync-photos.md) work the same way, with
 * `storage_full`, `photos_disabled`, `conflict` and `no_slot` too.
 */

/** The server's caps, mirrored so the app can say so before uploading. */
export const SYNC_LIMITS = {
  /** One blob. */
  bytes: 20 * 1024 * 1024,
  /** Slots an account. */
  slots: 20,
} as const

/** A blob of up to 20 MiB, on a phone connection. */
export const BLOB_TIMEOUT_MS = 90_000

/** A photo blob of up to 25 MiB, on a phone connection. */
export const PHOTO_TIMEOUT_MS = 120_000

export type SyncEntitlement = 'supporter' | 'everyone'

/** `GET /accounts/v1/sync`: the account's own answer. */
export type SyncStatus = {
  /** The server's kill switch. */
  enabled: boolean
  /** Enabled, and `everyone` or a Supporter. */
  entitled: boolean
  entitlement: SyncEntitlement
  supporter: boolean
  /** RevenueCat couldn't be read; `supporter` is false for now. */
  supporterCheckFailed: boolean
  /** Photos' own switch; null from a server that doesn't know photos. */
  photos: boolean | null
}

export type SyncSlot = {
  slotId: string
  /** B64u SHA-256 of the blob. */
  etag: string
  size: number
  /** Epoch ms of the slot's last put, the server's clock. */
  updatedAt: number
}

export type SyncListing = {
  /** The account's change counter; it only grows. */
  seq: number
  slots: SyncSlot[]
}

const isSlot = (value: unknown): value is SyncSlot => {
  const slot = value as Partial<SyncSlot> | null
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
  }
}

/** Replaces this device's slot. Resolves its new ETag and server time. */
export async function putSyncSlot(
  options: BearerAccountOptions,
  slotId: string,
  blob: Uint8Array,
  { ifMatch }: { ifMatch?: string } = {}
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

/** The account's slots: ids, ETags, sizes and times, never their contents. */
export async function listSyncSlots(
  options: BearerAccountOptions
): Promise<SyncListing> {
  const response = await sendBearerAccountOp<Record<string, unknown>>(
    'sync/list',
    {},
    options,
    { idempotent: true }
  )
  const { ok, seq, slots } = response.data ?? {}
  if (ok !== true || typeof seq !== 'number' || !Array.isArray(slots))
    throw unexpected(response.status)
  // A slot this version can't name is skipped rather than failing the list.
  return {
    seq,
    slots: slots.filter(isSlot).map(({ slotId, etag, size, updatedAt }) => ({
      slotId,
      etag,
      size,
      updatedAt,
    })),
  }
}

/** One slot's blob, exactly as put; `not_found` without one. */
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

/** Deletes one slot, or every slot of the account without `slotId`. */
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

/** The account's live photos: their total blob size, number, and the limit. */
export type SyncPhotoUsage = { bytes: number; count: number; limit: number }

export type SyncPhoto = {
  /** The keyed name, b64u HMAC of the engine's filename. */
  name: string
  size: number
  /** B64u SHA-256 of the blob. */
  sha256: string
  /** Epoch ms the photo became live, the server's clock. */
  createdAt: number
  /** The sealed filename. */
  meta: string
}

export type SyncPhotoPut = {
  size: number
  sha256: string
  createdAt: number
  /** The name was live already; nothing was written. */
  existed: boolean
  usage: SyncPhotoUsage | null
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

/** The `usage` in an answer or an error body, or null when it isn't one. */
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

/**
 * Stores a photo blob under its name. A name already live answers `existed`
 * with the stored photo's details, whatever the body.
 */
export async function putSyncPhoto(
  options: BearerAccountOptions,
  photo: { name: string; meta: string; blob: Uint8Array },
  /** This device's slot, so its own live socket isn't told. */
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
      timeoutMs: PHOTO_TIMEOUT_MS,
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

/** One page of the account's live photos, by name; `cursor` null on the last. */
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
    // A photo this version can't read is skipped rather than failing the list.
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

/** One photo's blob, exactly as put; `not_found` without it. */
export async function getSyncPhoto(
  options: BearerAccountOptions,
  name: string
): Promise<{ blob: Uint8Array; createdAt: number | null }> {
  const response = await sendBearerAccountOp<Uint8Array>(
    'sync/photos/get',
    { name },
    options,
    { responseType: 'bytes', timeoutMs: PHOTO_TIMEOUT_MS, idempotent: true }
  )
  const createdAt = Number(response.headers.get('x-ww-created-at'))
  return {
    blob: response.data,
    createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : null,
  }
}

/** Deletes some photos by name (1–100), or every one of the account. */
export async function deleteSyncPhotos(
  options: BearerAccountOptions,
  which: { names: string[] } | { all: true },
  /** This device's slot, so its own live socket isn't told. */
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

/** The account's photo storage. */
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
