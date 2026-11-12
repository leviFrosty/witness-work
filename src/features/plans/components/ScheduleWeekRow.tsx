import { perf } from '@/lib/perf'
import { memo } from 'react'
import { View } from 'react-native'
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { CalendarDayCell } from '@/components/CalendarDay'
import type { CalendarDayModel } from '@/components/calendarDayModel'
import useTheme from '@/contexts/theme'
import BuddyDayBadge, {
  buddyDayMarkerLabel,
} from '@/features/buddies/components/BuddyDayBadge'
import type { BuddyDayMarker } from '@/features/buddies/lib/calendarMarkers'
import type { ScheduleMonthModels } from '@/features/plans/lib/scheduleDayModels'
import {
  monthOrdinal,
  type ScheduleWeekRow as WeekRow,
} from '@/features/plans/lib/scheduleRows'

export const WEEK_ROW_GUTTER = 10
export const WEEK_ROW_HEIGHT = WEEK_ROW_GUTTER + 40 + 10

const DIMMED_OPACITY = 0.5
const DIM_DURATION = 220
const SELECTED_RING = 2

type Props = {
  row: WeekRow

  focusedOrdinal: SharedValue<number>

  selectedKey?: string

  models: ScheduleMonthModels

  today: string
  buddyMarkers: Record<string, BuddyDayMarker>
  onPressDay: (date: Date) => void
}

export default memo(ScheduleWeekRow)

function ScheduleWeekRow({
  row,
  focusedOrdinal,
  selectedKey,
  models,
  today,
  buddyMarkers,
  onPressDay,
}: Props) {
  perf.count('render:ScheduleWeekRow')
  return (
    <View style={{ flexDirection: 'row', height: WEEK_ROW_HEIGHT }}>
      {row.days.map((day, column) =>
        day ? (
          <DayCell
            key={column}
            model={models.get(day.key)!}
            rule={!row.firstOfMonth}
            selected={day.key === selectedKey}
            today={today}
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
  perf.count('render:FocusVeil')
  const theme = useTheme()
  const month = monthOrdinal(row.month)

  const first = row.days.findIndex((day) => day !== null)
  const last = row.days.findLastIndex((day) => day !== null)

  const opacity = useSharedValue(-1)
  useAnimatedReaction(
    () => focusedOrdinal.value === month,
    (focused, previous) => {
      if (previous === null || focused === previous) return
      if (opacity.value < 0) opacity.value = previous ? 0 : 1 - DIMMED_OPACITY
      opacity.value = withTiming(focused ? 0 : 1 - DIMMED_OPACITY, {
        duration: DIM_DURATION,
      })
    }
  )
  const veil = useAnimatedStyle(() => ({
    opacity:
      opacity.value >= 0
        ? opacity.value
        : focusedOrdinal.value === month
          ? 0
          : 1 - DIMMED_OPACITY,
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
  model,
  rule,
  selected,
  today,
  marker,
  onPressDay,
}: {
  model: CalendarDayModel

  rule: boolean
  selected: boolean
  today: string
  marker: BuddyDayMarker | undefined
  onPressDay: (date: Date) => void
}) {
  perf.count('render:DayCell')
  const theme = useTheme()

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
        <CalendarDayCell
          model={model}
          state={model.dateString === today ? 'today' : ''}
          today={today}
          selected={selected}
          viewMode='auto'
          onPress={onPressDay}
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
