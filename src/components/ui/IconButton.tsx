import Button from '@/components/ui/Button'
import type { LucideProps } from 'lucide-react-native'
import { X as XIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
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

/** Apple's minimum comfortable touch target, in points. */
const MIN_TARGET = 44

type Props = {
  icon: IconButtonIcon
  onPress?: () => void
  onLongPress?: () => void
  size?: ThemeSizes | number
  style?: StyleProp<ViewStyle>
  iconStyle?: StyleProp<TextStyle>
  color?: string
  fill?: string
  noTransform?: boolean
  /**
   * Read by screen readers. A pressable X icon defaults to "Close"; pass a
   * label for an X that means something else (remove, dismiss) and for every
   * other icon. A decorative X (no `onPress`) gets no default.
   */
  accessibilityLabel?: string
  /**
   * Touch slop around the icon. Unset means none: this prop always reaches
   * `Button`, so its 10px default doesn't apply. Keep side-by-side IconButtons'
   * slop under half their gap — RN resolves overlapping siblings to the last
   * one rendered, so a tap on the inner edge of the first button fires the
   * second.
   */
  hitSlop?: number | Insets
  /**
   * Grows the touch target to the 44pt minimum with hitSlop, so the layout and
   * look don't change. For lone controls with clear space around them, like a
   * modal's close X. Ignored when `hitSlop` is set.
   */
  minTarget?: boolean
  /** Swaps the icon for a spinner and blocks presses; see `Button`. */
  loading?: boolean
  testID?: string
}

const IconButton = ({
  onPress,
  onLongPress,
  icon,
  style,
  size: _size,
  iconStyle,
  color,
  fill,
  noTransform,
  accessibilityLabel,
  hitSlop,
  minTarget,
  loading,
  testID,
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
      hitSlop={
        hitSlop ??
        (minTarget
          ? Math.max(0, Math.ceil((MIN_TARGET - size) / 2))
          : undefined)
      }
      accessibilityLabel={
        accessibilityLabel ??
        (icon === XIcon && onPress ? i18n.t('close') : undefined)
      }
      loading={loading}
      loadingColor={typeof iconColor === 'string' ? iconColor : undefined}
      testID={testID}
    >
      <Icon
        color={iconColor}
        fill={fill ?? 'none'}
        size={size}
        style={iconStyleWithFallback as LucideProps['style']}
      />
    </Button>
  )
}

export default IconButton
