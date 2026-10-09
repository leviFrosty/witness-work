import {
  SyncTransportError,
  type SyncTransportErrorCode,
} from '@/lib/syncTransport/types'

/**
 * Classifies a rejection from `modules/icloud-bridge` the way Drive's errors
 * are classified, so the engine treats routine iCloud failures as expected
 * (retried, a breadcrumb) and reports only the unexpected ones.
 *
 * - Signed out or iCloud Drive off for the app: `unauthorized`.
 * - Coordinated reads, writes and deletes that iCloud couldn't complete
 *   (`ICLOUD_COORDINATE`, `ICLOUD_WRITE`, …): `network`, the service being
 *   unavailable for now. iCloud retries its own uploads; the engine retries the
 *   write.
 * - Everything else, such as a filename outside the namespace (a bug): `unknown`.
 *
 * A full iCloud account isn't a write failure here: writes land in the local
 * container and `uploadStatus` reports the quota later.
 */
const IO_CODES = new Set([
  'ICLOUD_COORDINATE',
  'ICLOUD_WRITE',
  'ICLOUD_DELETE',
  'ICLOUD_READ_ALL',
  'ICLOUD_LIST',
  'ICLOUD_WRITE_BINARY',
  'ICLOUD_READ_BINARY',
  'ICLOUD_LIST_BINARY',
  'ICLOUD_DELETE_BINARY',
  'ICLOUD_DELETE_ALL',
  'ICLOUD_DELETE_ALL_BINARIES',
])

export function classifyICloudError(error: unknown): SyncTransportErrorCode {
  if (error instanceof SyncTransportError) return error.code
  const { code, message } = (error ?? {}) as {
    code?: unknown
    message?: unknown
  }
  const text = typeof message === 'string' ? message : String(error)
  if (/iCloud is unavailable/i.test(text)) return 'unauthorized'
  if (typeof code !== 'string') return 'unknown'
  // A photo whose local file is gone won't appear by retrying.
  if (/does not exist|outside/i.test(text)) return 'unknown'
  if (IO_CODES.has(code)) return 'network'
  return 'unknown'
}

/** Re-throws a bridge rejection as a classified `SyncTransportError`. */
export function toICloudTransportError(error: unknown): SyncTransportError {
  if (error instanceof SyncTransportError) return error
  const message = error instanceof Error ? error.message : String(error)
  return new SyncTransportError(classifyICloudError(error), message)
}
