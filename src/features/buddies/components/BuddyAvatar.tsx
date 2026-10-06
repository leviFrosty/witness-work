import type { ReactNode } from 'react'
import Avatar from '@/components/ui/Avatar'
import useTheme from '@/contexts/theme'
import type { ProfileAvatar } from '@/types/avatar'
import {
  type BuddyColorSource,
  buddyColor,
} from '@/features/buddies/lib/buddyColors'
import type { BuddyAvatar as SharedAvatar } from '@/features/buddies/lib/schemas'

function toProfileAvatar(avatar: SharedAvatar | undefined): ProfileAvatar {
  if (avatar?.t === 'emoji') return { type: 'emoji', value: avatar.v }
  if (avatar?.t === 'image')
    return { type: 'image', value: `data:image/jpeg;base64,${avatar.v}` }
  return { type: 'none', value: '' }
}

/** A buddy's shared photo or emoji, else their initial on their color. */
export default function BuddyAvatar({
  avatar,
  name,
  color,
  background,
  size,
  focusable,
  children,
}: {
  avatar?: SharedAvatar
  name: string
  /** The buddy whose color goes behind an initial or emoji. */
  color?: BuddyColorSource
  /** Replaces the buddy's color behind an initial or emoji. */
  background?: string
  size?: number
  focusable?: boolean
  /** E.g. an `AvatarBadge`. */
  children?: ReactNode
}) {
  const theme = useTheme()
  return (
    <Avatar
      avatar={toProfileAvatar(avatar)}
      name={name}
      size={size}
      focusable={focusable}
      background={
        background ??
        (color === undefined ? undefined : buddyColor(theme, color))
      }
    >
      {children}
    </Avatar>
  )
}
