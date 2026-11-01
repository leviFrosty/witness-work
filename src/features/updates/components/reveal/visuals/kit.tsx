import { PropsWithChildren, useEffect } from 'react'
import { StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native'
import Animated, {
  DerivedValue,
  Easing,
  cancelAnimation,
  clamp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import useTheme from '@/contexts/theme'
import LucideIcon, { AppIcon } from '@/components/ui/LucideIcon'
import { withAlpha } from '@/lib/color'
import { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'

export const VISUAL = { width: 320, height: 280 }

export interface RevealVisualProps {
  palette: WelcomePalette

  active: boolean

  reduceMotion: boolean
}

export const useVisualClock = ({
  active,
  reduceMotion,
  introMs,
  loopMs,
  restAt,
}: {
  active: boolean
  reduceMotion: boolean
  introMs: number
  loopMs: number
  restAt: number
}) => {
  const intro = useSharedValue(reduceMotion ? 1 : 0)
  const loop = useSharedValue(reduceMotion ? restAt : 0)

  useEffect(() => {
    if (reduceMotion) {
      intro.value = 1
      loop.value = restAt
      return
    }
    if (!active) {
      cancelAnimation(loop)
      return
    }
    const wait = Math.max(0, (1 - intro.value) * introMs)
    if (intro.value < 1) {
      intro.value = withTiming(1, {
        duration: wait,
        easing: Easing.linear,
      })
    }
    loop.value = 0
    loop.value = withDelay(
      wait,
      withRepeat(
        withTiming(1, { duration: loopMs, easing: Easing.linear }),
        -1,
        false
      )
    )
    return () => cancelAnimation(loop)
  }, [active, reduceMotion, introMs, loopMs, restAt, intro, loop])

  return { intro, loop }
}

export const greetingForNow = () => {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'greetingGoodMorning'
  if (hour >= 12 && hour < 17) return 'greetingGoodAfternoon'
  return 'greetingGoodEvening'
}

export const seg = (t: number, from: number, to: number) => {
  'worklet'
  const x = clamp((t - from) / (to - from), 0, 1)
  return 1 - Math.pow(1 - x, 3)
}

export const segInOut = (t: number, from: number, to: number) => {
  'worklet'
  const x = clamp((t - from) / (to - from), 0, 1)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

export const pulseWindow = (
  t: number,
  a: number,
  b: number,
  c: number,
  d: number
) => {
  'worklet'
  return seg(t, a, b) * (1 - seg(t, c, d))
}

export const backOut = (x: number) => {
  'worklet'
  const c1 = 1.5
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

export const useRiseStyle = (
  progress: DerivedValue<number>,
  from: number,
  to: number,
  distance = 14
) =>
  useAnimatedStyle(() => {
    const p = clamp((progress.value - from) / (to - from), 0, 1)
    return {
      opacity: Math.min(1, p * 1.6),
      transform: [{ translateY: (1 - backOut(p)) * distance }],
    }
  })

export const Surface = ({
  palette,
  style,
  children,
}: PropsWithChildren<{
  palette: WelcomePalette
  style?: StyleProp<ViewStyle>
}>) => (
  <View
    style={[
      {
        backgroundColor: palette.surface,
        borderWidth: 1,
        borderColor: palette.surfaceBorder,
        borderRadius: 18,
        borderCurve: 'continuous',
        shadowColor: palette.surfaceShadow,
        shadowOpacity: palette.surfaceShadowOpacity.rest,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
      },
      style,
    ]}
  >
    {children}
  </View>
)

export const Bar = ({
  palette,
  width,
  height = 8,
  color,
  style,
}: {
  palette: WelcomePalette
  width: ViewStyle['width']
  height?: number
  color?: string
  style?: StyleProp<ViewStyle>
}) => (
  <View
    style={[
      {
        height,
        width,
        borderRadius: height / 2,
        backgroundColor: color ?? palette.skeleton,
      },
      style,
    ]}
  />
)

export const IconTile = ({
  icon,
  color,
  size = 28,
  filled,
}: {
  icon: AppIcon
  color: string
  size?: number

  filled?: boolean
}) => (
  <View
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.32,
      borderCurve: 'continuous',
      backgroundColor: filled ? color : withAlpha(color, 0x2e),
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <LucideIcon
      icon={icon}
      size={size * 0.56}
      color={filled ? '#FFFFFF' : color}
      strokeWidth={2.2}
    />
  </View>
)

export const VisualText = ({
  children,
  style,
  numberOfLines = 1,
  minimumFontScale,
}: {
  children: string
  style?: StyleProp<TextStyle>
  numberOfLines?: number
  minimumFontScale?: number
}) => {
  const theme = useTheme()
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={minimumFontScale !== undefined}
      minimumFontScale={minimumFontScale}
      style={[{ fontFamily: theme.fonts.semiBold, fontSize: 12 }, style]}
    >
      {children}
    </Text>
  )
}

export const TapRipple = ({
  tap,
  color,
  size = 34,
  style,
}: {
  tap: DerivedValue<number>
  color: string
  size?: number
  style?: StyleProp<ViewStyle>
}) => {
  const ring = useAnimatedStyle(() => ({
    opacity: tap.value > 0 && tap.value < 1 ? (1 - tap.value) * 0.9 : 0,
    transform: [{ scale: 0.4 + tap.value * 0.9 }],
  }))
  return (
    <Animated.View
      pointerEvents='none'
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: color,
          backgroundColor: withAlpha(color, 0x33),
        },
        ring,
        style,
      ]}
    />
  )
}
