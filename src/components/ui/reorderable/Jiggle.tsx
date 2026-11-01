import { type ReactNode, useEffect, useState } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

const CORNER_TRAVEL = 1.8
const MIN_DEGREES = 0.5
const MAX_DEGREES = 2

const SWING_MS = 130
const BOB = 0.6

export default function Jiggle({
  active,
  children,
  style,
}: {
  active: boolean
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const reduceMotion = useReducedMotion()
  const [extent, setExtent] = useState(0)
  const rotation = useSharedValue(0)
  const bob = useSharedValue(0)

  useEffect(() => {
    if (!active || reduceMotion || extent === 0) {
      cancelAnimation(rotation)
      cancelAnimation(bob)
      rotation.value = withTiming(0, { duration: 120 })
      bob.value = withTiming(0, { duration: 120 })
      return
    }
    const degrees = Math.min(
      MAX_DEGREES,
      Math.max(MIN_DEGREES, ((CORNER_TRAVEL / (extent / 2)) * 180) / Math.PI)
    )
    const swing = SWING_MS + Math.random() * 24 - 12
    const direction = Math.random() < 0.5 ? 1 : -1
    const easing = Easing.inOut(Easing.sin)
    rotation.value = withDelay(
      Math.random() * swing,
      withRepeat(
        withSequence(
          withTiming(degrees * direction, { duration: swing, easing }),
          withTiming(-degrees * direction, { duration: swing, easing })
        ),
        -1,
        false
      )
    )
    bob.value = withDelay(
      Math.random() * swing,
      withRepeat(
        withSequence(
          withTiming(BOB, { duration: swing * 1.4, easing }),
          withTiming(-BOB, { duration: swing * 1.4, easing })
        ),
        -1,
        false
      )
    )
    return () => {
      cancelAnimation(rotation)
      cancelAnimation(bob)
    }
  }, [active, reduceMotion, extent, rotation, bob])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value }, { rotate: `${rotation.value}deg` }],
  }))

  return (
    <Animated.View
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout

        setExtent(Math.round(Math.max(width, height)))
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </Animated.View>
  )
}
