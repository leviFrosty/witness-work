import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { Line as SkiaLine, vec } from '@shopify/react-native-skia'
import { Bar, CartesianChart, StackedBar } from 'victory-native'
import useTheme from '@/contexts/theme'
import ChartXLabels, {
  type ChartXLabel,
} from '@/components/charts/ChartXLabels'
import Text from '@/components/ui/MyText'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import { withAlpha } from '@/lib/color'
import { formatMonthDayCompact } from '@/lib/dates'
import {
  bucketTrips,
  fromDateKey,
  type MileageBucket,
  type MileagePeriod,
} from '@/lib/mileage/calc'
import type { MileageFormatter } from '@/features/mileage/lib/format'
import type { VehicleChartColor } from '@/features/mileage/lib/chartColors'
import type { Trip } from '@/types/mileage'

const CHART_HEIGHT = 88
const PLOT_TOP = 2
const INNER_PADDING = 0.3
const ANIMATION = { type: 'timing', duration: 300 } as const
/** Month days that get an axis label — about one a week. */
const LABELED_MONTH_DAYS = new Set([1, 8, 15, 22, 29])
const READOUT_WIDTH = 150
const READOUT_OFFSET = 4

type Props = {
  period: MileagePeriod
  trips: readonly Trip[]
  /**
   * The cars with trips and their colors, in stacking order. More than one car
   * stacks each bar by car.
   */
  vehicleColors: VehicleChartColor[]
  format: MileageFormatter
  onSelectBucket: (bucket: MileageBucket) => void
}

const bucketLabel = (bucket: MileageBucket) =>
  bucket.kind === 'month'
    ? fromDateKey(bucket.start).format('MMMM YYYY')
    : formatMonthDayCompact(fromDateKey(bucket.start))

/**
 * Distance per day of a Week or Month, or per month of a Service Year, stacked
 * by car when more than one car has trips. Tap a bar to open that day or month;
 * hover a pointer over it to see its distance.
 */
