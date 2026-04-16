import { Image, View } from 'react-native'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faUser } from '@fortawesome/free-solid-svg-icons'
import useTheme from '../contexts/theme'
import Text from './MyText'
import { ProfileAvatar } from '../stores/preferences'

interface Props {
  avatar: ProfileAvatar
  name?: string
  size?: number
  /** Background of the circle when avatar is an emoji or letter fallback. */
  background?: string
}

const Avatar = ({ avatar, name, size = 44, background }: Props) => {
  const theme = useTheme()

  if (avatar.type === 'image' && avatar.value) {
    return (
      <Image
        source={{ uri: avatar.value }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.colors.border,
        }}
      />
    )
  }

  const base = {
    width: size,
    height: size,
    borderRadius: size / 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  }

  if (avatar.type === 'emoji' && avatar.value) {
    return (
      <View
        style={{
          ...base,
          backgroundColor: background ?? theme.colors.accentBackground,
        }}
      >
        <Text style={{ fontSize: size * 0.5 }}>{avatar.value}</Text>
      </View>
    )
  }

  const bg = background ?? theme.colors.accent
  const initial = (name ?? '').trim().charAt(0).toUpperCase()

  if (initial) {
    return (
      <View style={{ ...base, backgroundColor: bg }}>
        <Text
          style={{
            fontSize: size * 0.42,
            color: theme.colors.textInverse,
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {initial}
        </Text>
      </View>
    )
  }

  return (
    <View style={{ ...base, backgroundColor: bg }}>
      <FontAwesomeIcon
        icon={faUser}
        size={size * 0.42}
        color={theme.colors.textInverse}
      />
    </View>
  )
}

export default Avatar
