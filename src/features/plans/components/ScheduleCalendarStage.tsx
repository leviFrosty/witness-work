import { startTransition, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import type { BuddyDayMarker } from '@/features/buddies/lib/calendarMarkers'
import JumpToTodayButton from '@/features/plans/components/JumpToTodayButton'
import ScheduleMonthView from '@/features/plans/components/ScheduleMonthView'
import ScheduleYearView from '@/features/plans/components/ScheduleYearView'
import type useScheduleCalendar from '@/features/plans/hooks/useScheduleCalendar'
import type { ScheduleDayIndex } from '@/features/plans/lib/scheduleDayIndex'
import type { HideBarsScrollProps } from '@/hooks/useHideBarsOnScroll'

const PINCH_OUT = 0.8
const PINCH_IN = 1.3

type Props = {
  calendar: ReturnType<typeof useScheduleCalendar>
  index: ScheduleDayIndex
  buddyMarkers: Record<string, BuddyDayMarker>
  selectedKey?: string

  bottomInset: number

  scrollBars?: HideBarsScrollProps
  onPressDay: (date: Date) => void
  editableGoal: (month: CalendarMonth) => boolean
  onEditGoal: (month: CalendarMonth) => void
}

export default function ScheduleCalendarStage({
  calendar,
  index,
  buddyMarkers,
  selectedKey,
  bottomInset,
  scrollBars,
  onPressDay,
  editableGoal,
  onEditGoal,
}: Props) {
  const {
    view,
    monthLanding,
    zoom,
    schedule,
    focusedMonth,
    focusedOrdinal,
    yearFocusedMonth,
    initialRowIndex,
    listRef,
    yearRef,
    yearServiceYear,
    currentServiceYear,
    isCurrentServiceYear,
    todayDirection,
    onScroll,
    onScrollBeginDrag,
    onZoomFrameLayout,
    onListLayout,
    onListLoad,
    onStageLayout,
    onStartReached,
    onEndReached,
    zoomOut,
    zoomIn,
    pinchStarted,
    pinchedMonth,
    jumpToToday,
    changeServiceYear,
    showCurrentServiceYear,
  } = calendar
  const monthActive = view === 'month'

  const [yearMounted, setYearMounted] = useState(false)
  const showYear = yearMounted || !monthActive

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart((event) => pinchStarted(event.focalX, event.focalY))
    .onEnd((event) => {
      if (monthActive && event.scale < PINCH_OUT) zoomOut('pinch')
      else if (!monthActive && event.scale > PINCH_IN) zoomIn(pinchedMonth())
    })

  const layer = (active: boolean) =>
    ({
      collapsable: false,
      pointerEvents: active ? 'box-none' : 'none',
      accessibilityElementsHidden: !active,
      importantForAccessibility: active ? 'auto' : 'no-hide-descendants',
      style: StyleSheet.absoluteFill,
    }) as const

  return (
    <GestureDetector gesture={pinch}>
      <View
        style={{ flex: 1, overflow: 'hidden' }}
        onLayout={(e) => onStageLayout(e.nativeEvent.layout)}
      >
        <View {...layer(monthActive && !monthLanding)}>
          <ScheduleMonthView
            schedule={schedule}
            focusedMonth={focusedMonth}
            focusedOrdinal={focusedOrdinal}
            initialRowIndex={initialRowIndex}
            listRef={listRef}
            index={index}
            buddyMarkers={buddyMarkers}
            selectedKey={selectedKey}
            bottomInset={bottomInset}
            scrollBars={monthActive ? scrollBars : undefined}
            chromeStyle={zoom.monthChromeStyle}
            zoomStyle={zoom.monthZoomStyle}
            onScroll={onScroll}
            onScrollBeginDrag={onScrollBeginDrag}
            onZoomFrameLayout={onZoomFrameLayout}
            onListLayout={onListLayout}
            onListLoad={() => {
              onListLoad()
              startTransition(() => setYearMounted(true))
            }}
            onPressDay={onPressDay}
            onPressServiceYear={(serviceYear) =>
              zoomOut('divider', serviceYear)
            }
            editableGoal={editableGoal}
            onEditGoal={onEditGoal}
            onStartReached={onStartReached}
            onEndReached={onEndReached}
          />
        </View>
        <View {...layer(!monthActive)}>
          {showYear ? (
            <ScheduleYearView
              ref={yearRef}
              serviceYear={yearServiceYear}
              focusedMonth={yearFocusedMonth}
              index={index}
              bottomInset={bottomInset}
              zoomStyle={zoom.yearZoomStyle}
              scrollBars={monthActive ? undefined : scrollBars}
              onChangeServiceYear={changeServiceYear}
              onPressMonth={zoomIn}
              editableGoal={editableGoal}
              onEditGoal={onEditGoal}
            />
          ) : null}
        </View>
        <JumpToTodayButton
          visible={
            monthActive ? todayDirection !== 'visible' : !isCurrentServiceYear
          }
          direction={
            monthActive
              ? todayDirection === 'up'
                ? 'up'
                : 'down'
              : yearServiceYear > currentServiceYear
                ? 'backward'
                : 'forward'
          }
          bottom={bottomInset - 28}
          onPress={monthActive ? jumpToToday : showCurrentServiceYear}
        />
      </View>
    </GestureDetector>
  )
}
