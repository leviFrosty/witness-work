import { HttpError } from '@/lib/http/request'
import { RELAY_ID_PATTERN } from '@/lib/bytes'
import {
  type BearerAccountOptions,
  type BearerSignedAccountOptions,
  okOnly,
  sendBearerAccountOp,
  sendBearerSignedAccountOp,
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
export type BackupClientOptions = BearerSignedAccountOptions

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

/**
 * Replaces this slot's blob. Resolves the server's upload time. With `ifMatch`
 * (the etag `getBackupSlot` read), only while the slot still holds those bytes:
 * other bytes or no slot is 412 `precondition_failed`, nothing written.
 */
export async function putBackup(
  options: BearerAccountOptions,
  slotId: string,
  blob: Uint8Array,
  { ifMatch }: { ifMatch?: string } = {}
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
      ...(ifMatch && { 'if-match': `"${ifMatch}"` }),
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
  return (await getBackupSlot(options, slotId)).blob
}

/**
 * `getBackup`, with the etag of the bytes read (from a strong `ETag`; null
 * without one), for a `putBackup` only over them.
 */
export async function getBackupSlot(
  options: BearerAccountOptions,
  slotId: string
): Promise<{ blob: Uint8Array; etag: string | null }> {
  const response = await sendBearerAccountOp<Uint8Array>(
    'backup/get',
    { slotId },
    options,
    { responseType: 'bytes', timeoutMs: BLOB_TIMEOUT_MS, idempotent: true }
  )
  const etag = /^"([^"]+)"$/.exec(response.headers.get('etag') ?? '')
  return { blob: response.data, etag: etag?.[1] ?? null }
}

/**
 * Deletes one slot, or every slot of the account without `slotId`. Bearer and
 * the account key's envelope: the token's account must be the key's.
 */
export async function deleteBackup(
  options: BackupClientOptions,
  slotId?: string
): Promise<void> {
  okOnly(
    await sendBearerSignedAccountOp(
      'backup/delete',
      slotId ? { slotId } : {},
      options,
      { idempotent: true }
    )
  )
}
