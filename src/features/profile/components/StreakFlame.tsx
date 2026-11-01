import { useEffect } from 'react'
import { View } from 'react-native'
import { Flame as FlameIcon } from 'lucide-react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import useReduceMotionEnabled from '@/hooks/useReduceMotionEnabled'

export default function StreakFlame({ size = 30 }: { size?: number }) {
  const theme = useTheme()
  const reduceMotion = useReduceMotionEnabled()
  const flicker = useSharedValue(0)

  useEffect(() => {
    if (reduceMotion) {
      flicker.value = 0
      return
    }
    flicker.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    )
    return () => cancelAnimation(flicker)
  }, [reduceMotion, flicker])

  const outerStyle = useAnimatedStyle(() => ({
    transformOrigin: 'bottom',
    transform: [
      { scaleY: 1 + flicker.value * 0.07 },
      { rotate: `${-2 + flicker.value * 4}deg` },
    ],
  }))
  const coreStyle = useAnimatedStyle(() => ({
    transformOrigin: 'bottom',
    transform: [
      { scaleY: 1.06 - flicker.value * 0.12 },
      { rotate: `${2 - flicker.value * 4}deg` },
    ],
  }))

  const core = Math.round(size * 0.48)
  return (
    <View
      importantForAccessibility='no-hide-descendants'
      accessibilityElementsHidden
      style={{
        width: size * 1.6,
        height: size * 1.6,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.orangeTranslucent,
      }}
    >
      <Animated.View style={outerStyle}>
        <LucideIcon
          icon={FlameIcon}
          size={size}
          color={theme.colors.orange}
          fill={theme.colors.orange}
        />
      </Animated.View>
      <Animated.View
        style={[
          {
            position: 'absolute',

            top: (size * 1.6 - size) / 2 + size * 0.44,
          },
          coreStyle,
        ]}
      >
        <LucideIcon
          icon={FlameIcon}
          size={core}
          color={theme.colors.warn}
          fill={theme.colors.warn}
        />
      </Animated.View>
    </View>
  )
}
