import { useEffect, useId } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'

/** The medallion's metal reaches 48% of its box on every side. */
const RIM_INSET = 0.02
const BAND_WIDTH = 0.42

/**
 * One soft light sweep across a medallion's metal, clipped to its circle. Lay
 * it over an earned medallion of the same `size`; skip it under Reduce Motion.
 */
export default function BadgeShine({
  size,
  delay = 0,
  duration = 950,
}: {
  size: number
  delay?: number
  duration?: number
}) {
  const sweep = useSharedValue(0)
  const gradientId = `badgeShine${useId().replace(/[^A-Za-z0-9_-]/g, '')}`

  useEffect(() => {
    sweep.value = withDelay(
      delay,
      withTiming(1, { duration, easing: Easing.inOut(Easing.quad) })
    )
  }, [delay, duration, sweep])

  const bandStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -size * BAND_WIDTH + sweep.value * size * 1.42 },
      { rotate: '18deg' },
    ],
  }))

  const inset = size * RIM_INSET
  const band = size * BAND_WIDTH
  return (
    <View
      pointerEvents='none'
      style={{
        position: 'absolute',
        top: inset,
        left: inset,
        width: size - inset * 2,
        height: size - inset * 2,
        borderRadius: size / 2,
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: -size * 0.25,
            left: 0,
            width: band,
            height: size * 1.5,
          },
          bandStyle,
        ]}
      >
        <Svg width={band} height={size * 1.5}>
          <Defs>
            <LinearGradient id={gradientId} x1='0' y1='0' x2='1' y2='0'>
              <Stop offset='0' stopColor='#FFFFFF' stopOpacity={0} />
              <Stop offset='0.5' stopColor='#FFFFFF' stopOpacity={0.55} />
              <Stop offset='1' stopColor='#FFFFFF' stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={band}
            height={size * 1.5}
            fill={`url(#${gradientId})`}
          />
        </Svg>
      </Animated.View>
    </View>
  )
}
