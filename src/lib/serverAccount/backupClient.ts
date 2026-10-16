import { HttpError } from '@/lib/http/request'
import { RELAY_ID_PATTERN } from '@/lib/bytes'
import {
  type RegisterAccountOptions,
  sendSignedAccountOp,
} from '@/lib/serverAccount/client'
import { backupBlobDigest } from '@/lib/serverAccount/backupCrypto'

/**
 * `/accounts/v1/backup/*` (docs/accounts-protocol.md, "Backup"): every op is
 * signed by the account key. `put` sends the envelope in headers and the blob
 * as the raw body; the rest are JSON envelopes. Failures throw `HttpError`,
 * whose `serverCode` is the server's (`too_large`, `limit`, `rate_limited`,
 * `not_found`, `disabled`, `unknown_account`, …).
 */

/** The server's caps, mirrored so the app can say so before uploading. */
export const BACKUP_LIMITS = {
  /** One blob. */
  bytes: 20 * 1024 * 1024,
  /** Slots an account. */
  slots: 8,
  /** One `backup/put` a slot this often. */
  putIntervalMs: 60_000,
} as const

/** A blob of up to 20 MiB, on a phone connection. */
const BLOB_TIMEOUT_MS = 90_000

export type BackupSlot = {
  slotId: string
  /** The blob's bytes. */
  size: number
  /** Epoch ms, the server's clock. */
  uploadedAt: number
}

const isSlot = (value: unknown): value is BackupSlot => {
  const slot = value as Partial<BackupSlot> | null
  return (
    typeof slot?.slotId === 'string' &&
    RELAY_ID_PATTERN.test(slot.slotId) &&
    typeof slot.size === 'number' &&
    typeof slot.uploadedAt === 'number'
  )
}

/** Replaces this slot's blob. Resolves the server's upload time. */
export async function putBackup(
  options: RegisterAccountOptions,
  slotId: string,
  blob: Uint8Array
): Promise<{ uploadedAt: number }> {
  const response = await sendSignedAccountOp<{
    ok?: boolean
    uploadedAt?: unknown
  }>(
    'backup/put',
    { slotId, size: blob.length, sha256: backupBlobDigest(blob) },
    options,
    { rawBody: blob, timeoutMs: BLOB_TIMEOUT_MS }
  )
  const uploadedAt = response.data?.uploadedAt
  if (response.data?.ok !== true || typeof uploadedAt !== 'number')
    throw new HttpError('server', response.status, 'unexpected_response')
  return { uploadedAt }
}

/** The account's slots: ids, sizes and upload times, never their contents. */
export async function listBackups(
  options: RegisterAccountOptions
): Promise<BackupSlot[]> {
  const response = await sendSignedAccountOp<{
    ok?: boolean
    slots?: unknown
  }>('backup/list', {}, options, { idempotent: true })
  const slots = response.data?.slots
  if (
    response.data?.ok !== true ||
    !Array.isArray(slots) ||
    !slots.every(isSlot)
  )
    throw new HttpError('server', response.status, 'unexpected_response')
  return slots.map(({ slotId, size, uploadedAt }) => ({
    slotId,
    size,
    uploadedAt,
  }))
}

/** One slot's blob, exactly as put; `not_found` without one. */
export async function getBackup(
  options: RegisterAccountOptions,
  slotId: string
): Promise<Uint8Array> {
  const response = await sendSignedAccountOp<Uint8Array>(
    'backup/get',
    { slotId },
    options,
    { responseType: 'bytes', timeoutMs: BLOB_TIMEOUT_MS, idempotent: true }
  )
  return response.data
}

/** Deletes one slot, or every slot of the account without `slotId`. */
export async function deleteBackup(
  options: RegisterAccountOptions,
  slotId?: string
): Promise<void> {
  const response = await sendSignedAccountOp<{ ok?: boolean }>(
    'backup/delete',
    slotId ? { slotId } : {},
    options,
    { idempotent: true }
  )
  if (response.data?.ok !== true)
    throw new HttpError('server', response.status, 'unexpected_response')
}
