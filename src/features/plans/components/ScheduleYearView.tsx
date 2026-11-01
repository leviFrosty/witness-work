import moment from 'moment'
import { serviceYearMonthIndex, serviceYearOf } from '@/lib/serviceYear'
import {
  ChevronBackwardIcon,
  ChevronForwardIcon,
} from '@/components/ui/DirectionalIcon'
import { type Ref, useImperativeHandle, useRef, useState } from 'react'
import {
  type LayoutRectangle,
  ScrollView,
  View,
  type ViewStyle,
} from 'react-native'
import Animated, { type AnimatedStyle } from 'react-native-reanimated'
import SwipeMonthNavigator from '@/components/SwipeMonthNavigator'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import usePublisher from '@/hooks/usePublisher'
import { useServiceYearScheduleStatus } from '@/hooks/useScheduleStatus'
import useStartOfWeek from '@/hooks/useStartOfWeek'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import { getPeriodTense } from '@/lib/projectedTotalCopy'
import { plannedMinutesThroughDayForMonth } from '@/lib/recurrence'
import { serviceYearFocusMonth, serviceYearMonths } from '@/lib/roleHistory'
import useServiceReport from '@/stores/serviceReport'
import useServiceYearPace from '@/features/progress/hooks/useServiceYearPace'
import GoalMeterCard from '@/features/plans/components/GoalMeterCard'
import YearMonthTile from '@/features/plans/components/YearMonthTile'
import type { HideBarsScrollProps } from '@/hooks/useHideBarsOnScroll'
import {
  serviceYearDayStatuses,
  type ScheduleDayIndex,
} from '@/features/plans/lib/scheduleDayIndex'
import { dayKeyOf, sameCalendarMonth } from '@/features/plans/lib/scheduleRows'
import type { Rect } from '@/features/plans/lib/scheduleZoom'

const PADDING = 15
const GAP = 8

export type ScheduleYearViewHandle = {
  monthRect: (month: CalendarMonth) => Rect | undefined

  reveal: (month: CalendarMonth) => void
}

type Props = {
  ref?: Ref<ScheduleYearViewHandle>
  serviceYear: number
  focusedMonth: CalendarMonth
  index: ScheduleDayIndex
  bottomInset: number
  zoomStyle: AnimatedStyle<ViewStyle>

  scrollBars?: HideBarsScrollProps
  onChangeServiceYear: (serviceYear: number) => void
  onPressMonth: (month: CalendarMonth) => void
  editableGoal: (month: CalendarMonth) => boolean
  onEditGoal: (month: CalendarMonth) => void
}

const columnsFor = (width: number) => (width >= 900 ? 6 : width >= 560 ? 4 : 3)

