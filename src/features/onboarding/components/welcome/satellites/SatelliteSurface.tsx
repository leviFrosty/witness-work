import { PropsWithChildren } from 'react'
import { StyleProp, View, ViewStyle } from 'react-native'
import Animated, {
  SharedValue,
  interpolateColor,
  useAnimatedStyle,
} from 'react-native-reanimated'
import { withAlpha } from '@/lib/color'
import LucideIcon, { AppIcon } from '@/components/ui/LucideIcon'
import { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'

/**
 * Shared props for every card floating around the hub. The cards are fixed-size
 * illustrations of the app, so their text uses React Native's `Text` with font
 * scaling off rather than `MyText`: scaled copy would burst the sketch, and the
 * real copy on this screen scales normally.
 */
export interface SatelliteProps {
  palette: WelcomePalette
  /** 0–1: the headline is on this card's part of the story. */
  focus: SharedValue<number>
  /** True while the headline is on this card's part of the story. */
  active: boolean
  /** Hold every loop still. */
  reduceMotion: boolean
}

interface Props {
  palette: WelcomePalette
  focus: SharedValue<number>
  /** Colour the card's rim and glow take on while in focus. */
  accent: string
  style?: StyleProp<ViewStyle>
}

/**
 * A frosted card for the welcome constellation. In focus, its rim and glow warm
 * to the card's accent.
 */
const SatelliteSurface = ({
  palette,
  focus,
  accent,
  style,
  children,
}: PropsWithChildren<Props>) => {
  const focusBorder = withAlpha(accent, 0xb3)
  const { rest, focus: lit } = palette.surfaceShadowOpacity
  const rim = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      focus.value,
      [0, 1],
      [palette.surfaceBorder, focusBorder]
    ),
    shadowColor: interpolateColor(
      focus.value,
      [0, 1],
      [palette.surfaceShadow, accent]
    ),
    shadowOpacity: rest + (lit - rest) * focus.value,
  }))

  return (
    <Animated.View
      style={[
        {
          backgroundColor: palette.surface,
          borderWidth: 1,
          borderRadius: 18,
          borderCurve: 'continuous',
          padding: 12,
          shadowOffset: { width: 0, height: 10 },
          shadowRadius: 22,
        },
        rim,
        style,
      ]}
    >
      {children}
    </Animated.View>
  )
}

export const IconChip = ({
  icon,
  color,
  size = 28,
}: {
  icon: AppIcon
  color: string
  size?: number
}) => (
  <View
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.32,
      borderCurve: 'continuous',
      backgroundColor: withAlpha(color, 0x2e),
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <LucideIcon icon={icon} size={size * 0.56} color={color} />
  </View>
)

/** A placeholder text bar — the cards sketch the app, they don't quote it. */
export const Skeleton = ({
  palette,
  width,
}: {
  palette: WelcomePalette
  width: ViewStyle['width']
}) => (
  <View
    style={{
      height: 8,
      width,
      borderRadius: 4,
      backgroundColor: palette.skeleton,
    }}
  />
)

export default SatelliteSurface
