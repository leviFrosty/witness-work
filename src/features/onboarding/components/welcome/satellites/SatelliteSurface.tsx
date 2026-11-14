import { PropsWithChildren } from 'react'
import { StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native'
import Animated, {
  SharedValue,
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

const RADIUS = 20

const SatelliteSurface = ({
  palette,
  focus,
  accent,
  style,
  children,
}: PropsWithChildren<Props>) => {
  const { rest } = palette.surfaceShadowOpacity
  const glow = useAnimatedStyle(() => ({ opacity: focus.value }))

  return (
    <View
      style={[
        {
          backgroundColor: palette.card,
          borderWidth: 1,
          borderColor: palette.surfaceBorder,
          borderRadius: RADIUS,
          borderCurve: 'continuous',
          padding: 14,
          boxShadow: `0 10px 22px ${withAlpha(palette.surfaceShadow, Math.round(rest * 255))}`,
        },
        style,
      ]}
    >
      <Animated.View
        pointerEvents='none'
        style={[
          {
            position: 'absolute',
            top: -1,
            left: -1,
            right: -1,
            bottom: -1,
            borderWidth: 1.5,
            borderColor: withAlpha(accent, 0xcc),
            borderRadius: RADIUS,
            borderCurve: 'continuous',
            boxShadow: `0 6px 22px ${withAlpha(accent, 0x66)}`,
          },
          glow,
        ]}
      />
      {children}
    </View>
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

export const SatelliteText = ({
  children,
  style,
}: {
  children: string
  style?: StyleProp<TextStyle>
}) => (
  <Text allowFontScaling={false} numberOfLines={1} style={style}>
    {children}
  </Text>
)

export default SatelliteSurface
