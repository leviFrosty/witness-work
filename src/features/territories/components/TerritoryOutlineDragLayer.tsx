import { Platform, StyleSheet } from 'react-native'
import Animated, {
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import type { ScreenPoint } from '@/features/territories/lib/territoryArea'

export type HeldCorner = ScreenPoint & { index: number }

const AnimatedPath = Animated.createAnimatedComponent(Path)

const DOT = 7
const DOT_CORE = 5
const HANDLE = 13
const HANDLE_CORE = 7

const circle = (x: number, y: number, r: number) => {
  'worklet'
  return `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`
}

const outlinePath = (points: ScreenPoint[], drag: HeldCorner | null) => {
  'worklet'
  if (!drag || points.length < 2) return ''
  let d = ''
  for (let index = 0; index < points.length; index++) {
    const point = index === drag.index ? drag : points[index]
    if (point) d += `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`
  }
  return points.length > 2 ? `${d}Z` : d
}

const dotsPath = (
  points: ScreenPoint[],
  drag: HeldCorner | null,
  radius: number
) => {
  'worklet'
  if (!drag) return ''
  let d = ''
  for (let index = 0; index < points.length; index++) {
    const point = points[index]
    if (point && index !== drag.index) d += circle(point.x, point.y, radius)
  }
  return d
}

const handlePath = (drag: HeldCorner | null, radius: number) => {
  'worklet'
  return drag ? circle(drag.x, drag.y, radius) : ''
}

export default function TerritoryOutlineDragLayer({
  points,
  held,
  shown,
  color,
  ring,
}: {
  points: SharedValue<ScreenPoint[]>
  held: SharedValue<HeldCorner | null>
  shown: SharedValue<number>
  color: string
  ring: string
}) {
  const outline = useAnimatedProps(() => ({
    d: shown.value > 0 ? outlinePath(points.value, held.value) : '',
  }))
  const dotRings = useAnimatedProps(() => ({
    d: shown.value > 0 ? dotsPath(points.value, held.value, DOT) : '',
  }))
  const dotCores = useAnimatedProps(() => ({
    d: shown.value > 0 ? dotsPath(points.value, held.value, DOT_CORE) : '',
  }))
  const handleRing = useAnimatedProps(() => ({
    d: shown.value > 0 ? handlePath(held.value, HANDLE) : '',
  }))
  const handleCore = useAnimatedProps(() => ({
    d: shown.value > 0 ? handlePath(held.value, HANDLE_CORE) : '',
  }))

  const visible = useAnimatedStyle(() => ({ opacity: shown.value }))

  return (
    <Animated.View
      pointerEvents='none'
      style={[StyleSheet.absoluteFill, visible]}
    >
      <Svg width='100%' height='100%'>
        <AnimatedPath
          d=''
          animatedProps={outline}
          stroke={color}
          strokeWidth={3}
          strokeLinejoin='round'
          fill={Platform.select({ web: 'none', default: `${color}2E` })}
        />
        <AnimatedPath d='' animatedProps={dotRings} fill={ring} />
        <AnimatedPath d='' animatedProps={dotCores} fill={color} />
        <AnimatedPath d='' animatedProps={handleRing} fill={color} />
        <AnimatedPath d='' animatedProps={handleCore} fill={ring} />
      </Svg>
    </Animated.View>
  )
}
