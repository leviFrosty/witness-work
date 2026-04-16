import { PropsWithChildren, useEffect, useRef } from 'react'
import { LayoutChangeEvent, View, ViewStyle } from 'react-native'
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { Accelerometer } from 'expo-sensors'

interface Props {
  /** Disables the tilt gesture (e.g. in previews). */
  disabled?: boolean
  /** Max tilt in degrees at the corners. */
  maxTilt?: number
  /** Shows a subtle gloss overlay that tracks the tilt. */
  shimmer?: boolean
  /** Subscribes to accelerometer for idle gyro tilt. */
  gyro?: boolean
  /** Fires on a short press-and-release without drag. */
  onTap?: () => void
  style?: ViewStyle | ViewStyle[]
}

const SPRING = { damping: 18, stiffness: 160, mass: 0.6 }
const GYRO_MAX_TILT = 4

const TiltableCard = ({
  children,
  disabled,
  maxTilt = 8,
  shimmer = true,
  gyro = true,
  onTap,
  style,
}: PropsWithChildren<Props>) => {
  const touchTiltX = useSharedValue(0)
  const touchTiltY = useSharedValue(0)
  const gyroTiltX = useSharedValue(0)
  const gyroTiltY = useSharedValue(0)
  const pressScale = useSharedValue(1)
  const active = useSharedValue(0)
  const width = useSharedValue(0)
  const height = useSharedValue(0)
  const lastLayout = useRef({ w: 0, h: 0 })

  useEffect(() => {
    if (disabled || !gyro) return
    Accelerometer.setUpdateInterval(80)
    const sub = Accelerometer.addListener(({ x, y }) => {
      const clampedX = Math.max(-1, Math.min(1, x))
      const clampedY = Math.max(-1, Math.min(1, y))
      gyroTiltX.value = withTiming(clampedY * GYRO_MAX_TILT, { duration: 120 })
      gyroTiltY.value = withTiming(clampedX * GYRO_MAX_TILT, { duration: 120 })
    })
    return () => sub.remove()
  }, [disabled, gyro, gyroTiltX, gyroTiltY])

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout
    if (w === lastLayout.current.w && h === lastLayout.current.h) return
    lastLayout.current = { w, h }
    width.value = w
    height.value = h
  }

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .minDistance(4)
    .onBegin(() => {
      pressScale.value = withSpring(0.98, SPRING)
      active.value = withSpring(1, SPRING)
    })
    .onUpdate((e) => {
      if (!width.value || !height.value) return
      const nx = (e.x / width.value) * 2 - 1
      const ny = (e.y / height.value) * 2 - 1
      touchTiltY.value = nx * maxTilt
      touchTiltX.value = -ny * maxTilt
    })
    .onFinalize(() => {
      touchTiltX.value = withSpring(0, SPRING)
      touchTiltY.value = withSpring(0, SPRING)
      pressScale.value = withSpring(1, SPRING)
      active.value = withSpring(0, SPRING)
    })

  const tap = Gesture.Tap()
    .enabled(!disabled && !!onTap)
    .maxDuration(400)
    .onEnd(() => {
      if (onTap) runOnJS(onTap)()
    })

  const composed = onTap ? Gesture.Simultaneous(pan, tap) : pan

  const animatedStyle = useAnimatedStyle(() => {
    const rx = touchTiltX.value + gyroTiltX.value * (1 - active.value)
    const ry = touchTiltY.value + gyroTiltY.value * (1 - active.value)
    return {
      transform: [
        { perspective: 900 },
        { rotateX: `${rx}deg` },
        { rotateY: `${ry}deg` },
        { scale: pressScale.value },
      ],
    }
  })

  const shimmerStyle = useAnimatedStyle(() => {
    const w = width.value || 1
    const h = height.value || 1
    const tx = touchTiltY.value + gyroTiltY.value * (1 - active.value)
    const ty = touchTiltX.value + gyroTiltX.value * (1 - active.value)
    const px = interpolate(tx, [-maxTilt, maxTilt], [0, 1])
    const py = interpolate(ty, [maxTilt, -maxTilt], [0, 1])
    const bandW = w * 1.6
    // Gloss is faint at rest, brighter under touch.
    const baseOpacity = gyro ? 0.08 : 0
    return {
      opacity: baseOpacity + active.value * 0.14,
      transform: [
        { translateX: px * w - bandW / 2 },
        { translateY: (py - 0.5) * h * 0.4 },
        { rotateZ: '20deg' },
      ],
      width: bandW,
    }
  })

  return (
    <GestureDetector gesture={composed}>
      <Animated.View onLayout={onLayout} style={[style, animatedStyle]}>
        {children}
        {shimmer && (
          <View
            pointerEvents='none'
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              borderRadius: 15,
              overflow: 'hidden',
            }}
          >
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  top: -20,
                  bottom: -20,
                  backgroundColor: 'white',
                },
                shimmerStyle,
              ]}
            />
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  )
}

export default TiltableCard
