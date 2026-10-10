import { FlashList, type FlashListRef } from '@shopify/flash-list'
import moment from 'moment'
import type { RefObject } from 'react'
import { type LayoutRectangle, View } from 'react-native'
import Animated, {
  type AnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated'
import type { ViewStyle } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useStartOfWeek from '@/hooks/useStartOfWeek'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import useServiceReport from '@/stores/serviceReport'
import type { BuddyDayMarker } from '@/features/buddies/lib/calendarMarkers'
import MonthGoalMeter from '@/features/plans/components/MonthGoalMeter'
import ScheduleMonthHeader from '@/features/plans/components/ScheduleMonthHeader'
import ScheduleWeekRow from '@/features/plans/components/ScheduleWeekRow'
import ServiceYearDivider from '@/features/plans/components/ServiceYearDivider'
import type { ScheduleDayIndex } from '@/features/plans/lib/scheduleDayIndex'
import type {
  ScheduleRow,
  ScheduleRows,
} from '@/features/plans/lib/scheduleRows'

/** Side padding of the week grid, so the zoom can find its edges. */
export const MONTH_GRID_PADDING = 8

type Props = {
  schedule: ScheduleRows
  focusedMonth: CalendarMonth
  /** `focusedMonth` for the weeks, which dim on the UI thread. */
  focusedOrdinal: SharedValue<number>
  initialRowIndex: number
  listRef: RefObject<FlashListRef<ScheduleRow> | null>
  index: ScheduleDayIndex
  buddyMarkers: Record<string, BuddyDayMarker>
  selectedKey?: string
  bottomInset: number
  /** Fades with the zoom; the meters don't scale. */
  chromeStyle: AnimatedStyle<ViewStyle>
  /** Scales with the zoom: the weekday header and the weeks. */
  zoomStyle: AnimatedStyle<ViewStyle>
  onScroll: (offsetY: number) => void
  /** The scaled part's frame within the view. */
  onZoomFrameLayout: (frame: LayoutRectangle) => void
  /** The list's frame within the scaled part. */
  onListLayout: (frame: LayoutRectangle) => void
  onPressDay: (date: Date) => void
  onPressServiceYear: (serviceYear: number) => void
  onPressMeter: (month: CalendarMonth) => void
  editableGoal: (month: CalendarMonth) => boolean
  onEditGoal: (month: CalendarMonth) => void
  onStartReached: () => void
  onEndReached: () => void
}

/**
 * The Schedule's Month view: the focused month's goal over one continuous week
 * grid that scrolls through months without paging.
 */
export default function ScheduleMonthView({
  schedule,
  focusedMonth,
  focusedOrdinal,
  initialRowIndex,
  listRef,
  index,
  buddyMarkers,
  selectedKey,
  bottomInset,
  chromeStyle,
  zoomStyle,
  onScroll,
  onZoomFrameLayout,
  onListLayout,
  onPressDay,
  onPressServiceYear,
  onPressMeter,
  editableGoal,
  onEditGoal,
  onStartReached,
  onEndReached,
}: Props) {
  const theme = useTheme()
  const startOfWeek = useStartOfWeek()
  const recurringPlans = useServiceReport((s) => s.recurringPlans)
  const weekdays = moment.weekdaysShort()
  const weekdayLabels = weekdays.map(
    (_, column) => weekdays[(column + startOfWeek) % 7]
  )

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[
          { flexDirection: 'row', paddingHorizontal: 15, paddingBottom: 6 },
          chromeStyle,
        ]}
      >
        <MonthGoalMeter
          {...focusedMonth}
          onPress={() => onPressMeter(focusedMonth)}
          onEditGoal={
            editableGoal(focusedMonth)
              ? () => onEditGoal(focusedMonth)
              : undefined
          }
        />
      </Animated.View>
      <Animated.View
        style={[{ flex: 1 }, zoomStyle]}
        onLayout={(e) => onZoomFrameLayout(e.nativeEvent.layout)}
      >
        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: MONTH_GRID_PADDING,
            paddingTop: 6,
            paddingBottom: 4,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          {weekdayLabels.map((label, column) => (
            <Text
              key={column}
              numberOfLines={1}
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: theme.fontSize('xs'),
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
                textTransform: 'uppercase',
              }}
            >
              {label}
            </Text>
          ))}
        </View>
        <View
          style={{ flex: 1 }}
          onLayout={(e) => onListLayout(e.nativeEvent.layout)}
        >
          <FlashList
            ref={listRef}
            data={schedule.rows}
            keyExtractor={(row) => row.key}
            getItemType={(row) => row.kind}
            initialScrollIndex={initialRowIndex}
            // The focused month stays out of here: a new month would
            // re-render every week on screen mid-scroll.
            extraData={{ selectedKey, index, buddyMarkers }}
            onScroll={(e) => onScroll(e.nativeEvent.contentOffset.y)}
            scrollEventThrottle={16}
            onStartReached={onStartReached}
            onStartReachedThreshold={2}
            onEndReached={onEndReached}
            onEndReachedThreshold={2}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: MONTH_GRID_PADDING }}
            ListFooterComponent={<View style={{ height: bottomInset }} />}
            renderItem={({ item }) =>
              item.kind === 'serviceYear' ? (
                <ServiceYearDivider
                  serviceYear={item.serviceYear}
                  onPress={() => onPressServiceYear(item.serviceYear)}
                />
              ) : item.kind === 'month' ? (
                <ScheduleMonthHeader row={item} />
              ) : (
                <ScheduleWeekRow
                  row={item}
                  focusedOrdinal={focusedOrdinal}
                  selectedKey={selectedKey}
                  index={index}
                  recurringPlans={recurringPlans}
                  buddyMarkers={buddyMarkers}
                  onPressDay={onPressDay}
                />
              )
            }
          />
        </View>
      </Animated.View>
    </View>
  )
}
