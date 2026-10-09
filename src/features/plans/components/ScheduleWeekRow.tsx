import moment from 'moment'
import { View } from 'react-native'
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated'
import CalendarDay from '@/components/CalendarDay'
import useTheme from '@/contexts/theme'
import type { RecurringPlan } from '@/lib/recurrence'
import type { DayPlan, TimeEntry } from '@/types/timeEntry'
import BuddyDayBadge from '@/features/buddies/components/BuddyDayBadge'
import type { BuddyDayMarker } from '@/features/buddies/lib/calendarMarkers'
import type { ScheduleDayIndex } from '@/features/plans/lib/scheduleDayIndex'
import {
  monthOrdinal,
  type ScheduleDay,
  type ScheduleWeekRow as WeekRow,
} from '@/features/plans/lib/scheduleRows'

/** Room above each square, under the week's rule. */
export const WEEK_ROW_GUTTER = 10
export const WEEK_ROW_HEIGHT = WEEK_ROW_GUTTER + 40 + 10
/** How far days outside the focused month fade back. */
const DIMMED_OPACITY = 0.5
const DIM_DURATION = 220
const SELECTED_RING = 2
const NO_REPORTS: TimeEntry[] = []
const NO_DAY_PLANS: DayPlan[] = []

type Props = {
  row: WeekRow
  /** The focused month's {@link monthOrdinal}. */
  focusedOrdinal: SharedValue<number>
  selectedKey?: string
  index: ScheduleDayIndex
  recurringPlans: RecurringPlan[]
  buddyMarkers: Record<string, BuddyDayMarker>
  onPressDay: (date: Date) => void
}

/**
 * One week of one month in the Schedule's calendar. A rule runs over the week's
 * own days (the month's first week sits under its name's rule instead), and
 * weeks outside the focused month fade back so the month being read stands
 * out.
 */
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
          // By column, not by date: the list recycles week rows, and a day keyed
          // by date would rebuild its square and native menu each time.
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
      {/* Keyed by week, so a recycled row shows its new week's dimming at once
      instead of fading from the last one's. */}
      <FocusVeil key={row.key} row={row} focusedOrdinal={focusedOrdinal} />
    </View>
  )
}

/**
 * Fades the week's days back by veiling them in the background color, which
 * reads the same as fading the days themselves. It runs on the UI thread, so
 * crossing into another month re-renders no week. The rules above the days stay
 * sharp.
 */
function FocusVeil({
  row,
  focusedOrdinal,
}: {
  row: WeekRow
  focusedOrdinal: SharedValue<number>
}) {
  const theme = useTheme()
  const month = monthOrdinal(row.month)
  // Only the week's own days: the empty columns of a split week stay bare.
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
  /** Draws the week's rule over this day. */
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
  const isToday = moment().isSame(date, 'day')

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
          monthsReports={reports}
          dayPlansOverride={dayPlans}
          recurringPlansOverride={recurringPlans}
          viewMode='auto'
          onPress={() => onPressDay(date)}
          overlay={marker ? <BuddyDayBadge marker={marker} /> : undefined}
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
