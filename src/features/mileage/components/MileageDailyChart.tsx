import moment from 'moment'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import { formatMonthDayCompact } from '@/lib/dates'
import { toDateKey, type MileagePeriod } from '@/lib/mileage/calc'
import type { Trip } from '@/types/mileage'

const CHART_HEIGHT = 44
const MIN_BAR_HEIGHT = 3

type Props = {
  period: MileagePeriod
  trips: readonly Trip[]
}

/**
 * One bar per day of the period, scaled to its busiest day. Decorative: the
 * totals beside it carry the same information for screen readers.
 */
export default function MileageDailyChart({ period, trips }: Props) {
  const theme = useTheme()
  const today = toDateKey(moment())
  const milesByDay = new Map<string, number>()
  for (const trip of trips) {
    milesByDay.set(
      trip.date,
      (milesByDay.get(trip.date) ?? 0) + trip.distanceMiles
    )
  }
  const max = Math.max(0, ...milesByDay.values())
  const days: string[] = []
  for (
    const day = period.start.clone();
    day.isSameOrBefore(period.end, 'day');
    day.add(1, 'day')
  ) {
    days.push(toDateKey(day))
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      style={{ gap: 6 }}
    >
      <View
        style={{
          height: CHART_HEIGHT,
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 2,
        }}
      >
        {days.map((day) => {
          const miles = milesByDay.get(day) ?? 0
          const isToday = day === today
          const height =
            miles > 0 && max > 0
              ? Math.max(MIN_BAR_HEIGHT * 2, (miles / max) * CHART_HEIGHT)
              : MIN_BAR_HEIGHT
          return (
            <View
              key={day}
              style={{
                flex: 1,
                height,
                borderRadius: 2,
                backgroundColor:
                  miles > 0
                    ? theme.colors.accent
                    : isToday
                      ? theme.colors.accentAlt
                      : theme.colors.border,
                opacity: day > today ? 0.4 : 1,
              }}
            />
          )
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text
          style={{
            fontSize: theme.fontSize('xs'),
            color: theme.colors.textAlt,
          }}
        >
          {formatMonthDayCompact(period.start)}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('xs'),
            color: theme.colors.textAlt,
          }}
        >
          {formatMonthDayCompact(period.end)}
        </Text>
      </View>
    </View>
  )
}
