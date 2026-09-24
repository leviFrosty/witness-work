import Avatar from '@/components/ui/Avatar'
import useTheme from '@/contexts/theme'
import type { ProfileAvatar } from '@/types/avatar'
import { buddyColor } from '@/features/buddies/lib/buddyColors'
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
  colorIndex,
  size = 44,
  focusable,
}: {
  avatar?: SharedAvatar
  name: string
  colorIndex?: number
  size?: number
  focusable?: boolean
}) {
  const theme = useTheme()
  return (
    <Avatar
      avatar={toProfileAvatar(avatar)}
      name={name}
      size={size}
      focusable={focusable}
      background={
        colorIndex === undefined ? undefined : buddyColor(theme, colorIndex)
      }
    />
  )
}