export default function ScheduleYearView({
  ref,
  serviceYear,
  focusedMonth,
  index,
  bottomInset,
  zoomStyle,
  scrollBars,
  onChangeServiceYear,
  onPressMonth,
  editableGoal,
  onEditGoal,
}: Props) {
  const theme = useTheme()
  const startOfWeek = useStartOfWeek()
  const dayPlans = useServiceReport((s) => s.dayPlans)
  const recurringPlans = useServiceReport((s) => s.recurringPlans)
  const { pace, projection, monthGoalMinutes, today } =
    useServiceYearPace(serviceYear)
  const { hasAnnualGoal } = usePublisher(serviceYearFocusMonth(serviceYear))
  const schedule = useServiceYearScheduleStatus(serviceYear)
  const [width, setWidth] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const scrollY = useRef(0)
  const viewportHeight = useRef(0)
  const gridFrame = useRef<LayoutRectangle | null>(null)
  const tileFrames = useRef(new Map<number, LayoutRectangle>())
  const dayGridFrames = useRef(new Map<number, LayoutRectangle>())

  const months = serviceYearMonths(serviceYear)

  const plannedMinutes = months.reduce(
    (total, { month, year }) =>
      total +
      plannedMinutesThroughDayForMonth(
        month,
        year,
        moment({ year, month, day: 1 }).daysInMonth(),
        dayPlans,
        recurringPlans
      ),
    0
  )
  const statuses = serviceYearDayStatuses({
    serviceYear,
    index,
    recurringPlans,
    today,
  })
  const todayKey = dayKeyOf(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  )
  const columns = columnsFor(width)

  const tileWidth =
    width > 0
      ? Math.floor((width - PADDING * 2 - GAP * (columns - 1) - 1) / columns)
      : 0

  const indexOf = (month: CalendarMonth) =>
    serviceYearMonthIndex(month, serviceYearOf(month))

  const recordGridFrame = (month: CalendarMonth, frame: LayoutRectangle) =>
    dayGridFrames.current.set(indexOf(month), frame)

  const contentRect = (month: CalendarMonth): Rect | undefined => {
    const i = indexOf(month)
    const grid = gridFrame.current
    const tile = tileFrames.current.get(i)
    const days = dayGridFrames.current.get(i)
    if (!grid || !tile || !days) return undefined

    return {
      x: grid.x + tile.x + days.x,
      y: grid.y + tile.y + days.y,
      width: days.width,
      height: days.height,
    }
  }

  useImperativeHandle(ref, () => ({
    monthRect: (month) => {
      const rect = contentRect(month)
      return rect && { ...rect, y: rect.y - scrollY.current }
    },
    reveal: (month) => {
      const grid = gridFrame.current
      const tile = tileFrames.current.get(indexOf(month))
      if (!grid || !tile) return
      const tileTop = grid.y + tile.y
      const top = scrollY.current
      const bottom = top + viewportHeight.current - bottomInset
      if (tileTop >= top && tileTop + tile.height <= bottom) return
      const y = Math.max(0, tileTop - viewportHeight.current / 3)
      scrollRef.current?.scrollTo({ y, animated: false })
      scrollY.current = y
    },
  }))

  const changeYear = (next: number) => {
    Haptics.selection()
    onChangeServiceYear(next)
  }

  const rangeLabel = i18n.t('scheduleCalendar.serviceYearRange', {
    start: serviceYear,
    end: serviceYear + 1,
  })

  const spanLabel = i18n.t('scheduleCalendar.serviceYearSpan', {
    start: serviceYear,
    end: serviceYear + 1,
  })

  return (
    <Animated.View
      style={[{ flex: 1 }, zoomStyle]}
      onLayout={(e) => {
        setWidth(e.nativeEvent.layout.width)
        viewportHeight.current = e.nativeEvent.layout.height
      }}
    >
      <SwipeMonthNavigator
        onSwipeForward={() => onChangeServiceYear(serviceYear + 1)}
        onSwipeBack={() => onChangeServiceYear(serviceYear - 1)}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollRef}
          {...scrollBars}
          scrollsToTop={false}
          onScroll={(e) => {
            scrollY.current = e.nativeEvent.contentOffset.y
            scrollBars?.onScroll(e)
          }}
          scrollEventThrottle={16}
          contentContainerStyle={{
            paddingTop: 4,
            paddingBottom: bottomInset,
            gap: 12,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: PADDING - 6,
            }}
          >
            <IconButton
              icon={ChevronBackwardIcon}
              size='lg'
              onPress={() => changeYear(serviceYear - 1)}
              accessibilityLabel={i18n.t(
                'scheduleCalendar.previousServiceYear'
              )}
            />
            <Text
              accessibilityRole='header'
              accessibilityLabel={rangeLabel}
              numberOfLines={1}
              style={{
                flexShrink: 1,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('lg'),
              }}
            >
              {spanLabel}
            </Text>
            <IconButton
              icon={ChevronForwardIcon}
              size='lg'
              onPress={() => changeYear(serviceYear + 1)}
              accessibilityLabel={i18n.t('scheduleCalendar.nextServiceYear')}
            />
          </View>
          <View style={{ marginHorizontal: PADDING }}>
            <GoalMeterCard
              title={i18n.t('serviceYear')}
              goalMinutes={hasAnnualGoal ? pace.goalMinutes : 0}
              loggedMinutes={projection.loggedMinutes}
              plannedMinutes={plannedMinutes}
              tense={getPeriodTense(
                { kind: 'serviceYear', serviceYear },
                today
              )}
              schedule={schedule}
            />
          </View>
          <View
            onLayout={(e) => {
              gridFrame.current = e.nativeEvent.layout
            }}
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: GAP,
              paddingHorizontal: PADDING,
            }}
          >
            {tileWidth > 0 &&
              months.map((month, i) => (
                <View
                  key={`${month.year}-${month.month}`}
                  onLayout={(e) => {
                    tileFrames.current.set(i, e.nativeEvent.layout)
                  }}
                >
                  <YearMonthTile
                    {...month}
                    width={tileWidth}
                    startOfWeek={startOfWeek}
                    statuses={statuses}
                    todayKey={todayKey}
                    focused={sameCalendarMonth(month, focusedMonth)}
                    loggedMinutes={pace.months[i]?.loggedMinutes ?? 0}
                    plannedMinutes={pace.months[i]?.plannedMinutes ?? 0}
                    goalMinutes={monthGoalMinutes[i] ?? 0}
                    onPress={onPressMonth}
                    onEditGoal={editableGoal(month) ? onEditGoal : undefined}
                    onGridLayout={recordGridFrame}
                  />
                </View>
              ))}
          </View>
        </ScrollView>
      </SwipeMonthNavigator>
    </Animated.View>
  )
}
