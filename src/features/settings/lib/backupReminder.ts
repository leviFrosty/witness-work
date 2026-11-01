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

  lastiCloudUploadedAt: number | null

  uploadConfirmationSupported: boolean

  accountBackupAt?: number | null
  now: number
}

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
  accountBackupAt = null,
  now,
}: BackupReminderInput): number | null {
  if (!remindMeAboutBackups) return null

  if (
    accountBackupAt &&
    moment(accountBackupAt).add(frequencyDays, 'days').isAfter(now)
  )
    return null

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
