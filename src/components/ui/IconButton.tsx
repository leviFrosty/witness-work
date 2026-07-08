import Button from '@/components/ui/Button'
import type { LucideProps } from 'lucide-react-native'
import {
  Insets,
  StyleProp,
  StyleSheet,
  TextStyle,
  ViewStyle,
} from 'react-native'
import { ThemeContext } from '@/contexts/theme'
import { useContext } from 'react'
import { ThemeSizes } from '@/types/theme'
import type { AppIcon } from '@/components/ui/LucideIcon'

export type IconButtonIcon = AppIcon

type Props = {
  icon: IconButtonIcon
  onPress?: () => void
  onLongPress?: () => void
  size?: ThemeSizes | number
  style?: StyleProp<ViewStyle>
  iconStyle?: StyleProp<TextStyle>
  color?: string
  noTransform?: boolean
  accessibilityLabel?: string
  /**
   * Override the underlying Button's default 10px hitSlop. Set this when two
   * IconButtons sit side-by-side with a small gap — the default slop overlaps
   * and RN resolves overlapping siblings to the last one rendered, so a tap on
   * the inner edge of the first button fires the second.
   */
  hitSlop?: number | Insets
}

const IconButton = ({
  onPress,
  onLongPress,
  icon,
  style,
  size: _size,
  iconStyle,
  color,
  noTransform,
  accessibilityLabel,
  hitSlop,
}: Props) => {
  const theme = useContext(ThemeContext)
  const size = typeof _size === 'number' ? _size : theme.fontSize(_size)
  const Icon = icon
  const iconStyleWithFallback = [
    { color: color || theme.colors.textAlt },
    iconStyle,
  ] satisfies StyleProp<TextStyle>
  const iconColor = StyleSheet.flatten(iconStyleWithFallback)?.color

  return (
    <Button
      style={style}
      noTransform={noTransform ?? !onPress}
      disabled={!onPress && !onLongPress}
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={hitSlop}
      accessibilityLabel={accessibilityLabel}
    >
      <Icon
        color={iconColor}
        size={size}
        style={iconStyleWithFallback as LucideProps['style']}
      />
    </Button>
  )
}

export default IconButton
