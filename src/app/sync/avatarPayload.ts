import { Contact } from '@/types/contact'
import { ProfileAvatar } from '@/types/avatar'
import { hasCapability } from '@/lib/platformCapabilities'
import { isInlineImage } from '@/lib/avatarFilePolicy'
import {
  markerForContact,
  MARKER_PROFILE,
} from '@/lib/syncTransport/imageNames'

/**
 * A photo only this page holds: the web keeps picked photos as `data:` or
 * `blob:` URLs and, without `syncedPhotos`, has no photo sync to upload them,
 * so no phone could ever fetch what a reference to one points at.
 */
const isUnsyncablePhoto = (avatar: ProfileAvatar): boolean =>
  !hasCapability('syncedPhotos') &&
  avatar.type === 'image' &&
  isInlineImage(avatar.value)

const NO_AVATAR: ProfileAvatar = { type: 'none', value: '' }

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
  // A reference to nothing would replace the phone's own photo.
  if (isUnsyncablePhoto(contact.avatar)) return { ...synced, avatar: NO_AVATAR }
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
  if (isUnsyncablePhoto(avatar)) return NO_AVATAR
  return { ...avatar, value: MARKER_PROFILE }
}
