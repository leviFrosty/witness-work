import { WifiOff as WifiOffIcon } from 'lucide-react-native'
import { View } from 'react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import { getReadableTextColor } from '@/lib/color'
import i18n from '@/lib/locales'

interface Props {
  ringColor: string
  size?: number

  offset?: number
}

const ScribeOfflineBadge = ({ ringColor, size = 24, offset = -5 }: Props) => {
  const theme = useTheme()
  return (
    <View
      pointerEvents='none'
      accessible
      accessibilityRole='image'
      accessibilityLabel={i18n.t('scribe_offlineBadge')}
      style={{
        position: 'absolute',
        right: offset,
        bottom: offset,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.colors.warn,
        borderWidth: 2,
        borderColor: ringColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <LucideIcon
        icon={WifiOffIcon}
        size={size * 0.55}
        color={getReadableTextColor(theme.colors.warn)}
        strokeWidth={2.6}
      />
    </View>
  )
}

export default ScribeOfflineBadge
