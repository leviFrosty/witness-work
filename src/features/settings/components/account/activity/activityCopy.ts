import i18n from '@/lib/locales'
import type { AccountActivityContext } from '@/app/account/accountActivity'
import type {
  ActivityEntry,
  ActivitySession,
  SessionPlatform,
} from '@/lib/serverAccount/activityClient'

export function platformDeviceName(platform: SessionPlatform | null): string {
  switch (platform) {
    case 'ios':
      return i18n.t('accountActivity_deviceIos')
    case 'android':
      return i18n.t('accountActivity_deviceAndroid')
    case 'dev':
      return i18n.t('accountActivity_deviceDev')
    default:
      return i18n.t('accountActivity_deviceUnknown')
  }
}

export function deviceTitle(
  device: { platform: SessionPlatform | null; device: string | null },
  context: Pick<AccountActivityContext, 'readLabel'>
): string {
  const name = context.readLabel(device.device)?.name.trim()
  return name || platformDeviceName(device.platform)
}

export type DeviceKind = 'phone' | 'tablet' | 'computer'

const TABLET_MODEL = /\b(iPad|tablet)\b/i

export function deviceKind(
  device: { platform: SessionPlatform | null; device: string | null },
  context: Pick<AccountActivityContext, 'readLabel'>
): DeviceKind {
  const label = context.readLabel(device.device)
  if (!label) return device.platform === 'dev' ? 'computer' : 'phone'
  const model = label.model.trim() || label.name
  return TABLET_MODEL.test(model) ? 'tablet' : 'phone'
}

function deviceInSentence(
  session: ActivitySession,
  context: AccountActivityContext
): string {
  if (context.isThisDevice(session.sessionId))
    return i18n.t('accountActivity_thisDevice')
  const name = context.readLabel(session.device)?.name.trim()
  if (name) return name
  switch (session.platform) {
    case 'ios':
      return i18n.t('accountActivity_anIos')
    case 'android':
      return i18n.t('accountActivity_anAndroid')
    case 'dev':
      return i18n.t('accountActivity_aDev')
    default:
      return i18n.t('accountActivity_aDevice')
  }
}

export const isSuspiciousActivity = (entry: ActivityEntry) =>
  entry.kind === 'session.refresh_reused'

export type ActivityRow = { entry: ActivityEntry; count: number }

export const RESTORE_WINDOW_MS = 5 * 60_000

export function activityRows(entries: readonly ActivityEntry[]): ActivityRow[] {
  const rows: ActivityRow[] = []
  let previous: ActivityEntry | null = null
  for (const entry of entries) {
    const row = rows[rows.length - 1]
    if (
      row &&
      previous &&
      entry.kind === 'backup.downloaded' &&
      row.entry.kind === 'backup.downloaded' &&
      (entry.session?.sessionId ?? null) ===
        (row.entry.session?.sessionId ?? null) &&
      Math.abs(previous.createdAt - entry.createdAt) <= RESTORE_WINDOW_MS
    )
      row.count++
    else rows.push({ entry, count: 1 })
    previous = entry
  }
  return rows
}

export function activityTitle(
  entry: ActivityEntry,
  context: AccountActivityContext,
  count = 1
): string {
  const device = entry.session ? deviceInSentence(entry.session, context) : null
  const actor = entry.actor ? deviceInSentence(entry.actor, context) : null
  switch (entry.kind) {
    case 'account.created':
      return i18n.t('accountActivity_created')
    case 'account.suspended':
      return i18n.t('accountActivity_suspended')
    case 'account.reinstated':
      return i18n.t('accountActivity_reinstated')
    case 'session.opened':
      return device
        ? i18n.t('accountActivity_signedIn', { device })
        : i18n.t('accountActivity_signedInUnknown')
    case 'session.signed_out':
      return device
        ? i18n.t('accountActivity_signedOut', { device })
        : i18n.t('accountActivity_signedOutUnknown')
    case 'session.revoked':
      return i18n.t('accountActivity_revoked', {
        device: device ?? i18n.t('accountActivity_aDevice'),
        actor: actor ?? i18n.t('accountActivity_anotherDevice'),
      })
    case 'session.replaced':
      return i18n.t('accountActivity_replaced', {
        device: device ?? i18n.t('accountActivity_aDevice'),
        actor: actor ?? i18n.t('accountActivity_anotherDevice'),
      })
    case 'session.refresh_reused':
      return i18n.t('accountActivity_reused', {
        device: device ?? i18n.t('accountActivity_aDevice'),
      })
    case 'handoff.sent':
      return device
        ? i18n.t('accountActivity_handoff', { device })
        : i18n.t('accountActivity_handoffUnknown')
    case 'backup.deleted':
      if (entry.slotId == null)
        return device
          ? i18n.t('accountActivity_backupsDeleted', { device })
          : i18n.t('accountActivity_backupsDeletedUnknown')
      return device
        ? i18n.t('accountActivity_backupDeleted', { device })
        : i18n.t('accountActivity_backupDeletedUnknown')
    case 'buddies.inbox_linked':
      return device
        ? i18n.t('accountActivity_buddiesLinked', { device })
        : i18n.t('accountActivity_buddiesLinkedUnknown')
    case 'buddies.deleted':
      return device
        ? i18n.t('accountActivity_buddiesDeleted', { device })
        : i18n.t('accountActivity_buddiesDeletedUnknown')
    case 'backup.downloaded':
      if (count > 1)
        return device
          ? i18n.t('accountActivity_backupsDownloaded', { device, count })
          : i18n.t('accountActivity_backupsDownloadedUnknown', { count })
      return device
        ? i18n.t('accountActivity_backupDownloaded', { device })
        : i18n.t('accountActivity_backupDownloadedUnknown')
  }
}

export function activityDetail(entry: ActivityEntry): string | null {
  switch (entry.kind) {
    case 'session.refresh_reused':
      return i18n.t('accountActivity_reusedDetail')
    case 'session.replaced':
      return i18n.t('accountActivity_replacedDetail')
    case 'account.suspended':
      return i18n.t('accountActivity_suspendedDetail')
    default:
      return null
  }
}
