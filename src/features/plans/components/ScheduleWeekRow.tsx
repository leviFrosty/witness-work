import { View } from 'react-native'
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated'
import CalendarDay from '@/components/CalendarDay'
import useTheme from '@/contexts/theme'
import useLocalDay from '@/hooks/useLocalDay'
import type { RecurringPlan } from '@/lib/recurrence'
import type { DayPlan, TimeEntry } from '@/types/timeEntry'
import BuddyDayBadge, {
  buddyDayMarkerLabel,
} from '@/features/buddies/components/BuddyDayBadge'
import type { BuddyDayMarker } from '@/features/buddies/lib/calendarMarkers'
import type { ScheduleDayIndex } from '@/features/plans/lib/scheduleDayIndex'
import {
  monthOrdinal,
  type ScheduleDay,
  type ScheduleWeekRow as WeekRow,
} from '@/features/plans/lib/scheduleRows'

export const WEEK_ROW_GUTTER = 10
export const WEEK_ROW_HEIGHT = WEEK_ROW_GUTTER + 40 + 10

const DIMMED_OPACITY = 0.5
const DIM_DURATION = 220
const SELECTED_RING = 2
const NO_REPORTS: TimeEntry[] = []
const NO_DAY_PLANS: DayPlan[] = []

type Props = {
  row: WeekRow

  focusedOrdinal: SharedValue<number>
  selectedKey?: string
  index: ScheduleDayIndex
  recurringPlans: RecurringPlan[]
  buddyMarkers: Record<string, BuddyDayMarker>
  onPressDay: (date: Date) => void
}

export default function ScheduleWeekRow({
  row,
  focusedOrdinal,
  selectedKey,
  index,
  recurringPlans,
  buddyMarkers,
  onPressDay,
}: Props) {
  return (
    <View style={{ flexDirection: 'row', height: WEEK_ROW_HEIGHT }}>
      {row.days.map((day, column) =>
        day ? (
          <DayCell
            key={column}
            day={day}
            rule={!row.firstOfMonth}
            selected={day.key === selectedKey}
            reports={index.reportsByDay.get(day.key) ?? NO_REPORTS}
            dayPlans={index.dayPlansByDay.get(day.key) ?? NO_DAY_PLANS}
            recurringPlans={recurringPlans}
            marker={buddyMarkers[day.key]}
            onPressDay={onPressDay}
          />
        ) : (
          <View key={`empty-${column}`} style={{ flex: 1 }} />
        )
      )}
      {}
      <FocusVeil key={row.key} row={row} focusedOrdinal={focusedOrdinal} />
    </View>
  )
}

function FocusVeil({
  row,
  focusedOrdinal,
}: {
  row: WeekRow
  focusedOrdinal: SharedValue<number>
}) {
  const theme = useTheme()
  const month = monthOrdinal(row.month)

  const first = row.days.findIndex((day) => day !== null)
  const last = row.days.findLastIndex((day) => day !== null)
  const veil = useAnimatedStyle(() => ({
    opacity: withTiming(
      focusedOrdinal.value === month ? 0 : 1 - DIMMED_OPACITY,
      { duration: DIM_DURATION }
    ),
  }))

  return (
    <Animated.View
      pointerEvents='none'
      style={[
        {
          position: 'absolute',
          top: WEEK_ROW_GUTTER - SELECTED_RING,
          bottom: 0,
          left: `${(first / 7) * 100}%`,
          right: `${((6 - last) / 7) * 100}%`,
          backgroundColor: theme.colors.background,
        },
        veil,
      ]}
    />
  )
}

function DayCell({
  day,
  rule,
  selected,
  reports,
  dayPlans,
  recurringPlans,
  marker,
  onPressDay,
}: {
  day: ScheduleDay

  rule: boolean
  selected: boolean
  reports: TimeEntry[]
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  marker: BuddyDayMarker | undefined
  onPressDay: (date: Date) => void
}) {
  const theme = useTheme()
  const date = new Date(day.year, day.month, day.day)
  const isToday = day.key === useLocalDay()

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        paddingTop: WEEK_ROW_GUTTER,
      }}
    >
      <View
        style={{
          borderWidth: SELECTED_RING,
          margin: -SELECTED_RING,
          borderColor: selected ? theme.colors.accent : 'transparent',
          borderRadius: theme.numbers.borderRadiusSm + 4,
        }}
      >
        <CalendarDay
          date={{
            year: day.year,
            month: day.month + 1,
            day: day.day,
            timestamp: date.getTime(),
            dateString: day.key,
          }}
          state={isToday ? 'today' : ''}
          selected={selected}
          monthsReports={reports}
          dayPlansOverride={dayPlans}
          recurringPlansOverride={recurringPlans}
          viewMode='auto'
          onPress={() => onPressDay(date)}
          overlay={marker ? <BuddyDayBadge marker={marker} /> : undefined}
          overlayAccessibilityLabel={
            marker ? buddyDayMarkerLabel(marker) : undefined
          }
        />
      </View>
      {rule ? (
        <View
          pointerEvents='none'
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 1,
            backgroundColor: theme.colors.border,
          }}
        />
      ) : null}
    </View>
  )
}
