import { HttpError } from '@/lib/http/request'
import {
  type BearerAccountOptions,
  sendBearerAccountOp,
} from '@/lib/serverAccount/client'
import {
  SYNC_SLOT_ID_PATTERN,
  syncBlobDigest,
} from '@/lib/syncTransport/server/syncCrypto'

export const SYNC_LIMITS = {
  bytes: 20 * 1024 * 1024,

  slots: 20,
} as const

export const BLOB_TIMEOUT_MS = 90_000

export type SyncEntitlement = 'supporter' | 'everyone'

export type SyncStatus = {
  enabled: boolean

  entitled: boolean
  entitlement: SyncEntitlement
  supporter: boolean

  supporterCheckFailed: boolean
}

export type SyncSlot = {
  slotId: string

  etag: string
  size: number

  updatedAt: number
}

export type SyncListing = {
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
