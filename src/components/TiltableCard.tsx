import { PropsWithChildren, ReactNode, useEffect, useRef } from 'react'
import { LayoutChangeEvent, ViewStyle } from 'react-native'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { Accelerometer } from 'expo-sensors'
import type { TiltShaderContext } from '../shaders/types'

interface Props {
  /** Disables the tilt gesture (e.g. in previews). */
  disabled?: boolean
  /** Max tilt in degrees at the corners. */
  maxTilt?: number
  /** Subscribes to the accelerometer for an idle gyro tilt. */
  gyro?: boolean
  /** Fires on a short press-and-release without drag. */
  onTap?: () => void
  style?: ViewStyle | ViewStyle[]
  /**
   * Renders a visual overlay on top of the children, transformed with the same
   * 3D tilt. Given the live tilt + size so effects (e.g. Skia shaders) can
   * drive their own uniforms. Returned nodes should position themselves with
   * `StyleSheet.absoluteFillObject` and be `pointerEvents='none'`.
   */
  renderOverlay?: (ctx: TiltShaderContext) => ReactNode
  /** Border radius forwarded to `renderOverlay` for masking. */
  overlayBorderRadius?: number
}

const SPRING = { damping: 18, stiffness: 160, mass: 0.6 }
const GYRO_MAX_TILT = 4

const TiltableCard = ({
  children,
  disabled,
  maxTilt = 8,
  gyro = true,
  onTap,
  style,
  renderOverlay,
  overlayBorderRadius = 15,
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

  // Normalized tilt in roughly [-1, 1] derived from the same rotation values
  // the transform uses, so overlays stay in perfect sync with the 3D tilt.
  const normTiltX = useDerivedValue(() => {
    const deg = touchTiltY.value + gyroTiltY.value * (1 - active.value)
    return Math.max(-1, Math.min(1, deg / maxTilt))
  })
  const normTiltY = useDerivedValue(() => {
    const deg = -(touchTiltX.value + gyroTiltX.value * (1 - active.value))
    return Math.max(-1, Math.min(1, deg / maxTilt))
  })

  const overlay = renderOverlay?.({
    width,
    height,
    tiltX: normTiltX,
    tiltY: normTiltY,
    borderRadius: overlayBorderRadius,
  })

  return (
    <GestureDetector gesture={composed}>
      <Animated.View onLayout={onLayout} style={[style, animatedStyle]}>
        {children}
        {overlay}
      </Animated.View>
    </GestureDetector>
  )
}

export default TiltableCard
