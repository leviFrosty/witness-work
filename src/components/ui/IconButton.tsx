import Button from '@/components/ui/Button'
import type { LucideProps } from 'lucide-react-native'
import { X as XIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import {
  Insets,
  Platform,
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

/** Apple's minimum comfortable touch target, in points. */
const MIN_TARGET = 44

const toNumber = (value: unknown) =>
  typeof value === 'number' ? value : undefined

/**
 * The button's size before any slop: the style's fixed width and height, else
 * the icon plus its padding and border.
 */
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

/** What places a button among its neighbors, not what it looks like. */
const PLACEMENT_KEYS = [
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'start',
  'end',
  'zIndex',
  'alignSelf',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
] as const
const MARGIN_KEYS = [
  'margin',
  'marginHorizontal',
  'marginVertical',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginStart',
  'marginEnd',
] as const

/**
 * Splits a style for the web's framed button: the frame takes the placement
 * (and the margins, added to the frame's own), the glyph's box takes the rest.
 */
const splitForFrame = (style: ViewStyle | undefined, frame: ViewStyle) => {
  const placement: Record<string, unknown> = {}
  const look: Record<string, unknown> = { ...style }
  for (const key of PLACEMENT_KEYS) {
    if (style?.[key] !== undefined) {
      placement[key] = style[key]
      delete look[key]
    }
  }
  for (const key of MARGIN_KEYS) delete look[key]
  const side = (
    specific: 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight',
    axis: 'marginHorizontal' | 'marginVertical'
  ) =>
    toNumber(style?.[specific]) ??
    toNumber(style?.[axis]) ??
    toNumber(style?.margin) ??
    0
  const [horizontal, vertical] = [
    toNumber(frame.marginHorizontal) ?? 0,
    toNumber(frame.marginVertical) ?? 0,
  ]
  return {
    outer: {
      ...frame,
      ...placement,
      marginTop: vertical + side('marginTop', 'marginVertical'),
      marginBottom: vertical + side('marginBottom', 'marginVertical'),
      marginLeft: horizontal + side('marginLeft', 'marginHorizontal'),
      marginRight: horizontal + side('marginRight', 'marginHorizontal'),
      marginHorizontal: undefined,
      marginVertical: undefined,
    } satisfies ViewStyle,
    inner: look as ViewStyle,
  }
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
  /**
   * Gives the button a real 44pt frame (48dp on Android), pulled back with
   * negative margin so nothing moves; `style` then draws its look inside the
   * frame. Use it in a drag area (sheet headers, swipeable rows), where a pan
   * claims a touch on the slop before the button sees it.
   */
  frame?: boolean
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
  // react-native-web ignores `hitSlop`, so a small button there gets a frame of
  // the minimum size instead, laid out as it was (unless it asks for no slop).
  const smallOnWeb =
    Platform.OS === 'web' &&
    hitSlop !== 0 &&
    (look.width < MIN_TARGET || look.height < MIN_TARGET)
  const framed = touchTargetFrame(look.width, look.height)
  const webFrame = smallOnWeb
    ? splitForFrame(StyleSheet.flatten(style), framed)
    : undefined
  const frameStyle = frame
    ? [framed, { borderRadius: 999 }]
    : webFrame && [webFrame.outer, { borderRadius: 999 }]
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
      {frameStyle ? (
        <View style={webFrame && !frame ? webFrame.inner : style}>{glyph}</View>
      ) : (
        glyph
      )}
    </Button>
  )
}

export default IconButton
