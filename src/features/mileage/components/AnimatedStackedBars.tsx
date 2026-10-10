import { useEffect, useState } from 'react'
import { Path, Skia } from '@shopify/react-native-skia'
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import type { ChartBounds } from 'victory-native'

const DURATION = 300
/** Segments thinner than this many points draw nothing. */
const MIN_HEIGHT = 0.5

/** Bars in canvas points: segment `[series][bar]` spans `y0` (base) to `y1`. */
type Geometry = {
  centers: number[]
  width: number
  colors: string[]
  y0: number[][]
  y1: number[][]
}

type Props = {
  /** Distance per bar, then per series in stacking order (bottom first). */
  values: number[][]
  colors: string[]
  chartBounds: ChartBounds
  yMax: number
  innerPadding: number
  radius: number
}

const lerp = (a: number, b: number, t: number) => {
  'worklet'
  return a + (b - a) * t
}

const lerpGeometry = (from: Geometry, to: Geometry, t: number): Geometry => {
  'worklet'
  return {
    centers: to.centers.map((c, i) => lerp(from.centers[i], c, t)),
    width: lerp(from.width, to.width, t),
    colors: to.colors,
    y0: to.y0.map((row, s) => row.map((y, i) => lerp(from.y0[s][i], y, t))),
    y1: to.y1.map((row, s) => row.map((y, i) => lerp(from.y1[s][i], y, t))),
  }
}

const toGeometry = ({
  values,
  colors,
  chartBounds,
  yMax,
  innerPadding,
}: Omit<Props, 'radius'>): Geometry => {
  const { left, right, top, bottom } = chartBounds
  const slot = (right - left) / Math.max(values.length, 1)
  const toY = (miles: number) => bottom - (miles / yMax) * (bottom - top)
  const y0: number[][] = colors.map(() => [])
  const y1: number[][] = colors.map(() => [])
  values.forEach((bar) => {
    let total = 0
    colors.forEach((_, s) => {
      y0[s].push(toY(total))
      total += bar[s] ?? 0
      y1[s].push(toY(total))
    })
  })
  return {
    centers: values.map((_, i) => left + slot * (i + 0.5)),
    width: slot * (1 - innerPadding),
    colors,
    y0,
    y1,
  }
}

/**
 * Lines `from` up with `next` so the two interpolate segment for segment. A
 * series only in `next` grows from its base; one only in `from` shrinks into
 * the top of its bar. A different bar count grows every bar from the axis.
 */
const alignGeometry = (
  from: Geometry,
  next: Geometry,
  baseline: number
): [Geometry, Geometry] => {
  const seriesCount = Math.max(from.colors.length, next.colors.length)
  const sameBars = from.centers.length === next.centers.length
  const tops = next.centers.map((_, i) =>
    next.y1.length > 0 ? next.y1[next.y1.length - 1][i] : baseline
  )
  const aligned: [Geometry, Geometry] = [
    { ...next, colors: [], y0: [], y1: [] },
    { ...next, colors: [], y0: [], y1: [] },
  ]
  for (let s = 0; s < seriesCount; s++) {
    const inNext = s < next.colors.length
    const inFrom = sameBars && s < from.colors.length
    const toY0 = inNext ? next.y0[s] : tops
    const toY1 = inNext ? next.y1[s] : tops
    aligned[1].colors.push(inNext ? next.colors[s] : from.colors[s])
    aligned[1].y0.push(toY0)
    aligned[1].y1.push(toY1)
    aligned[0].colors.push(aligned[1].colors[s])
    aligned[0].y0.push(
      inFrom ? from.y0[s] : sameBars ? toY0 : toY0.map(() => baseline)
    )
    aligned[0].y1.push(
      inFrom ? from.y1[s] : sameBars ? toY0 : toY0.map(() => baseline)
    )
  }
  if (sameBars) {
    aligned[0].centers = from.centers
    aligned[0].width = from.width
  }
  return aligned
}

/**
 * Stacked bars that animate as one: every segment of every bar follows the same
 * clock, and the topmost visible segment of each bar keeps its rounded corners
 * throughout. Victory's `StackedBar` tweens each segment's path on its own, and
 * a segment that gains or loses its rounded top or its height can't be tweened,
 * so it jumped while its neighbors slid.
 */
const AnimatedStackedBars = ({ radius, ...props }: Props) => {
  const target = toGeometry(props)
  // Compared by value: the parent rebuilds the arrays on every render.
  const targetKey = JSON.stringify(target)
  const baseline = props.chartBounds.bottom
  const from = useSharedValue(target)
  const to = useSharedValue(target)
  const progress = useSharedValue(1)

  useEffect(() => {
    const next: Geometry = JSON.parse(targetKey)
    // Start from where the bars are now, even mid-animation.
    const current = lerpGeometry(from.value, to.value, progress.value)
    if (current.width <= 0) {
      // The chart hadn't been laid out yet; nothing to animate from.
      from.value = next
      to.value = next
      return
    }
    const [start, end] = alignGeometry(current, next, baseline)
    from.value = start
    to.value = end
    progress.value = 0
    progress.value = withTiming(1, { duration: DURATION })
  }, [targetKey, baseline, from, to, progress])

  const geometry = useDerivedValue(() =>
    lerpGeometry(from.value, to.value, progress.value)
  )
  // Series that just left keep drawing so they can shrink away.
  const [drawn, setDrawn] = useState({ key: targetKey, colors: props.colors })
  if (drawn.key !== targetKey) {
    setDrawn({
      key: targetKey,
      colors: props.colors.concat(drawn.colors.slice(props.colors.length)),
    })
  }

  return drawn.colors.map((color, s) => (
    <SeriesPath
      key={s}
      series={s}
      geometry={geometry}
      color={props.colors[s] ?? color}
      radius={radius}
    />
  ))
}

type SeriesPathProps = {
  series: number
  geometry: SharedValue<Geometry>
  color: string
  radius: number
}

const SeriesPath = ({ series, geometry, color, radius }: SeriesPathProps) => {
  const path = useDerivedValue(() => {
    const { centers, width, y0, y1 } = geometry.value
    const builder = Skia.PathBuilder.Make()
    if (series >= y0.length) return builder.build()
    centers.forEach((center, i) => {
      const bottom = y0[series][i]
      const top = y1[series][i]
      const height = bottom - top
      if (height < MIN_HEIGHT) return
      let isTop = true
      for (let s = series + 1; s < y0.length; s++) {
        if (y0[s][i] - y1[s][i] >= MIN_HEIGHT) isTop = false
      }
      const left = center - width / 2
      const right = center + width / 2
      const r = isTop ? Math.min(radius, height, width / 2) : 0
      builder.moveTo(left, bottom)
      builder.lineTo(left, top + r)
      if (r > 0) builder.conicTo(left, top, left + r, top, Math.SQRT1_2)
      builder.lineTo(right - r, top)
      if (r > 0) builder.conicTo(right, top, right, top + r, Math.SQRT1_2)
      builder.lineTo(right, bottom)
      builder.close()
    })
    return builder.build()
  })

  return <Path path={path} color={color} style='fill' />
}

export default AnimatedStackedBars
