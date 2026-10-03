import i18n from '@/lib/locales'
import { formatDateTime, formatRelative } from '@/lib/dates'

/**
 * How long a write may wait for iCloud's upload confirmation before the status
 * says "Uploading". Most uploads land within it, so a healthy sync doesn't
 * flicker on every edit.
 */
export const UPLOAD_GRACE_MS = 30_000

export type ICloudStatusInput = {
  enabled: boolean
  available: boolean
  paused: boolean
  needsResolution: boolean
  issue: string | null
  uploadIssue: 'icloud-full' | 'upload-failed' | null
  pendingPush: boolean
  uploadPendingSince: number | null
  /** False on a binary without `uploadStatus`: local activity is all it knows. */
  uploadConfirmationSupported: boolean
  lastPulledAt: number | null
  lastPushedAt: number | null
  lastUploadedAt: number | null
  now: number
}

export type ICloudStatusDisplay = { text: string; subtitle?: string }

export function buildICloudStatus({
  enabled,
  available,
  paused,
  needsResolution,
  issue,
  uploadIssue,
  pendingPush,
  uploadPendingSince,
  uploadConfirmationSupported,
  lastPulledAt,
  lastPushedAt,
  lastUploadedAt,
  now,
}: ICloudStatusInput): ICloudStatusDisplay {
  if (needsResolution) return { text: i18n.t('iCloudStatusNeedsResolution') }
  if (paused) return { text: i18n.t('iCloudStatusSupporterPaused') }
  if (!enabled) return { text: i18n.t('iCloudStatusDisabled') }
  if (!available) return { text: i18n.t('iCloudStatusUnavailable') }
  // Before read issues: nothing this device writes leaves it until there's room.
  if (uploadIssue === 'icloud-full')
    return { text: i18n.t('iCloudStatusStorageFull') }
  if (issue)
    return {
      text: i18n.t(
        issue === 'newer-version'
          ? 'iCloudStatusNewerVersion'
          : issue === 'invalid-file'
            ? 'iCloudStatusInvalidFile'
            : 'iCloudStatusRetryNeeded'
      ),
    }
  if (uploadIssue === 'upload-failed')
    return { text: i18n.t('iCloudStatusUploadFailed') }
  if (pendingPush) return { text: i18n.t('iCloudStatusPendingPush') }
  if (
    uploadPendingSince !== null &&
    now - uploadPendingSince >= UPLOAD_GRACE_MS
  )
    return { text: i18n.t('iCloudStatusUploading') }
  // A pull shows this device is current with iCloud; only a confirmed upload
  // shows iCloud is current with this device.
  const mostRecent = uploadConfirmationSupported
    ? Math.max(lastPulledAt ?? 0, lastUploadedAt ?? 0)
    : Math.max(lastPulledAt ?? 0, lastPushedAt ?? 0)
  if (!mostRecent) return { text: i18n.t('iCloudStatusWaitingForFirstSync') }
  return {
    text: i18n.t(
      uploadConfirmationSupported
        ? 'iCloudStatusLastSyncedConfirmed'
        : 'iCloudStatusLastSynced',
      { relative: formatRelative(mostRecent) }
    ),
    subtitle: formatDateTime(mostRecent, {
      style: 'medium',
      withSeconds: true,
    }),
  }
}
