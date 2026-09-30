import { Contact } from '@/types/contact'
import { ProfileAvatar } from '@/types/avatar'
import { markerForContact, MARKER_PROFILE } from '@/app/sync/imageNames'

/** Send immutable photo references regardless of local transfer consent. */
export function sanitizeContactAvatar(
  contact: Contact,
  _opts: { includeImages: boolean }
): Contact {
  const {
    avatarMeta: _metadata,
    dismissedNotificationId: _notificationId,
    ...synced
  } = contact
  if (contact.avatar?.type !== 'image') return synced
  return {
    ...synced,
    avatar: { ...contact.avatar, value: markerForContact(contact.id) },
  }
}

/** Profile photo references use the same consent-independent rule. */
export function sanitizeProfileAvatar(
  avatar: ProfileAvatar | undefined,
  _opts: { includeImages: boolean }
): ProfileAvatar | undefined {
  if (!avatar) return avatar
  if (avatar.type !== 'image') return avatar
  return { ...avatar, value: MARKER_PROFILE }
}
