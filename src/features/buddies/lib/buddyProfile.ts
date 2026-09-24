import * as ImageManipulator from 'expo-image-manipulator'
import moment from 'moment'
import { getStartDateLabels } from '@/constants/publisher'
import i18n, { type TranslationKey } from '@/lib/locales'
import { tracksTenure } from '@/lib/publisherCapabilities'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import type { Publisher } from '@/types/publisher'
import {
  BuddyTenure,
  BuddyTenureKind,
  MAX_AVATAR_IMAGE_CHARS,
} from '@/features/buddies/lib/schemas'
import type { BuddyProfile } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

const MAX_NAME_LENGTH = 60
const THUMBNAIL_SIZE = 96

/** The Profile "… since" badge each Tenure kind renders with. */
export const BUDDY_TENURE_BADGES: Record<BuddyTenureKind, TranslationKey> = {
  pioneer: 'profileStatPioneer',
  specialPioneer: 'profileStatSpecialPioneer',
  circuitOverseer: 'profileStatCircuitOverseer',
  regularAuxiliary: 'profileStatRegularAuxiliary',
}

const KIND_BY_BADGE = Object.fromEntries(
  Object.entries(BUDDY_TENURE_BADGES).map(([kind, badge]) => [badge, kind])
) as Record<TranslationKey, BuddyTenureKind>

/** The Tenure buddies see for a role and Tenure Start Date, if any. */
export function buddyTenureFor(
  role: Publisher,
  tenureStartDate: Date | null
): BuddyTenure | undefined {
  if (!tracksTenure(role) || !tenureStartDate) return undefined
  const kind = KIND_BY_BADGE[getStartDateLabels(role).badge]
  return kind
    ? { kind, since: moment(tenureStartDate).format('YYYY-MM') }
    : undefined
}

const isLocalImage = (value: string) => value.startsWith('file://')

/**
 * The Profile name, avatar, and Tenure buddies can see, before the engine drops
 * whatever the User chose not to share. A photo is shared only once its
 * thumbnail exists (`refreshBuddyAvatarThumbnail`).
 */
export function currentBuddyProfile(): BuddyProfile {
  const { name, avatar } = useProfile.getState()
  const { role, tenureStartDate } = usePreferences.getState()
  const thumbnail = useBuddies.getState().avatarThumbnail
  return {
    name: name.trim().slice(0, MAX_NAME_LENGTH),
    avatar:
      avatar.type === 'emoji' && avatar.value
        ? { t: 'emoji', v: avatar.value }
        : avatar.type === 'image' && thumbnail?.source === avatar.value
          ? { t: 'image', v: thumbnail.data }
          : undefined,
    tenure: buddyTenureFor(role, tenureStartDate),
  }
}

/**
 * Shrinks the Profile photo for Buddy Cards when it changed. Returns whether
 * the shared avatar changed, so the caller can republish.
 */
export async function refreshBuddyAvatarThumbnail(): Promise<boolean> {
  const { avatar } = useProfile.getState()
  const current = useBuddies.getState().avatarThumbnail
  if (avatar.type !== 'image' || !isLocalImage(avatar.value)) {
    if (!current) return false
    useBuddies.setState({ avatarThumbnail: null })
    return true
  }
  if (current?.source === avatar.value) return false
  const result = await ImageManipulator.manipulateAsync(
    // Drop the `?t=` cache-buster; it isn't part of the file path.
    avatar.value.split('?')[0],
    [{ resize: { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE } }],
    {
      compress: 0.6,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    }
  )
  if (!result.base64 || result.base64.length > MAX_AVATAR_IMAGE_CHARS)
    return false
  useBuddies.setState({
    avatarThumbnail: { source: avatar.value, data: result.base64 },
  })
  return true
}

/** "Regular pioneer since September 2019" for a buddy's shared Tenure. */
export function buddyTenureLabel(tenure: BuddyTenure): string {
  return `${i18n.t(BUDDY_TENURE_BADGES[tenure.kind])} ${moment(
    tenure.since,
    'YYYY-MM'
  ).format('MMMM YYYY')}`
}
