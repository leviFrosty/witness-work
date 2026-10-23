import { StyleSheet } from 'react-native'
import Animated, {
  useAnimatedProps,
  type SharedValue,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import useTheme from '@/contexts/theme'
import type { LassoPoint } from '@/features/map/hooks/useMapLasso'

const AnimatedPath = Animated.createAnimatedComponent(Path)

/** The loop being drawn in Select mode, over the map. */
export default function MapLassoPath({
  points,
}: {
  points: SharedValue<LassoPoint[]>
}) {
  const theme = useTheme()
  const animatedProps = useAnimatedProps(() => {
    const current = points.get()
    if (current.length < 2) return { d: '' }
    return {
      d:
        current
          .map(
            (p, i) =>
              `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`
          )
          .join(' ') + ' Z',
    }
  })
  return (
    <Svg pointerEvents='none' style={StyleSheet.absoluteFill}>
      <AnimatedPath
        animatedProps={animatedProps}
        stroke={theme.colors.accent}
        strokeWidth={2.5}
        strokeDasharray='6 5'
        strokeLinejoin='round'
        fill={theme.colors.accentTranslucent}
      />
    </Svg>
  )
}
