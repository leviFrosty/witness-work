import { useEffect, type ReactNode } from 'react'
import { I18nManager, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import { formatNumber } from '@/lib/numbers'
import {
  gameIcon,
  type GameIconName,
  type GamePalette,
} from '@/features/pet/art/gameUi'
import {
  CoinIcon,
  GameFrame,
  GamePixelImage,
  gamePixelScale,
} from '@/features/pet/components/GamePixels'

/** One of the buttons' pixel icons in `color`, mirrored where it points. */
export function GameIcon({
  name,
  color,
  style,
}: {
  name: GameIconName
  color: string
  style?: StyleProp<ViewStyle>
}) {
  const flip =
    I18nManager.isRTL && (name === 'back' || name === 'forward')
      ? { transform: [{ scaleX: -1 }] }
      : null
  return (
    <GamePixelImage
      cacheKey={`icon|${name}|${color}`}
      make={() => gameIcon(name, color)}
      style={[flip, style]}
    />
  )
}

/** An icon button's tile, in pixels: a full touch target at the pet's scale. */
const ICON_TILE_PX = 17

/**
 * A square paper button with a pixel icon: Share and Settings beside the pet's
 * name, close on Android. Its frame is a full touch target.
 */
export function GameIconButton({
  icon,
  label,
  palette,
  onPress,
}: {
  icon: GameIconName
  /** What it does, for screen readers and the pointer's tooltip. */
  label: string
  palette: GamePalette
  onPress: () => void
}) {
  const scale = gamePixelScale()
  const tile = Math.max(ICON_TILE_PX * scale, MIN_TOUCH_TARGET)
  return (
    <Button
      onPress={onPress}
      accessibilityRole='button'
      accessibilityLabel={label}
      style={{ width: tile, height: tile }}
    >
      <GameFrame
        kind='buttonSoft'
        palette={palette}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <GameIcon name={icon} color={palette.ink} />
      </GameFrame>
    </Button>
  )
}

/**
 * A pixel button: `primary` in the accent (the screen's main action), `soft` in
 * paper beside it. A disabled one greys out. A coin and an amount can follow
 * the label, as the Shop's Buy does.
 */
export function GameButton({
  label,
  onPress,
  kind = 'primary',
  icon,
  coin,
  amount,
  disabled,
  loading,
  accessibilityLabel,
  accessibilityHint,
  palette,
  style,
}: {
  label: string
  onPress?: () => void
  kind?: 'primary' | 'soft'
  /** An icon before the label. */
  icon?: GameIconName
  /** A coin after the label, and a number after it. */
  coin?: boolean
  amount?: number
  disabled?: boolean
  /** Pressed and working: it can't be pressed again. */
  loading?: boolean
  accessibilityLabel?: string
  accessibilityHint?: string
  palette: GamePalette
  style?: StyleProp<ViewStyle>
}) {
  const theme = useTheme()
  const scale = gamePixelScale()
  const off = disabled || loading || !onPress
  const ink = off
    ? palette.inkAlt
    : kind === 'primary'
      ? palette.onAccent
      : palette.ink
  const text = (value: string) => (
    <Text
      numberOfLines={1}
      style={{
        fontSize: 16,
        fontFamily: theme.fonts.bold,
        fontVariant: ['tabular-nums'],
        color: ink,
        flexShrink: 1,
      }}
    >
      {value}
    </Text>
  )
  return (
    <Button
      onPress={onPress}
      disabled={off}
      accessibilityRole='button'
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: off, busy: loading }}
      style={style}
    >
      <GameFrame
        kind={off ? 'buttonOff' : kind === 'primary' ? 'button' : 'buttonSoft'}
        palette={palette}
        style={{
          minHeight: Math.max(20 * scale, MIN_TOUCH_TARGET),
          paddingHorizontal: 5 * scale,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          opacity: loading ? 0.7 : 1,
        }}
      >
        {icon && <GameIcon name={icon} color={ink} />}
        {text(label)}
        {coin && <CoinIcon />}
        {amount !== undefined && (
          <View style={{ marginStart: -2 }}>{text(formatNumber(amount))}</View>
        )}
      </GameFrame>
    </Button>
  )
}

/** A switch's size, in pixels. */
const TOGGLE_W = 21
const TOGGLE_H = 12
const KNOB = 10

/**
 * The pet screens' switch: a pixel track in the accent when on, its knob
 * sliding across. Not a control of its own: the row around it is
 * (`GameSwitchRow`), so a tap anywhere on the row flips it.
 */
export function GameToggle({
  value,
  palette,
}: {
  value: boolean
  palette: GamePalette
}) {
  const scale = gamePixelScale()
  const reduceMotion = useReducedMotion()
  const travel = (TOGGLE_W - KNOB - 2) * scale
  const at = useSharedValue(value ? 1 : 0)
  useEffect(() => {
    at.value = reduceMotion
      ? value
        ? 1
        : 0
      : withTiming(value ? 1 : 0, { duration: 140 })
  }, [value, at, reduceMotion])
  const knobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (I18nManager.isRTL ? -1 : 1) * travel * at.value },
    ],
  }))
  return (
    <View
      pointerEvents='none'
      style={{ width: TOGGLE_W * scale, height: TOGGLE_H * scale }}
    >
      <GameFrame
        kind={value ? 'toggleOn' : 'toggleOff'}
        palette={palette}
        style={{ flex: 1 }}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: scale,
            start: scale,
            width: KNOB * scale,
            height: KNOB * scale,
          },
          knobStyle,
        ]}
      >
        <GameFrame kind='knob' palette={palette} style={{ flex: 1 }} />
      </Animated.View>
    </View>
  )
}

/**
 * A screen's title on a hinoki sign board, sized to the words. `trailing`
 * (rare) sits after the words on the board.
 */
export function GamePlaque({
  title,
  palette,
  trailing,
}: {
  title: string
  palette: GamePalette
  trailing?: ReactNode
}) {
  const theme = useTheme()
  const scale = gamePixelScale()
  return (
    <GameFrame
      kind='plaque'
      palette={palette}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingTop: 3 * scale,
        paddingBottom: 4 * scale,
        paddingHorizontal: 14,
      }}
    >
      <Text
        accessibilityRole='header'
        numberOfLines={1}
        style={{
          flexShrink: 1,
          fontSize: 18,
          fontFamily: theme.fonts.bold,
          color: palette.ink,
        }}
      >
        {title}
      </Text>
      {trailing}
    </GameFrame>
  )
}
