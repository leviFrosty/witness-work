import { HttpError } from '@/lib/http/request'
import { RELAY_ID_PATTERN } from '@/lib/bytes'
import {
  type BearerAccountOptions,
  sendBearerAccountOp,
  sendSignedAccountOp,
  type SignedAccountOptions,
} from '@/lib/serverAccount/client'
import { backupBlobDigest } from '@/lib/serverAccount/backupCrypto'

export type BackupClientOptions = BearerAccountOptions & {
  sign: SignedAccountOptions
}

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
  blob: Uint8Array
): Promise<{ uploadedAt: number }> {
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
  const response = await sendBearerAccountOp<Uint8Array>(
    'backup/get',
    { slotId },
    options,
    { responseType: 'bytes', timeoutMs: BLOB_TIMEOUT_MS, idempotent: true }
  )
  return response.data
}

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
