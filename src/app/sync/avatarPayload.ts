import { Contact } from '@/types/contact'
import { ProfileAvatar } from '@/types/avatar'
import { hasCapability } from '@/lib/platformCapabilities'
import { isInlineImage } from '@/lib/avatarFilePolicy'
import {
  markerForContact,
  MARKER_PROFILE,
} from '@/lib/syncTransport/imageNames'

const isUnsyncablePhoto = (avatar: ProfileAvatar): boolean =>
  !hasCapability('syncedAvatarPhotos') &&
  avatar.type === 'image' &&
  isInlineImage(avatar.value)

const NO_AVATAR: ProfileAvatar = { type: 'none', value: '' }

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

  if (isUnsyncablePhoto(contact.avatar)) return { ...synced, avatar: NO_AVATAR }
  return {
    ...synced,
    avatar: { ...contact.avatar, value: markerForContact(contact.id) },
  }
}

export function sanitizeProfileAvatar(
  avatar: ProfileAvatar | undefined,
  _opts: { includeImages: boolean }
): ProfileAvatar | undefined {
  if (!avatar) return avatar
  if (avatar.type !== 'image') return avatar
  if (isUnsyncablePhoto(avatar)) return NO_AVATAR
  return { ...avatar, value: MARKER_PROFILE }
}
