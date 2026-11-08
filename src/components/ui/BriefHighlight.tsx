import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native'
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import useTheme from '@/contexts/theme'

export function useBriefHighlight() {
  const reducedMotion = useReducedMotion()
  const progress = useSharedValue(0)

  const play = () => {
    progress.value = withSequence(
      withTiming(1, { duration: reducedMotion ? 0 : 200 }),
      withDelay(1200, withTiming(0, { duration: reducedMotion ? 0 : 600 }))
    )
  }

  return { progress, play, reducedMotion }
}

export function BriefHighlightOverlay({
  progress,
  borderRadius,
  style,
}: {
  progress: SharedValue<number>
  borderRadius?: number
  style?: StyleProp<ViewStyle>
}) {
  const theme = useTheme()
  const animatedStyle = useAnimatedStyle(() => ({ opacity: progress.value }))

  return (
    <Animated.View
      pointerEvents='none'
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: theme.colors.accentTranslucent, borderRadius },
        style,
        animatedStyle,
      ]}
    />
  )
}
