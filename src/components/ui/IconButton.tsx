import Button from '@/components/ui/Button'
import type { LucideProps } from 'lucide-react-native'
import { X as XIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import {
  Insets,
  StyleProp,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native'
import { ThemeContext } from '@/contexts/theme'
import { useContext } from 'react'
import { ThemeSizes } from '@/types/theme'
import type { AppIcon } from '@/components/ui/LucideIcon'
import { touchTargetFrame } from '@/components/ui/touchTarget'

export type IconButtonIcon = AppIcon

const MIN_TARGET = 44

const toNumber = (value: unknown) =>
  typeof value === 'number' ? value : undefined

const boxSize = (iconSize: number, style: ViewStyle | undefined) => {
  const s = style ?? {}
  const pad = (...keys: (keyof ViewStyle)[]) =>
    keys.map((key) => toNumber(s[key])).find((value) => value !== undefined) ??
    0
  const border = 2 * (toNumber(s.borderWidth) ?? 0)
  return {
    width:
      toNumber(s.width) ??
      iconSize +
        border +
        pad('paddingLeft', 'paddingStart', 'paddingHorizontal', 'padding') +
        pad('paddingRight', 'paddingEnd', 'paddingHorizontal', 'padding'),
    height:
      toNumber(s.height) ??
      iconSize +
        border +
        pad('paddingTop', 'paddingVertical', 'padding') +
        pad('paddingBottom', 'paddingVertical', 'padding'),
  }
}

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

  accessibilityLabel?: string

  hitSlop?: number | Insets

  neighborGap?: number

  frame?: boolean

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
  frame,
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
  const look = boxSize(size, StyleSheet.flatten(style))
  const frameStyle = frame
    ? [touchTargetFrame(look.width, look.height), { borderRadius: 999 }]
    : undefined
  const box = frameStyle ? boxSize(size, StyleSheet.flatten(frameStyle)) : look
  const glyph = (
    <Icon
      color={iconColor}
      fill={fill ?? 'none'}
      size={size}
      style={iconStyleWithFallback as LucideProps['style']}
    />
  )

  return (
    <Button
      style={frameStyle ?? style}
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
      {frameStyle ? <View style={style}>{glyph}</View> : glyph}
    </Button>
  )
}

export default IconButton
