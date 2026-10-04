import { Pressable, View } from 'react-native'
import { Line as SkiaLine, vec } from '@shopify/react-native-skia'
import { Bar, CartesianChart, StackedBar } from 'victory-native'
import useTheme from '@/contexts/theme'
import ChartXLabels, {
  type ChartXLabel,
} from '@/components/charts/ChartXLabels'
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
const INNER_PADDING = 0.3
const ANIMATION = { type: 'timing', duration: 300 } as const
/** Month days that get an axis label — about one a week. */
const LABELED_MONTH_DAYS = new Set([1, 8, 15, 22, 29])

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
 * by car when more than one car has trips. Tap a bar to open that day or
 * month.
 */
const MileagePeriodChart = ({
  period,
  trips,
  vehicleColors,
  format,
  onSelectBucket,
}: Props) => {
  const theme = useTheme()
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
          domain={{ x: [-0.5, count - 0.5], y: [0, maxMiles * 1.1] }}
          padding={{ top: 2, bottom: 0, left: 0, right: 0 }}
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
              <Pressable
                key={bucket.start}
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
              />
            )
          })}
        </View>
      </View>
      <ChartXLabels
        labels={labels}
        labelWidth={period.kind === 'year' ? 48 : 32}
      />
    </View>
  )
}

export default MileagePeriodChart
