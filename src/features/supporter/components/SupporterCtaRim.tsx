import { Platform, type ViewStyle } from 'react-native'
import {
  Canvas,
  RoundedRect,
  SweepGradient,
  vec,
} from '@shopify/react-native-skia'
import { useDerivedValue, type SharedValue } from 'react-native-reanimated'

// Seconds per full rotation. Slow enough to feel ambient, not flashy.
const ROTATION_SECONDS = 14

interface Props {
  /** The button's size; the canvas is `inset` larger on every side. */
  size: { w: number; h: number }
  /** Seconds the rim has turned, advanced while it's visible. */
  time: SharedValue<number>
  colors: string[]
  /** Where the canvas sits around the button. */
  frame: ViewStyle
  radius: number
  strokeWidth: number
  inset: number
}

/**
 * `SupporterCtaButton`'s animated supporter-gold rim, in its own module so Skia
 * loads with it.
 */
export default function SupporterCtaRim({
  size,
  time,
  colors,
  frame,
  radius,
  strokeWidth,
  inset,
}: Props) {
  const transform = useDerivedValue(() => [
    {
      rotate: ((time.value / ROTATION_SECONDS) * Math.PI * 2) % (Math.PI * 2),
    },
  ])

  const origin = useDerivedValue(() =>
    vec(size.w / 2 + inset, size.h / 2 + inset)
  )

  return (
    <Canvas
      pointerEvents='none'
      style={Platform.OS === 'web' ? { flex: 1 } : frame}
    >
      <RoundedRect
        x={inset}
        y={inset}
        width={size.w}
        height={size.h}
        r={radius}
        style='stroke'
        strokeWidth={strokeWidth}
      >
        <SweepGradient
          c={origin}
          colors={colors}
          origin={origin}
          transform={transform}
        />
      </RoundedRect>
    </Canvas>
  )
}
