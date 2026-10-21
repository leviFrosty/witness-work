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

const toNumber = (value: unknown) =>
  typeof value === 'number' ? value : undefined

/**
 * The button's size before any slop: the style's fixed width and height, else
 * the icon plus its padding.
 */
const boxSize = (iconSize: number, style: ViewStyle | undefined) => {
  const s = style ?? {}
  const pad = (...keys: (keyof ViewStyle)[]) =>
    keys.map((key) => toNumber(s[key])).find((value) => value !== undefined) ??
    0
  return {
    width:
      toNumber(s.width) ??
      iconSize +
        pad('paddingLeft', 'paddingStart', 'paddingHorizontal', 'padding') +
        pad('paddingRight', 'paddingEnd', 'paddingHorizontal', 'padding'),
    height:
      toNumber(s.height) ??
      iconSize +
        pad('paddingTop', 'paddingVertical', 'padding') +
        pad('paddingBottom', 'paddingVertical', 'padding'),
  }
}

/**
 * Slop that grows a `width` × `height` button to the 44pt minimum. With a
 * `neighborGap`, the left and right slop stay under half of it.
 */
const minTargetSlop = (
  width: number,
  height: number,
  neighborGap?: number
): number | Insets => {
  const grow = (side: number) => Math.max(0, Math.ceil((MIN_TARGET - side) / 2))
  const vertical = grow(height)
  const horizontal =
    neighborGap === undefined
      ? grow(width)
      : Math.min(grow(width), Math.max(0, Math.ceil(neighborGap / 2) - 1))
  return horizontal === vertical
    ? vertical
    : { top: vertical, bottom: vertical, left: horizontal, right: horizontal }
}

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
   * Touch slop around the button. Unset grows the target to the 44pt minimum,
   * so the layout and look don't change. Set it to override that (`0` for
   * none).
   */
  hitSlop?: number | Insets
  /**
   * Space to the nearest pressable beside this one, for buttons in a row. Keeps
   * the default slop's left and right under half of it: RN resolves overlapping
   * siblings to the last one rendered, so a tap on the inner edge of the first
   * button would fire the second. Ignored when `hitSlop` is set.
   */
  neighborGap?: number
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
  neighborGap,
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
  const box = boxSize(size, StyleSheet.flatten(style))

  return (
    <Button
      style={style}
      noTransform={noTransform ?? !onPress}
      disabled={!onPress && !onLongPress}
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={hitSlop ?? minTargetSlop(box.width, box.height, neighborGap)}
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
