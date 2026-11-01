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

export interface SatelliteProps {
  palette: WelcomePalette

  focus: SharedValue<number>

  active: boolean

  reduceMotion: boolean

  time: SharedValue<number>
}

interface Props {
  palette: WelcomePalette
  focus: SharedValue<number>

  accent: string
  style?: StyleProp<ViewStyle>
}

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
