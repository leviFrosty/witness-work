import i18n from '@/lib/locales'
import type { AccountActivityContext } from '@/app/account/accountActivity'
import type {
  ActivityEntry,
  ActivitySession,
  SessionPlatform,
} from '@/lib/serverAccount/activityClient'

/**
 * The words for Settings → Account → Devices and Activity (ADR 0028). Device
 * names come from sealed labels this device opens; without one, a device is
 * named by its platform.
 */

/** "iPhone or iPad", "Android device", …: a device without a readable label. */
export function platformDeviceName(platform: SessionPlatform | null): string {
  switch (platform) {
    case 'ios':
      return i18n.t('accountActivity_deviceIos')
    case 'android':
      return i18n.t('accountActivity_deviceAndroid')
    case 'web':
      return i18n.t('accountActivity_deviceWeb')
    case 'dev':
      return i18n.t('accountActivity_deviceDev')
    default:
      return i18n.t('accountActivity_deviceUnknown')
  }
}

/** A device's own name, for a row title: its label, else its platform. */
export function deviceTitle(
  device: { platform: SessionPlatform | null; device: string | null },
  context: Pick<AccountActivityContext, 'readLabel'>
): string {
  const name = context.readLabel(device.device)?.name.trim()
  return name || platformDeviceName(device.platform)
}

/** What a device row's icon shows. */
export type DeviceKind = 'phone' | 'tablet' | 'computer' | 'browser' | 'unknown'

const TABLET_MODEL = /\b(iPad|tablet)\b/i

/**
 * A browser session is a browser, whatever its label says. An iPad or an
 * Android tablet ("Pixel Tablet") by its label's model, or its name when the
 * model is blank; a development build without a label is a computer; a session
 * of a platform this version doesn't know, without a label, is a generic
 * device; anything else is a phone.
 */
export function deviceKind(
  device: { platform: SessionPlatform | null; device: string | null },
  context: Pick<AccountActivityContext, 'readLabel'>
): DeviceKind {
  if (device.platform === 'web') return 'browser'
  const label = context.readLabel(device.device)
  if (!label) {
    if (device.platform === 'dev') return 'computer'
    return device.platform === null ? 'unknown' : 'phone'
  }
  const model = label.model.trim() || label.name
  return TABLET_MODEL.test(model) ? 'tablet' : 'phone'
}

/** A device inside a sentence: "this device", its name, or "an iPhone or iPad". */
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
    case 'web':
      return i18n.t('accountActivity_aWeb')
    case 'dev':
      return i18n.t('accountActivity_aDev')
    default:
      return i18n.t('accountActivity_aDevice')
  }
}

/** Entries the User should look at: a refresh token someone else may hold. */
export const isSuspiciousActivity = (entry: ActivityEntry) =>
  entry.kind === 'session.refresh_reused'

/** One row of Account Activity: an entry, standing for `count` like it. */
export type ActivityRow = { entry: ActivityEntry; count: number }

/** Downloads this close together are one restore. */
export const RESTORE_WINDOW_MS = 5 * 60_000

/**
 * The entries as rows. A restore downloads every slot, and the server logs each
 * (`backup.downloaded`, one per slot) with nothing this device can tell apart:
 * slot ids mean nothing to the User and device names are inside the backups. So
 * a session's downloads within `RESTORE_WINDOW_MS` of each other are one row,
 * "2 backups downloaded on this device". The row keeps the newest entry's id.
 */
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

/**
 * One entry's title, naming its devices from this device's point of view;
 * `count` entries like it for a merged row (`activityRows`).
 */
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
      if (!device) return i18n.t('accountActivity_signedInUnknown')
      switch (entry.method) {
        case 'passkey':
          return i18n.t('accountActivity_signedInPasskey', { device })
        case 'recovery':
          return i18n.t('accountActivity_signedInRecovery', { device })
        case 'signup':
          return i18n.t('accountActivity_signedUp', { device })
        case 'approval':
          return i18n.t('accountActivity_signedInApproved', {
            device,
            actor: actor ?? i18n.t('accountActivity_anotherDevice'),
          })
        default:
          return i18n.t('accountActivity_signedIn', { device })
      }
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
    case 'passkey.added':
      return device
        ? i18n.t('accountActivity_passkeyAdded', { device })
        : i18n.t('accountActivity_passkeyAddedUnknown')
    case 'passkey.removed':
      return device
        ? i18n.t('accountActivity_passkeyRemoved', { device })
        : i18n.t('accountActivity_passkeyRemovedUnknown')
    case 'device.approved':
      return device
        ? i18n.t('accountActivity_deviceApproved', { device })
        : i18n.t('accountActivity_deviceApprovedUnknown')
    case 'account.key_changed':
      return device
        ? i18n.t('accountActivity_keyChanged', { device })
        : i18n.t('accountActivity_keyChangedUnknown')
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

/** A short explanation under the time, for entries that need one. */
export function activityDetail(entry: ActivityEntry): string | null {
  switch (entry.kind) {
    case 'session.refresh_reused':
      return i18n.t('accountActivity_reusedDetail')
    case 'session.replaced': {
      // The cap is by the ended session's platform. When that isn't known, a
      // browser that replaced it still means the browser cap; otherwise no
      // limit is named rather than guessing the phones'.
      const platform = entry.session?.platform
      if (platform === 'web' || (!platform && entry.actor?.platform === 'web'))
        return i18n.t('accountActivity_replacedWebDetail')
      return platform ? i18n.t('accountActivity_replacedDetail') : null
    }
    case 'account.suspended':
      return i18n.t('accountActivity_suspendedDetail')
    case 'account.key_changed':
      return i18n.t('accountActivity_keyChangedDetail')
    default:
      return null
  }
}
