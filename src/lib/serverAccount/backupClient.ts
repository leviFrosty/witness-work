import { HttpError } from '@/lib/http/request'
import { RELAY_ID_PATTERN } from '@/lib/bytes'
import {
  type BearerAccountOptions,
  sendBearerAccountOp,
  sendSignedAccountOp,
  type SignedAccountOptions,
} from '@/lib/serverAccount/client'
import { backupBlobDigest } from '@/lib/serverAccount/backupCrypto'

/**
 * `/accounts/v1/backup/*` (docs/accounts-protocol.md, "Backup"): every op is
 * **Bearer**, with the account session's token. `put` sends the blob as the raw
 * body with its slot and digest in headers; the rest send JSON. `delete` is
 * also signed by the account key, so a leaked token alone can't delete backups.
 * Failures throw `HttpError`, whose `serverCode` is the server's (`too_large`,
 * `limit`, `rate_limited`, `not_found`, `disabled`, …).
 */

/** Bearer ops, and the account key's signature for `delete`. */
export type BackupClientOptions = BearerAccountOptions & {
  sign: SignedAccountOptions
}

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
  options: BearerAccountOptions,
  slotId: string,
  blob: Uint8Array
): Promise<{ uploadedAt: number }> {
  // `size` is the body's Content-Length.
  const response = await sendBearerAccountOp<{
    ok?: boolean
    uploadedAt?: unknown
  }>('backup/put', null, options, {
    rawBody: blob,
    headers: {
      'x-ww-slot-id': slotId,
      'x-ww-sha256': await backupBlobDigest(blob),
    },
    timeoutMs: BLOB_TIMEOUT_MS,
  })
  const uploadedAt = response.data?.uploadedAt
  if (response.data?.ok !== true || typeof uploadedAt !== 'number')
    throw new HttpError('server', response.status, 'unexpected_response')
  return { uploadedAt }
}

/** The account's slots: ids, sizes and upload times, never their contents. */
export async function listBackups(
  options: BearerAccountOptions
): Promise<BackupSlot[]> {
  const response = await sendBearerAccountOp<{
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
  options: BearerAccountOptions,
  slotId: string
): Promise<Uint8Array> {
  const response = await sendBearerAccountOp<Uint8Array>(
    'backup/get',
    { slotId },
    options,
    { responseType: 'bytes', timeoutMs: BLOB_TIMEOUT_MS, idempotent: true }
  )
  return response.data
}

/**
 * Deletes one slot, or every slot of the account without `slotId`. Bearer and
 * the account key's envelope: the token's account must be the key's.
 */
export async function deleteBackup(
  options: BackupClientOptions,
  slotId?: string
): Promise<void> {
  const response = await options.authorize((authorization) =>
    sendSignedAccountOp<{ ok?: boolean }>(
      'backup/delete',
      slotId ? { slotId } : {},
      { ...options.sign, signal: options.signal },
      { headers: { authorization }, idempotent: true }
    )
  )
  if (response.data?.ok !== true)
    throw new HttpError('server', response.status, 'unexpected_response')
}
