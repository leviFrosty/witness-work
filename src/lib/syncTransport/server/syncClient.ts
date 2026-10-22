import { HttpError } from '@/lib/http/request'
import {
  type BearerAccountOptions,
  sendBearerAccountOp,
} from '@/lib/serverAccount/client'
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
