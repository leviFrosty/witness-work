import { PropsWithChildren, ReactNode, useRef } from 'react'
import { LayoutChangeEvent, ViewStyle } from 'react-native'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import type { TiltShaderContext } from '@/shaders/types'

interface Props {
  /** Disables the tilt gesture (e.g. in previews). */
  disabled?: boolean
  /** Max tilt in degrees at the corners. */
  maxTilt?: number
  /** Fires on a short press-and-release without drag. */
  onTap?: () => void
  style?: ViewStyle | ViewStyle[]
  /**
   * Renders a visual overlay on top of the children, transformed with the same
   * 3D tilt. Given the live tilt + size so effects (e.g. Skia shaders) can
   * drive their own uniforms. Returned nodes should position themselves with
   * `StyleSheet.absoluteFill` and be `pointerEvents='none'`.
   */
  renderOverlay?: (ctx: TiltShaderContext) => ReactNode
  /** Border radius forwarded to `renderOverlay` for masking. */
  overlayBorderRadius?: number
}

const SPRING = { damping: 18, stiffness: 160, mass: 0.6 }

const TiltableCard = ({
  children,
  disabled,
  maxTilt = 8,
  onTap,
  style,
  renderOverlay,
  overlayBorderRadius = 15,
}: PropsWithChildren<Props>) => {
  const touchTiltX = useSharedValue(0)
  const touchTiltY = useSharedValue(0)
  const pressScale = useSharedValue(1)
  const width = useSharedValue(0)
  const height = useSharedValue(0)
  const lastLayout = useRef({ w: 0, h: 0 })

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
    })

  const tap = Gesture.Tap()
    .enabled(!disabled && !!onTap)
    .maxDuration(400)
    .onEnd(() => {
      if (onTap) runOnJS(onTap)()
    })

  const composed = onTap ? Gesture.Simultaneous(pan, tap) : pan

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { perspective: 900 },
        { rotateX: `${touchTiltX.value}deg` },
        { rotateY: `${touchTiltY.value}deg` },
        { scale: pressScale.value },
      ],
    }
  })

  // Normalized tilt in roughly [-1, 1] derived from the same rotation values
  // the transform uses, so overlays stay in perfect sync with the 3D tilt.
  const normTiltX = useDerivedValue(() => {
    return Math.max(-1, Math.min(1, touchTiltY.value / maxTilt))
  })
  const normTiltY = useDerivedValue(() => {
    return Math.max(-1, Math.min(1, -touchTiltX.value / maxTilt))
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
