import Avatar from '@/components/ui/Avatar'
import useTheme from '@/contexts/theme'
import type { ProfileAvatar } from '@/types/avatar'

const NONE: ProfileAvatar = { type: 'none', value: '' }

export default function TerritoryPersonAvatar({
  name,
  avatar,
  color,
  size = 32,
}: {
  name: string
  avatar?: ProfileAvatar
  color?: string
  size?: number
}) {
  const theme = useTheme()
  return (
    <Avatar
      avatar={avatar ?? NONE}
      name={name}
      size={size}
      background={color ?? theme.colors.accentTranslucent}
    />
  )
}
