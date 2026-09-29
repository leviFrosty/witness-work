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
  now,
}: BackupReminderInput): number | null {
  if (!remindMeAboutBackups) return null

  // If iCloud sync is on and has successfully pushed or pulled within the
  // backup-freshness window, the user's data is already off-device. Skip the
  // local-export nag. If sync has been silent longer than the window (broken,
  // signed out), fall through and nag as usual.
  const lastSyncAt = Math.max(lastiCloudPushedAt ?? 0, lastiCloudPulledAt ?? 0)
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
