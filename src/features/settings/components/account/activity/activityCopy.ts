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
export type DeviceKind = 'phone' | 'tablet' | 'computer'

const TABLET_MODEL = /\b(iPad|tablet)\b/i

/**
 * An iPad or an Android tablet ("Pixel Tablet") by its label's model, or its
 * name when the model is blank; a development build without a label is a
 * computer; anything else is a phone.
 */
export function deviceKind(
  device: { platform: SessionPlatform | null; device: string | null },
  context: Pick<AccountActivityContext, 'readLabel'>
): DeviceKind {
  const label = context.readLabel(device.device)
  if (!label) return device.platform === 'dev' ? 'computer' : 'phone'
  const model = label.model.trim() || label.name
  return TABLET_MODEL.test(model) ? 'tablet' : 'phone'
}

/** A device inside a sentence: "this device", its name, or "an iPhone or iPad". */
function deviceInSentence(
  session: ActivitySession,
  context: AccountActivityContext
): string {
  if (session.sessionId === context.currentSessionId)
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

/** Entries the User should look at: a refresh token someone else may hold. */
export const isSuspiciousActivity = (entry: ActivityEntry) =>
  entry.kind === 'session.refresh_reused'

/** One entry's title, naming its devices from this device's point of view. */
export function activityTitle(
  entry: ActivityEntry,
  context: AccountActivityContext
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
    case 'session.replaced':
      return i18n.t('accountActivity_replacedDetail')
    case 'account.suspended':
      return i18n.t('accountActivity_suspendedDetail')
    default:
      return null
  }
}
