import { PropsWithChildren, useEffect, useState } from 'react'
import { LayoutChangeEvent, StyleProp, View, ViewStyle } from 'react-native'
import {
  BlurMask,
  Canvas,
  RoundedRect,
  SweepGradient,
  vec,
} from '@shopify/react-native-skia'
import {
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated'
import useTheme from '@/contexts/theme'

interface Props {
  /** Corner radius of the container and its rim. */
  borderRadius?: number
  /** Width of the crisp animated rim. */
  strokeWidth?: number
  /** Seconds per full rotation. Higher = slower, more ambient. */
  rotationSeconds?: number
  /** Render the soft outer glow (the Apple-Intelligence-style shimmer). */
  glow?: boolean
  /**
   * Gradient stops, anchored on the same colour at both ends so the sweep loops
   * with no visible seam. Defaults to the WitnessWork brand aurora — NOT the
   * Apple palette — so it reads as our own.
   */
  colors?: string[]
  /** Inner surface colour behind the children. */
  backgroundColor?: string
  /** Inner padding around the children. */
  padding?: number
  style?: StyleProp<ViewStyle>
}

/**
 * A reusable root-level container that wraps its children in a slowly rotating
 * gradient rim with a soft glow — our take on the "Apple Intelligence" border.
 *
 * Built on Skia + Reanimated (mirrors `SupporterCtaButton`'s shimmer rim) so it
 * composes cleanly with the rest of the app. Drop it around any content that
 * deserves a moment of delight / a trust signal:
 *
 * ```tsx
 * ;<AuroraBorder>
 *   <Text>…</Text>
 * </AuroraBorder>
 * ```
 */
const AuroraBorder: React.FC<PropsWithChildren<Props>> = ({
  borderRadius = 18,
  strokeWidth = 2,
  rotationSeconds = 12,
  glow = true,
  colors,
  backgroundColor,
  padding = 16,
  style,
  children,
}) => {
  const theme = useTheme()
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const time = useSharedValue(0)
  const reduceMotion = useReducedMotion()

  const frameCallback = useFrameCallback((frame) => {
    'worklet'
    if (reduceMotion) return
    time.value = frame.timeSinceFirstFrame / 1000
  })

  // Deactivate the per-frame callback entirely under Reduce Motion (so it isn't
  // burning a frame callback only to early-return inside the worklet), and react
  // to a runtime toggle of the setting. The worklet's own `reduceMotion` guard
  // stays as a belt-and-suspenders.
  useEffect(() => {
    frameCallback.setActive(!reduceMotion)
  }, [reduceMotion, frameCallback])

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout
    setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }))
  }

  // Soft glow needs the most breathing room so the blur isn't clipped by the
  // canvas edge.
  const glowStroke = strokeWidth + 6
  const blur = 6
  // Skia's blur value is a Gaussian sigma, not its full visible radius. Reserve
  // three sigmas on every side so the blurred stroke fades out before the Canvas
  // boundary instead of being clipped into a hard rectangle.
  const inset = glow ? glowStroke / 2 + blur * 3 : strokeWidth

  const transform = useDerivedValue(() => [
    {
      rotate: ((time.value / rotationSeconds) * Math.PI * 2) % (Math.PI * 2),
    },
  ])

  const origin = useDerivedValue(() => {
    if (!size) return vec(0, 0)
    return vec(size.w / 2 + inset, size.h / 2 + inset)
  })

  const gradientColors = colors ?? [
    theme.colors.accent,
    theme.colors.cyan,
    theme.colors.indigo,
    theme.colors.purple,
    theme.colors.accent,
  ]

  return (
    <View style={[style, { padding: inset }]}>
      <View
        onLayout={handleLayout}
        style={{
          borderRadius,
          borderCurve: 'continuous',
          backgroundColor: backgroundColor ?? theme.colors.card,
          padding,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
      {size && (
        <Canvas
          pointerEvents='none'
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: size.w + inset * 2,
            height: size.h + inset * 2,
          }}
        >
          {glow && (
            <RoundedRect
              x={inset}
              y={inset}
              width={size.w}
              height={size.h}
              r={borderRadius}
              style='stroke'
              strokeWidth={glowStroke}
              opacity={0.45}
            >
              <BlurMask blur={blur} style='normal' />
              <SweepGradient
                c={origin}
                colors={gradientColors}
                origin={origin}
                transform={transform}
              />
            </RoundedRect>
          )}
          <RoundedRect
            x={inset}
            y={inset}
            width={size.w}
            height={size.h}
            r={borderRadius}
            style='stroke'
            strokeWidth={strokeWidth}
          >
            <SweepGradient
              c={origin}
              colors={gradientColors}
              origin={origin}
              transform={transform}
            />
          </RoundedRect>
        </Canvas>
      )}
    </View>
  )
}

export default AuroraBorder
