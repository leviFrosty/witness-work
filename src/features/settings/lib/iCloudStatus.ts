import i18n from '@/lib/locales'
import { syncKey } from '@/lib/syncCopy'
import { formatDateTime, formatRelative } from '@/lib/dates'

export const UPLOAD_GRACE_MS = 30_000

export type ICloudStatusInput = {
  enabled: boolean
  available: boolean
  paused: boolean

  pausedBySwitch?: boolean
  needsResolution: boolean
  issue: string | null
  uploadIssue: 'icloud-full' | 'upload-failed' | null
  pendingPush: boolean
  uploadPendingSince: number | null

  uploadConfirmationSupported: boolean

  needsReconnect?: boolean

  offline?: boolean

  errorCode?: string | null

  networkErrorsMeanOffline?: boolean
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
  pausedBySwitch = false,
  needsResolution,
  issue,
  uploadIssue,
  pendingPush,
  uploadPendingSince,
  uploadConfirmationSupported,
  needsReconnect = false,
  offline = false,
  errorCode = null,
  networkErrorsMeanOffline = false,
  lastPulledAt,
  lastPushedAt,
  lastUploadedAt,
  now,
}: ICloudStatusInput): ICloudStatusDisplay {
  if (needsResolution)
    return { text: i18n.t(syncKey('iCloudStatusNeedsResolution')) }
  if (paused)
    return {
      text: i18n.t(
        pausedBySwitch
          ? 'iCloudStatusCloudSyncPaused'
          : syncKey('iCloudStatusSupporterPaused')
      ),
    }
  if (!enabled) return { text: i18n.t(syncKey('iCloudStatusDisabled')) }
  if (needsReconnect) return { text: i18n.t('googleDriveStatusNeedsReconnect') }
  if (!available) return { text: i18n.t(syncKey('iCloudStatusUnavailable')) }

  if (offline || (issue && errorCode === 'network' && networkErrorsMeanOffline))
    return { text: i18n.t('iCloudStatusOffline') }

  if (uploadIssue === 'icloud-full' || (issue && errorCode === 'storage-full'))
    return { text: i18n.t(syncKey('iCloudStatusStorageFull')) }
  if (issue && errorCode === 'rate-limited')
    return { text: i18n.t(syncKey('iCloudStatusRateLimited')) }
  if (issue)
    return {
      text: i18n.t(
        issue === 'newer-version'
          ? syncKey('iCloudStatusNewerVersion')
          : issue === 'invalid-file'
            ? syncKey('iCloudStatusInvalidFile')
            : syncKey('iCloudStatusRetryNeeded')
      ),
    }
  if (uploadIssue === 'upload-failed')
    return { text: i18n.t(syncKey('iCloudStatusUploadFailed')) }
  if (pendingPush) return { text: i18n.t(syncKey('iCloudStatusPendingPush')) }
  if (
    uploadPendingSince !== null &&
    now - uploadPendingSince >= UPLOAD_GRACE_MS
  )
    return { text: i18n.t(syncKey('iCloudStatusUploading')) }

  const mostRecent = uploadConfirmationSupported
    ? Math.max(lastPulledAt ?? 0, lastUploadedAt ?? 0)
    : Math.max(lastPulledAt ?? 0, lastPushedAt ?? 0)
  if (!mostRecent)
    return { text: i18n.t(syncKey('iCloudStatusWaitingForFirstSync')) }
  return {
    text: i18n.t(
      uploadConfirmationSupported
        ? syncKey('iCloudStatusLastSyncedConfirmed')
        : syncKey('iCloudStatusLastSynced'),
      { relative: formatRelative(mostRecent) }
    ),
    subtitle: formatDateTime(mostRecent, {
      style: 'medium',
      withSeconds: true,
    }),
  }
}
