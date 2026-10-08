import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react-native'
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
import useStartOfWeek from '@/hooks/useStartOfWeek'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import { serviceYearFocusMonth, serviceYearMonths } from '@/lib/roleHistory'
import useServiceReport from '@/stores/serviceReport'
import useServiceYearPace from '@/features/progress/hooks/useServiceYearPace'
import GoalSplitBar from '@/features/plans/components/GoalSplitBar'
import YearMonthTile from '@/features/plans/components/YearMonthTile'
import {
  serviceYearDayStatuses,
  type ScheduleDayIndex,
} from '@/features/plans/lib/scheduleDayIndex'
import { dayKeyOf, sameCalendarMonth } from '@/features/plans/lib/scheduleRows'
import type { Rect } from '@/features/plans/lib/scheduleZoom'

const PADDING = 15
const GAP = 8

export type ScheduleYearViewHandle = {
  /** A month's day grid in the view's own coordinates, scroll included. */
  monthRect: (month: CalendarMonth) => Rect | undefined
  /** Scrolls, without animating, so the month's tile is on screen. */
  reveal: (month: CalendarMonth) => void
}

type Props = {
  ref?: Ref<ScheduleYearViewHandle>
  serviceYear: number
  focusedMonth: CalendarMonth
  index: ScheduleDayIndex
  bottomInset: number
  zoomStyle: AnimatedStyle<ViewStyle>
  onChangeServiceYear: (serviceYear: number) => void
  onPressMonth: (month: CalendarMonth) => void
  editableGoal: (month: CalendarMonth) => boolean
  onEditGoal: (month: CalendarMonth) => void
}

const columnsFor = (width: number) => (width >= 900 ? 6 : width >= 560 ? 4 : 3)

/**
 * The Schedule's Year view: the twelve months of a Service Year, each a
 * miniature calendar with its goal, under the year's own total. Months are
 * where the Month view zooms out to and back into.
 */
export default function ScheduleYearView({
  ref,
  serviceYear,
  focusedMonth,
  index,
  bottomInset,
  zoomStyle,
  onChangeServiceYear,
  onPressMonth,
  editableGoal,
  onEditGoal,
}: Props) {
  const theme = useTheme()
  const startOfWeek = useStartOfWeek()
  const recurringPlans = useServiceReport((s) => s.recurringPlans)
  const { pace, monthGoalMinutes, today } = useServiceYearPace(serviceYear)
  const { hasAnnualGoal } = usePublisher(serviceYearFocusMonth(serviceYear))
  const [width, setWidth] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const scrollY = useRef(0)
  const viewportHeight = useRef(0)
  const gridFrame = useRef<LayoutRectangle | null>(null)
  const tileFrames = useRef(new Map<number, LayoutRectangle>())
  const dayGridFrames = useRef(new Map<number, LayoutRectangle>())

  const months = serviceYearMonths(serviceYear)
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
  // Whole points with a point to spare: a row that fills its width exactly
  // can still wrap its last tile once layout rounds to pixels.
  const tileWidth =
    width > 0
      ? Math.floor((width - PADDING * 2 - GAP * (columns - 1) - 1) / columns)
      : 0

  // By position (September first) rather than by date: every Service Year
  // lays out the same grid, so a tile can be found while the year changes.
  const indexOf = (month: CalendarMonth) => (month.month + 4) % 12

  const recordGridFrame = (month: CalendarMonth, frame: LayoutRectangle) =>
    dayGridFrames.current.set(indexOf(month), frame)

  const contentRect = (month: CalendarMonth): Rect | undefined => {
    const i = indexOf(month)
    const grid = gridFrame.current
    const tile = tileFrames.current.get(i)
    const days = dayGridFrames.current.get(i)
    if (!grid || !tile || !days) return undefined
    // The day grid's frame is measured from the tile's edge, past its name.
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
      // The whole tile, its name included, not just the days the zoom lands on.
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
          onScroll={(e) => {
            scrollY.current = e.nativeEvent.contentOffset.y
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
              icon={ChevronLeftIcon}
              size='lg'
              onPress={() => changeYear(serviceYear - 1)}
              accessibilityLabel={i18n.t(
                'scheduleCalendar.previousServiceYear'
              )}
            />
            <Text
              accessibilityRole='header'
              numberOfLines={1}
              style={{
                flexShrink: 1,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('lg'),
              }}
            >
              {rangeLabel}
            </Text>
            <IconButton
              icon={ChevronRightIcon}
              size='lg'
              onPress={() => changeYear(serviceYear + 1)}
              accessibilityLabel={i18n.t('scheduleCalendar.nextServiceYear')}
            />
          </View>
          <ServiceYearTotals
            loggedMinutes={pace.loggedMinutes}
            plannedMinutes={pace.projectedMinutes - pace.loggedMinutes}
            goalMinutes={hasAnnualGoal ? pace.goalMinutes : 0}
          />
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

function ServiceYearTotals({
  loggedMinutes,
  plannedMinutes,
  goalMinutes,
}: {
  loggedMinutes: number
  plannedMinutes: number
  goalMinutes: number
}) {
  const theme = useTheme()
  const logged = useFormattedMinutes(loggedMinutes)
  const planned = useFormattedMinutes(Math.max(0, plannedMinutes))
  const goal = useFormattedMinutes(goalMinutes)
  return (
    <View
      style={{
        marginHorizontal: PADDING,
        padding: 14,
        gap: 10,
        borderRadius: theme.numbers.borderRadiusLg,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 10,
        }}
      >
        <Text
          numberOfLines={2}
          style={{
            flexShrink: 1,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('scheduleCalendar.loggedAndPlanned', {
            logged: logged.formatted,
            planned: planned.formatted,
          })}
        </Text>
        {goalMinutes > 0 ? (
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('scheduleCalendar.annualGoal', { value: goal.formatted })}
          </Text>
        ) : null}
      </View>
      <GoalSplitBar
        goalMinutes={goalMinutes}
        loggedMinutes={loggedMinutes}
        plannedMinutes={plannedMinutes}
        height={8}
      />
    </View>
  )
}
