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

export type BackupClientOptions = BearerSignedAccountOptions

export const BACKUP_LIMITS = {
  bytes: 20 * 1024 * 1024,

  slots: 8,

  putIntervalMs: 60_000,
} as const

const BLOB_TIMEOUT_MS = 90_000

export type BackupSlot = {
  slotId: string

  size: number

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

export async function putBackup(
  options: BearerAccountOptions,
  slotId: string,
  blob: Uint8Array,
  { ifMatch }: { ifMatch?: string } = {}
): Promise<{ uploadedAt: number }> {
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

export async function getBackup(
  options: BearerAccountOptions,
  slotId: string
): Promise<Uint8Array> {
  return (await getBackupSlot(options, slotId)).blob
}

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
