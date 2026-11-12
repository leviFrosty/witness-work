import { PropsWithChildren, useEffect, useState } from 'react'
import { StyleSheet } from 'react-native'
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'

export const BARS_TRANSITION_MS = 260

const EASE_IN_OUT = Easing.bezier(0.42, 0, 0.58, 1)

export type ScrollAwayMotion = {
  progress: SharedValue<number>

  travel: SharedValue<number>
}

export function useScrollAwayMotion(hidden: boolean) {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(hidden ? 1 : 0)
  const travel = useSharedValue(0)

  useEffect(() => {
    progress.set(
      withTiming(hidden ? 1 : 0, {
        duration: reduceMotion ? 0 : BARS_TRANSITION_MS,
        easing: EASE_IN_OUT,
      })
    )
  }, [hidden, reduceMotion, progress])

  const contentStyle = useAnimatedStyle(() => {
    const laidOut = progress.value > 0 ? -travel.value : 0
    return {
      transform: [{ translateY: -travel.value * progress.value - laidOut }],
    }
  })

  const motion: ScrollAwayMotion = { progress, travel }
  return { motion, contentStyle }
}

type Props = PropsWithChildren<{
  hidden: boolean

  backgroundColor?: string

  overlay?: boolean
  onHeightChange?: (height: number) => void

  motion?: ScrollAwayMotion
}>

export default function ScrollAwayHeader({
  hidden,
  backgroundColor,
  overlay = false,
  onHeightChange,
  motion,
  children,
}: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const [height, setHeight] = useState(0)

  const travel = Math.max(0, height - insets.top)
  const duration = reduceMotion ? 0 : BARS_TRANSITION_MS

  const motionTravel = motion?.travel
  useEffect(() => {
    motionTravel?.set(travel)
  }, [motionTravel, travel])
  const collapse = useAnimatedStyle(() =>
    motion
      ? {
          marginBottom: motion.progress.value > 0 ? -motion.travel.value : 0,
        }
      : {}
  )

  return (
    <Animated.View
      pointerEvents='box-none'
      style={
        overlay
          ? styles.overlay
          : motion
            ? collapse
            : {
                marginBottom: hidden ? -travel : 0,
                transitionProperty: 'marginBottom',
                transitionDuration: duration,
                transitionTimingFunction: 'ease-in-out',
              }
      }
    >
      <Animated.View
        onLayout={(e) => {
          setHeight(e.nativeEvent.layout.height)
          onHeightChange?.(e.nativeEvent.layout.height)
        }}
        pointerEvents={hidden ? 'none' : 'box-none'}
        accessibilityElementsHidden={hidden}
        importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
        style={{
          opacity: hidden ? 0 : 1,
          transform: [{ translateY: hidden ? -travel : 0 }],
          transitionProperty: ['opacity', 'transform'],
          transitionDuration: duration,
          transitionTimingFunction: 'ease-in-out',
        }}
      >
        {children}
      </Animated.View>
      {}
      <Animated.View
        pointerEvents='none'
        style={[
          styles.statusBarStrip,
          {
            height: insets.top,
            backgroundColor: backgroundColor ?? theme.colors.background,
            opacity: hidden ? 1 : 0,
            transitionProperty: 'opacity',
            transitionDuration: hidden ? 0 : duration / 2,

            transitionDelay: hidden ? 0 : duration,
          },
        ]}
      />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 },
  statusBarStrip: { position: 'absolute', top: 0, left: 0, right: 0 },
})