const MileagePeriodChart = ({
  period,
  trips,
  vehicleColors,
  format,
  onSelectBucket,
}: Props) => {
  const theme = useTheme()
  const [width, setWidth] = useState(0)
  // Keyed by bucket so a hover left over from another period never matches.
  const [hoveredStart, setHoveredStart] = useState<string | null>(null)
  const buckets = bucketTrips(period, trips)
  const maxMiles = Math.max(0, ...buckets.map((b) => b.distanceMiles))
  if (buckets.length === 0 || maxMiles <= 0) return null

  const stacked = vehicleColors.length > 1
  const yKeys = stacked ? vehicleColors.map((_, i) => `car${i}`) : ['total']
  const data = buckets.map((bucket, i) => {
    const row: Record<string, number> = { x: i }
    if (stacked) {
      vehicleColors.forEach(({ vehicleId }, j) => {
        row[`car${j}`] = bucket.byVehicle[vehicleId] ?? 0
      })
    } else {
      row.total = bucket.distanceMiles
    }
    return row
  })
  const count = buckets.length
  const radius = count > 12 ? 2 : 4
  const yMax = maxMiles * 1.1
  const hoveredIndex = buckets.findIndex((b) => b.start === hoveredStart)

  const labels: ChartXLabel[] = buckets.flatMap((bucket, i) => {
    const day = fromDateKey(bucket.start)
    const position = (i + 0.5) / count
    if (period.kind === 'week') {
      return [{ key: bucket.start, label: day.format('dd'), position }]
    }
    if (period.kind === 'month') {
      return LABELED_MONTH_DAYS.has(day.date())
        ? [{ key: bucket.start, label: day.format('D'), position }]
        : []
    }
    // Every other month keeps longer month names from colliding.
    return i % 2 === 0
      ? [{ key: bucket.start, label: day.format('MMM'), position }]
      : []
  })

  return (
    <View style={{ gap: 4 }}>
      <View style={{ height: CHART_HEIGHT }}>
        <CartesianChart
          data={data}
          xKey='x'
          yKeys={yKeys}
          domain={{ x: [-0.5, count - 0.5], y: [0, yMax] }}
          padding={{ top: PLOT_TOP, bottom: 0, left: 0, right: 0 }}
          yAxis={[{ lineWidth: 0 }]}
        >
          {({ points, chartBounds }) => (
            <>
              <SkiaLine
                p1={vec(chartBounds.left, chartBounds.bottom)}
                p2={vec(chartBounds.right, chartBounds.bottom)}
                color={theme.colors.border}
                strokeWidth={1}
              />
              {stacked ? (
                <StackedBar
                  points={yKeys.map((key) => points[key])}
                  chartBounds={chartBounds}
                  barCount={count}
                  innerPadding={INNER_PADDING}
                  colors={vehicleColors.map(({ color }) => color)}
                  barOptions={({ isTop }) =>
                    isTop
                      ? {
                          roundedCorners: { topLeft: radius, topRight: radius },
                        }
                      : {}
                  }
                  animate={ANIMATION}
                />
              ) : (
                <Bar
                  points={points.total}
                  chartBounds={chartBounds}
                  barCount={count}
                  innerPadding={INNER_PADDING}
                  color={vehicleColors[0]?.color ?? theme.colors.accent}
                  roundedCorners={{ topLeft: radius, topRight: radius }}
                  animate={ANIMATION}
                />
              )}
            </>
          )}
        </CartesianChart>
        <View
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            flexDirection: 'row',
          }}
        >
          {buckets.map((bucket) => {
            // Screen readers step through the bars with trips only; the
            // period navigator reaches the empty days and months.
            const hasTrips = bucket.distanceMiles > 0
            return (
              <PointerHover
                key={bucket.start}
                onHoverChange={(hovered) =>
                  // The next bar's hover can begin before this one ends.
                  setHoveredStart((current) =>
                    hovered
                      ? bucket.start
                      : current === bucket.start
                        ? null
                        : current
                  )
                }
              >
                <Pressable
                  onPress={() => onSelectBucket(bucket)}
                  accessible={hasTrips}
                  accessibilityElementsHidden={!hasTrips}
                  importantForAccessibility={hasTrips ? 'yes' : 'no'}
                  accessibilityRole={hasTrips ? 'button' : undefined}
                  accessibilityLabel={
                    hasTrips
                      ? `${bucketLabel(bucket)}, ${format.distance(bucket.distanceMiles)}`
                      : undefined
                  }
                  style={({ pressed }) => ({
                    flex: 1,
                    borderRadius: 4,
                    backgroundColor: pressed
                      ? withAlpha(theme.colors.textAlt, 0x26)
                      : 'transparent',
                  })}
                >
                  <HoverTint
                    visible={hoveredStart === bucket.start}
                    borderRadius={4}
                  />
                </Pressable>
              </PointerHover>
            )
          })}
        </View>
        {hoveredIndex >= 0 && width > 0 && (
          <BarReadout
            bucket={buckets[hoveredIndex]}
            index={hoveredIndex}
            count={count}
            width={width}
            yMax={yMax}
            format={format}
          />
        )}
      </View>
      <ChartXLabels
        labels={labels}
        labelWidth={period.kind === 'year' ? 48 : 32}
      />
    </View>
  )
}

type BarReadoutProps = {
  bucket: MileageBucket
  index: number
  count: number
  width: number
  yMax: number
  format: MileageFormatter
}

/**
 * The hovered bar's date and distance, floating just above the bar. Tapping the
 * bar opens the same totals, so touch loses nothing.
 */
const BarReadout = ({
  bucket,
  index,
  count,
  width,
  yMax,
  format,
}: BarReadoutProps) => {
  const theme = useTheme()
  if (bucket.distanceMiles <= 0) return null

  const barCenter = ((index + 0.5) / count) * width
  const left = Math.max(
    0,
    Math.min(barCenter - READOUT_WIDTH / 2, width - READOUT_WIDTH)
  )
  const barTop =
    PLOT_TOP + (1 - bucket.distanceMiles / yMax) * (CHART_HEIGHT - PLOT_TOP)

  return (
    <View
      pointerEvents='none'
      style={{
        position: 'absolute',
        left,
        bottom: CHART_HEIGHT - barTop + READOUT_OFFSET,
        width: READOUT_WIDTH,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        zIndex: 10,
        elevation: 4,
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.text,
        }}
        numberOfLines={1}
      >
        {bucketLabel(bucket)}
      </Text>
      <Text
        style={{ fontSize: 11, color: theme.colors.textAlt }}
        numberOfLines={1}
      >
        {format.distance(bucket.distanceMiles)}
      </Text>
    </View>
  )
}

export default MileagePeriodChart
