import {
  SyncTransportError,
  type SyncTransportErrorCode,
} from '@/lib/syncTransport/types'

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

  if (/does not exist|outside/i.test(text)) return 'unknown'
  if (IO_CODES.has(code)) return 'network'
  return 'unknown'
}

export function toICloudTransportError(error: unknown): SyncTransportError {
  if (error instanceof SyncTransportError) return error
  const message = error instanceof Error ? error.message : String(error)
  return new SyncTransportError(classifyICloudError(error), message)
}
