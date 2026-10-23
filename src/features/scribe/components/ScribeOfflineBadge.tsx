import { WifiOff as WifiOffIcon } from 'lucide-react-native'
import { View } from 'react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import { getReadableTextColor } from '@/lib/color'
import i18n from '@/lib/locales'

interface Props {
  /** The surface behind the control, so the badge reads as cut out of it. */
  ringColor: string
  size?: number
  /** Distance from the control's bottom-right corner (negative overhangs). */
  offset?: number
}

/**
 * The no-internet marker on a disabled Scribe AI entry: a small disc at the
 * control's bottom-right. Decorative to touch (the control keeps its full
 * target); screen readers hear it as part of the control's label, so it only
 * announces itself when focused on its own.
 */
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
