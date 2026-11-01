import type { ReactNode } from 'react'
import Avatar from '@/components/ui/Avatar'
import useTheme from '@/contexts/theme'
import type { ProfileAvatar } from '@/types/avatar'
import {
  type BuddyColorSource,
  buddyColor,
} from '@/features/buddies/lib/buddyColors'
import type { BuddyAvatar as SharedAvatar } from '@/features/buddies/lib/schemas'

export function buddyProfileAvatar(
  avatar: SharedAvatar | undefined
): ProfileAvatar {
  if (avatar?.t === 'emoji') return { type: 'emoji', value: avatar.v }
  if (avatar?.t === 'image')
    return { type: 'image', value: `data:image/jpeg;base64,${avatar.v}` }
  return { type: 'none', value: '' }
}

export default function BuddyAvatar({
  avatar,
  name,
  color,
  background,
  size,
  focusable,
  loadFullImage,
  children,
}: {
  avatar?: SharedAvatar
  name: string

  color?: BuddyColorSource

  background?: string
  size?: number
  focusable?: boolean

  loadFullImage?: () => Promise<string | null>

  children?: ReactNode
}) {
  const theme = useTheme()
  return (
    <Avatar
      avatar={buddyProfileAvatar(avatar)}
      name={name}
      size={size}
      focusable={focusable}
      loadFullImage={loadFullImage}
      background={
        background ??
        (color === undefined ? undefined : buddyColor(theme, color))
      }
    >
      {children}
    </Avatar>
  )
}
