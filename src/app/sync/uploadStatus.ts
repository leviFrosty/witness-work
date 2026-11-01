import type { UploadStatus } from '@/lib/syncTransport/types'

export type UploadIssue = 'icloud-full' | 'upload-failed'

export type UploadVerdict = 'uploaded' | 'waiting' | 'unreachable' | UploadIssue

const COCOA_ERROR_DOMAIN = 'NSCocoaErrorDomain'

const QUOTA_ERROR_CODE = 4354

const SERVER_UNAVAILABLE_ERROR_CODE = 4355

export function classifyUploadStatus(status: UploadStatus): UploadVerdict {
  if (status.uploaded) return 'uploaded'
  const { error } = status
  if (!error) return 'waiting'
  if (error.domain === COCOA_ERROR_DOMAIN) {
    if (error.code === QUOTA_ERROR_CODE) return 'icloud-full'
    if (error.code === SERVER_UNAVAILABLE_ERROR_CODE) return 'unreachable'
  }
  return 'upload-failed'
}
