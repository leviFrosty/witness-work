import { useRef, useState } from 'react'
import { View } from 'react-native'
import moment from 'moment'
import {
  Circle,
  DashPathEffect,
  LinearGradient,
  Line as SkiaLine,
  vec,
} from '@shopify/react-native-skia'
import { Gesture, PointerType } from 'react-native-gesture-handler'
import {
  runOnJS,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated'
import {
  Area,
  CartesianChart,
  Line,
  useChartPressState,
  type CartesianActionsHandle,
  type Scale,
} from 'victory-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import ChartXLabels from '@/components/charts/ChartXLabels'
import Haptics from '@/lib/haptics'
import { notePointerHover, supportsPointerHover } from '@/lib/pointerHover'
import { withAlpha } from '@/lib/color'
import { formatMinutesCompact } from '@/lib/minutes'
import {
  paceScale,
  type PacePoint,
  type ServiceYearPace,
} from '@/features/progress/lib/serviceYearPace'

const CHART_HEIGHT = 168
const Y_GUTTER = 44
const PADDING = { left: 2, right: Y_GUTTER, top: 8, bottom: 4 }
const PLOT_TOP = PADDING.top
const PLOT_BOTTOM = CHART_HEIGHT - PADDING.bottom
/** Smallest vertical gap between two labels in the right gutter. */
const MIN_LABEL_GAP = 14
const LABEL_HEIGHT = 16
/** Press-and-hold before scrubbing, so the Year tab still scrolls. */
const SCRUB_LONG_PRESS_MS = 200
const ANIMATION = { type: 'timing', duration: 300 } as const

type SeriesKey = 'logged' | 'planned' | 'goal'

type Props = {
  pace: ServiceYearPace
  /** Running totals, in hours, to mark with labeled gridlines. */
  gridHours: number[]
  /**
   * Called with the point under the finger or pointer, or null when scrubbing
   * ends.
   */
  onScrub: (point: PacePoint | null) => void
  accessibilityLabel: string
}

/**
 * Running totals across the Service Year: the goal (dashed), logged time
 * (filled), Plans from today on (dashed), and last year (faint). Press and hold
 * (or hover a pointer) to scrub month by month; the parent shows the values.
 */
const ServiceYearPaceChart = ({
  pace,
  gridHours,
  onScrub,
  accessibilityLabel,
}: Props) => {
  const theme = useTheme()
  const { state, isActive } = useChartPressState({
    x: 0,
    y: { goal: 0, logged: 0, planned: 0, lastYear: 0 },
  })
  const lastIndex = useRef(-1)
  // Victory's own touch handling, reused so a hovering pointer scrubs exactly
  // like a held finger.
  const chartActions = useSharedValue<CartesianActionsHandle<
    typeof state
  > | null>(null)
  const hovering = useSharedValue(false)
  // Victory rounds the top of its y domain up to a "nice" value, so labels and
  // gridlines place themselves with its scale rather than re-deriving it.
  const [yScale, setYScale] = useState<Scale | null>(null)

  // Victory draws the lines in chart units; readouts keep the real minutes.
  const scale = paceScale(pace.goalMinutes, pace.maxMinutes)
  const toChart = (minutes: number | null) =>
    minutes === null ? null : scale.toChart(minutes)
  const data = pace.points.map((p) => ({
    ...p,
    goal: scale.toChart(p.goal),
    logged: toChart(p.logged),
    planned: toChart(p.planned),
    lastYear: toChart(p.lastYear),
  }))
  const yMax = Math.max(scale.top * 1.05, 60)
  const yFor = (minutes: number) =>
    yScale
      ? yScale(scale.toChart(minutes))
      : PLOT_BOTTOM - (scale.toChart(minutes) / yMax) * (PLOT_BOTTOM - PLOT_TOP)

  // Last year's total labels the end of its line, ahead of any gridline.
  const lastYearTotal = pace.hasLastYear
    ? (pace.points[pace.points.length - 1].lastYear ?? null)
    : null
  const lastYearLabel =
    lastYearTotal && lastYearTotal > 0
      ? { y: yFor(lastYearTotal), text: formatMinutesCompact(lastYearTotal) }
      : null

  // Label from the top down, dropping any that would crowd a label already
  // placed.
  const gridlines: { minutes: number; y: number }[] = []
  for (const hours of [...new Set(gridHours)].sort((a, b) => b - a)) {
    const minutes = hours * 60
    if (minutes <= 0 || scale.toChart(minutes) > yMax) continue
    const y = yFor(minutes)
    const placed = [...gridlines.map((g) => g.y), lastYearLabel?.y]
    if (
      placed.every(
        (other) => other === undefined || Math.abs(y - other) >= MIN_LABEL_GAP
      )
    ) {
      gridlines.push({ minutes, y })
    }
  }
  const labelTop = (y: number) =>
    Math.min(Math.max(y - LABEL_HEIGHT / 2, 0), CHART_HEIGHT - LABEL_HEIGHT)

  const todayIndex = pace.points.findIndex((p) => p.kind === 'today')
  // The line the scrub dot rides on at each point.
  const scrubSeries: SeriesKey[] = pace.points.map((p) =>
    p.logged !== null ? 'logged' : p.planned !== null ? 'planned' : 'goal'
  )

  const handleIndex = (index: number, hovered: boolean) => {
    if (index === lastIndex.current) return
    lastIndex.current = index
    const point = index >= 0 ? pace.points[index] : undefined
    if (!point || point.kind === 'start') {
      onScrub(null)
      return
    }
    // Haptics are for touch.
    if (!hovered) Haptics.selection()
    onScrub(point)
  }

  useAnimatedReaction(
    () => (state.isActive.value ? state.matchedIndex.value : -1),
    (index, previous) => {
      if (index !== previous) runOnJS(handleIndex)(index, hovering.value)
    }
  )

  // A trackpad, mouse, or Pencil hovering over the chart drives the same press
  // state as a held finger, so the scrub line and readout follow it.
  const hoverTo = (x: number, y: number) => {
    'worklet'
    hovering.value = true
    chartActions.value?.handleTouch(state, x, y)
    state.isActive.value = true
  }
  const hoverGesture = supportsPointerHover
    ? Gesture.Race(
        Gesture.Hover()
          .onBegin((e) => {
            'worklet'
            runOnJS(notePointerHover)(
              e.pointerType === PointerType.STYLUS ? 'stylus' : 'pointer'
            )
            hoverTo(e.x, e.y)
          })
          .onUpdate((e) => {
            'worklet'
            hoverTo(e.x, e.y)
          })
          .onFinalize(() => {
            'worklet'
            if (!hovering.value) return
            hovering.value = false
            state.isActive.value = false
          })
      )
    : undefined

  const scrubTop = useDerivedValue(() => vec(state.x.position.value, PLOT_TOP))
  const scrubBottom = useDerivedValue(() =>
    vec(state.x.position.value, PLOT_BOTTOM)
  )
  const scrubDotY = useDerivedValue(() => {
    const key = scrubSeries[state.matchedIndex.value] ?? 'goal'
    return state.y[key].position.value
  })

  // Each label sits on its month's end — the point that carries its total.
  const monthLabels = pace.months
    .map((m, i) => ({
      key: `${m.year}-${m.month}`,
      label: moment({ year: m.year, month: m.month }).format('MMM'),
      position: (i + 1) / 12,
    }))
    // Every other month keeps longer month names from colliding.
    .filter((_, i) => i % 2 === 0)

  return (
    <View style={{ gap: 4 }}>
      <View
        accessible
        accessibilityRole='image'
        accessibilityLabel={accessibilityLabel}
        style={{ height: CHART_HEIGHT }}
      >
        <CartesianChart
          data={data}
          xKey='x'
          yKeys={['goal', 'logged', 'planned', 'lastYear']}
          domain={{ x: [0, 12], y: [0, yMax] }}
          padding={PADDING}
          // The milestone gridlines below replace Victory's default grid.
          yAxis={[{ lineWidth: 0 }]}
          onScaleChange={(_, nextYScale) => setYScale(() => nextYScale)}
          chartPressState={state}
          chartPressConfig={{
            pan: { activateAfterLongPress: SCRUB_LONG_PRESS_MS },
          }}
          customGestures={hoverGesture}
          actionsRef={chartActions}
        >
          {({ points, chartBounds, yScale: chartYScale }) => (
            <>
              {gridlines.map(({ minutes }) => {
                const y = chartYScale(scale.toChart(minutes))
                return (
                  <SkiaLine
                    key={minutes}
                    p1={vec(chartBounds.left, y)}
                    p2={vec(chartBounds.right, y)}
                    color={theme.colors.border}
                    strokeWidth={1}
                  />
                )
              })}
              <SkiaLine
                p1={vec(chartBounds.left, chartBounds.bottom)}
                p2={vec(chartBounds.right, chartBounds.bottom)}
                color={theme.colors.border}
                strokeWidth={1}
              />
              {pace.hasLastYear && (
                <Line
                  points={points.lastYear}
                  color={theme.colors.textAlt}
                  opacity={0.55}
                  strokeWidth={1.5}
                  strokeCap='round'
                  animate={ANIMATION}
                />
              )}
              <Line
                points={points.goal}
                color={theme.colors.textAlt}
                strokeWidth={1.5}
                animate={ANIMATION}
              >
                <DashPathEffect intervals={[4, 4]} />
              </Line>
              <Area
                points={points.logged}
                y0={chartBounds.bottom}
                animate={ANIMATION}
              >
                <LinearGradient
                  start={vec(0, chartBounds.top)}
                  end={vec(0, chartBounds.bottom)}
                  colors={[
                    withAlpha(theme.colors.accent, 0x55),
                    withAlpha(theme.colors.accent, 0x00),
                  ]}
                />
              </Area>
              <Line
                points={points.logged}
                color={theme.colors.accent}
                strokeWidth={2.5}
                strokeCap='round'
                strokeJoin='round'
                animate={ANIMATION}
              />
              <Line
                points={points.planned}
                color={theme.colors.accent}
                strokeWidth={2}
                strokeCap='round'
                animate={ANIMATION}
              >
                <DashPathEffect intervals={[5, 5]} />
              </Line>
              {todayIndex >= 0 && !isActive && (
                <Circle
                  cx={points.logged[todayIndex].x}
                  cy={points.logged[todayIndex].y ?? chartBounds.bottom}
                  r={4.5}
                  color={theme.colors.accent}
                />
              )}
              {isActive && (
                <>
                  <SkiaLine
                    p1={scrubTop}
                    p2={scrubBottom}
                    color={theme.colors.textAlt}
                    strokeWidth={1}
                  />
                  <Circle
                    cx={state.x.position}
                    cy={scrubDotY}
                    r={5}
                    color={theme.colors.accent}
                  />
                </>
              )}
            </>
          )}
        </CartesianChart>
        {/* Labels wait for Victory's scale so they never land off their line. */}
        {yScale && (
          <View
            pointerEvents='none'
            accessibilityElementsHidden
            importantForAccessibility='no-hide-descendants'
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              right: 0,
              width: Y_GUTTER - 4,
            }}
          >
            {lastYearLabel && (
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{
                  position: 'absolute',
                  top: labelTop(lastYearLabel.y),
                  right: 0,
                  left: 0,
                  textAlign: 'right',
                  fontSize: theme.fontSize('xs'),
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.textAlt,
                }}
              >
                {lastYearLabel.text}
              </Text>
            )}
            {gridlines.map(({ minutes, y }) => (
              <Text
                key={minutes}
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{
                  position: 'absolute',
                  top: labelTop(y),
                  right: 0,
                  left: 0,
                  textAlign: 'right',
                  fontSize: theme.fontSize('xs'),
                  color: theme.colors.textAlt,
                }}
              >
                {formatMinutesCompact(Math.round(minutes / 60), {
                  unit: 'hours',
                })}
              </Text>
            ))}
          </View>
        )}
      </View>
      <ChartXLabels
        labels={monthLabels}
        insetLeft={PADDING.left}
        insetRight={PADDING.right}
      />
    </View>
  )
}

export default ServiceYearPaceChart
