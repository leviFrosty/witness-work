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

/**
 * How far a corner travels, in points, either way. Rotating by a fixed angle
 * would swing a wide card's corners several points while a small one barely
 * moved; the Home Screen's icons and widgets all look to wobble about as much.
 */
const CORNER_TRAVEL = 1.8
const MIN_DEGREES = 0.5
const MAX_DEGREES = 2
/** Each swing one way, in milliseconds; varied a little per item. */
const SWING_MS = 130
const BOB = 0.6

/**
 * Wobbles its content while `active`, as apps and widgets do while the Home
 * Screen is being edited. Every item starts at its own point in the swing, so
 * the grid doesn't move in step. Still for Reduce Motion.
 */
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
        // Whole points, so a reflow by a fraction doesn't restart the swing.
        setExtent(Math.round(Math.max(width, height)))
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </Animated.View>
  )
}
