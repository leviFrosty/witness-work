import type { UploadStatus } from '../../../modules/icloud-bridge'

/**
 * An upload problem worth showing. `icloud-full` is the user's iCloud storage
 * running out (`NSUbiquitousFileNotUploadedDueToQuotaError`); `upload-failed`
 * is any other upload error iCloud reports.
 */
export type UploadIssue = 'icloud-full' | 'upload-failed'

/**
 * What one upload-status check means for this device's snapshot:
 *
 * - `uploaded` — iCloud has the current version.
 * - `waiting` — still uploading, or queued without an error.
 * - `unreachable` — iCloud's servers couldn't be reached
 *   (`NSUbiquitousFileUbiquityServerNotAvailable`). Usually a network blip that
 *   iCloud retries on its own, so it isn't an issue by itself: the status keeps
 *   showing "Uploading" and the backup reminder stays unmuted until an upload
 *   is confirmed.
 * - An `UploadIssue`.
 */
export type UploadVerdict = 'uploaded' | 'waiting' | 'unreachable' | UploadIssue

const COCOA_ERROR_DOMAIN = 'NSCocoaErrorDomain'
/** `NSUbiquitousFileNotUploadedDueToQuotaError` in FoundationErrors.h. */
const QUOTA_ERROR_CODE = 4354
/** `NSUbiquitousFileUbiquityServerNotAvailable` in FoundationErrors.h. */
const SERVER_UNAVAILABLE_ERROR_CODE = 4355

export function classifyUploadStatus(status: UploadStatus): UploadVerdict {
  // iCloud can keep a stale error next to a finished upload; the upload wins.
  if (status.uploaded) return 'uploaded'
  const { error } = status
  if (!error) return 'waiting'
  if (error.domain === COCOA_ERROR_DOMAIN) {
    if (error.code === QUOTA_ERROR_CODE) return 'icloud-full'
    if (error.code === SERVER_UNAVAILABLE_ERROR_CODE) return 'unreachable'
  }
  return 'upload-failed'
}
