import moment from 'moment'

export type BackupReminderInput = {
  remindMeAboutBackups: boolean
  frequencyDays: number
  installedOn: moment.MomentInput
  lastBackupDate: moment.MomentInput | null
  snoozedAt: number | null
  iCloudSyncEnabled: boolean
  lastiCloudPushedAt: number | null
  lastiCloudPulledAt: number | null
  /** When iCloud last confirmed uploading this device's snapshot. */
  lastiCloudUploadedAt: number | null
  /**
   * Whether this binary can confirm uploads. Without it, any recent push or
   * pull mutes the reminder, as before upload confirmation existed.
   */
  uploadConfirmationSupported: boolean
  now: number
}

/**
 * When a backup came due (epoch ms): `frequencyDays` after the last backup (or
 * install) or the last snooze, whichever is later. Null while not due.
 */
export function backupReminderDueAt({
  remindMeAboutBackups,
  frequencyDays,
  installedOn,
  lastBackupDate,
  snoozedAt,
  iCloudSyncEnabled,
  lastiCloudPushedAt,
  lastiCloudPulledAt,
  lastiCloudUploadedAt,
  uploadConfirmationSupported,
  now,
}: BackupReminderInput): number | null {
  if (!remindMeAboutBackups) return null

  // If iCloud sync is on and iCloud confirmed uploading this device's data
  // within the backup-freshness window, it's already off-device. Skip the
  // local-export nag. A pull doesn't count: it proves other devices' data
  // arrived, not that this device's left, and neither does a local write that
  // never uploaded (storage full, long offline). If sync has been silent longer
  // than the window, fall through and nag as usual.
  const lastSyncAt = uploadConfirmationSupported
    ? (lastiCloudUploadedAt ?? 0)
    : Math.max(lastiCloudPushedAt ?? 0, lastiCloudPulledAt ?? 0)
  if (
    iCloudSyncEnabled &&
    lastSyncAt > 0 &&
    moment(lastSyncAt).add(frequencyDays, 'days').isAfter(now)
  ) {
    return null
  }

  const lastCovered = moment.max(
    moment(lastBackupDate ?? installedOn),
    moment(snoozedAt ?? 0)
  )
  const dueAt = lastCovered.add(frequencyDays, 'days')
  return dueAt.isBefore(now) ? dueAt.valueOf() : null
}
