import { FlashList, type FlashListRef } from '@shopify/flash-list'
import type { HideBarsScrollProps } from '@/hooks/useHideBarsOnScroll'
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
import useAccessibilityTextSize, {
  FIT_ONE_LINE,
} from '@/hooks/useAccessibilityTextSize'
import useStartOfWeek from '@/hooks/useStartOfWeek'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import useServiceReport from '@/stores/serviceReport'
import type { BuddyDayMarker } from '@/features/buddies/lib/calendarMarkers'
import MonthGoalMeter from '@/features/plans/components/MonthGoalMeter'
import MonthOverviewPopover from '@/features/plans/components/MonthOverviewPopover'
import ScheduleMonthHeader from '@/features/plans/components/ScheduleMonthHeader'
import ScheduleWeekRow from '@/features/plans/components/ScheduleWeekRow'
import ServiceYearDivider from '@/features/plans/components/ServiceYearDivider'
import type { ScheduleDayIndex } from '@/features/plans/lib/scheduleDayIndex'
import type {
  ScheduleRow,
  ScheduleRows,
} from '@/features/plans/lib/scheduleRows'

export const MONTH_GRID_PADDING = 8

type Props = {
  schedule: ScheduleRows
  focusedMonth: CalendarMonth

  focusedOrdinal: SharedValue<number>
  initialRowIndex: number
  listRef: RefObject<FlashListRef<ScheduleRow> | null>
  index: ScheduleDayIndex
  buddyMarkers: Record<string, BuddyDayMarker>
  selectedKey?: string
  bottomInset: number

  chromeStyle: AnimatedStyle<ViewStyle>

  zoomStyle: AnimatedStyle<ViewStyle>
  onScroll: (offsetY: number) => void

  onScrollBeginDrag: () => void

  scrollBars?: HideBarsScrollProps

  onZoomFrameLayout: (frame: LayoutRectangle) => void

  onListLayout: (frame: LayoutRectangle) => void

  onListLoad: () => void
  onPressDay: (date: Date) => void
  onPressServiceYear: (serviceYear: number) => void
  editableGoal: (month: CalendarMonth) => boolean
  onEditGoal: (month: CalendarMonth) => void
  onStartReached: () => void
  onEndReached: () => void
}

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
  onScrollBeginDrag,
  scrollBars,
  onZoomFrameLayout,
  onListLayout,
  onListLoad,
  onPressDay,
  onPressServiceYear,
  editableGoal,
  onEditGoal,
  onStartReached,
  onEndReached,
}: Props) {
  const theme = useTheme()
  const startOfWeek = useStartOfWeek()
  const recurringPlans = useServiceReport((s) => s.recurringPlans)

  const largeText = useAccessibilityTextSize()
  const weekdays = largeText ? moment.weekdaysMin() : moment.weekdaysShort()
  const weekdayLabels = weekdays.map(
    (_, column) => weekdays[(column + startOfWeek) % 7]
  )
  const fitWeekday = largeText ? FIT_ONE_LINE : undefined

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[
          { flexDirection: 'row', paddingHorizontal: 15, paddingBottom: 6 },
          chromeStyle,
        ]}
      >
        <MonthOverviewPopover
          month={focusedMonth}
          onEditGoal={
            editableGoal(focusedMonth)
              ? () => onEditGoal(focusedMonth)
              : undefined
          }
          renderTrigger={({ onPress, anchorRef }) => (
            <View
              ref={anchorRef}
              collapsable={false}
              style={{ flex: 1, flexDirection: 'row' }}
            >
              <MonthGoalMeter
                {...focusedMonth}
                onPress={onPress}
                onEditGoal={
                  editableGoal(focusedMonth)
                    ? () => onEditGoal(focusedMonth)
                    : undefined
                }
              />
            </View>
          )}
        />
      </Animated.View>
      <Animated.View
        style={[{ flex: 1 }, zoomStyle]}
        onLayout={(e) => onZoomFrameLayout(e.nativeEvent.layout)}
      >
        {}
        <View
          accessibilityElementsHidden
          importantForAccessibility='no-hide-descendants'
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
              {...fitWeekday}
              style={{
                flex: 1,

                paddingHorizontal: largeText ? 3 : 0,
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
            onLoad={onListLoad}
            extraData={{ selectedKey, index, buddyMarkers }}
            {...scrollBars}
            scrollsToTop={false}
            onScroll={(e) => {
              onScroll(e.nativeEvent.contentOffset.y)
              scrollBars?.onScroll(e)
            }}
            onScrollBeginDrag={(e) => {
              onScrollBeginDrag()
              scrollBars?.onScrollBeginDrag(e)
            }}
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
