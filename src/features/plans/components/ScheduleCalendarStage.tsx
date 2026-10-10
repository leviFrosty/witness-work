import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import type { BuddyDayMarker } from '@/features/buddies/lib/calendarMarkers'
import JumpToTodayButton from '@/features/plans/components/JumpToTodayButton'
import ScheduleMonthView from '@/features/plans/components/ScheduleMonthView'
import ScheduleYearView from '@/features/plans/components/ScheduleYearView'
import type useScheduleCalendar from '@/features/plans/hooks/useScheduleCalendar'
import type { ScheduleDayIndex } from '@/features/plans/lib/scheduleDayIndex'

/** How far a pinch must go before it zooms. */
const PINCH_OUT = 0.8
const PINCH_IN = 1.3

type Props = {
  calendar: ReturnType<typeof useScheduleCalendar>
  index: ScheduleDayIndex
  buddyMarkers: Record<string, BuddyDayMarker>
  selectedKey?: string
  /** Room under the content for the floating tab bar. */
  bottomInset: number
  onPressDay: (date: Date) => void
  onOpenOverview: (month: CalendarMonth) => void
  editableGoal: (month: CalendarMonth) => boolean
  onEditGoal: (month: CalendarMonth) => void
}

/**
 * The Month and Year views stacked in one frame. Only the active one takes
 * touches and VoiceOver; the zoom moves both through the same rects so one
 * appears to become the other. Pinching in or out zooms too.
 */
export default function ScheduleCalendarStage({
  calendar,
  index,
  buddyMarkers,
  selectedKey,
  bottomInset,
  onPressDay,
  onOpenOverview,
  editableGoal,
  onEditGoal,
}: Props) {
  // Everything comes out of `calendar` up front. Reading it off `calendar`
  // in render, after its refs, keeps the React Compiler from compiling this
  // stage, and closures over `calendar` itself would change with every scroll.
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
    onZoomFrameLayout,
    onListLayout,
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

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart((event) => pinchStarted(event.focalX, event.focalY))
    .onEnd((event) => {
      if (monthActive && event.scale < PINCH_OUT) zoomOut('pinch')
      else if (!monthActive && event.scale > PINCH_IN) zoomIn(pinchedMonth())
    })

  const layer = (active: boolean) =>
    ({
      // Never flattened: otherwise switching these props re-parents the whole
      // view, every day's native menu included, and stalls the zoom.
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
            chromeStyle={zoom.monthChromeStyle}
            zoomStyle={zoom.monthZoomStyle}
            onScroll={onScroll}
            onZoomFrameLayout={onZoomFrameLayout}
            onListLayout={onListLayout}
            onPressDay={onPressDay}
            onPressServiceYear={(serviceYear) =>
              zoomOut('divider', serviceYear)
            }
            onPressMeter={onOpenOverview}
            editableGoal={editableGoal}
            onEditGoal={onEditGoal}
            onStartReached={onStartReached}
            onEndReached={onEndReached}
          />
        </View>
        <View {...layer(!monthActive)}>
          <ScheduleYearView
            ref={yearRef}
            serviceYear={yearServiceYear}
            focusedMonth={yearFocusedMonth}
            index={index}
            bottomInset={bottomInset}
            zoomStyle={zoom.yearZoomStyle}
            onChangeServiceYear={changeServiceYear}
            onPressMonth={zoomIn}
            editableGoal={editableGoal}
            onEditGoal={onEditGoal}
          />
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
                ? 'left'
                : 'right'
          }
          bottom={bottomInset - 28}
          onPress={monthActive ? jumpToToday : showCurrentServiceYear}
        />
      </View>
    </GestureDetector>
  )
}
