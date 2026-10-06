import {
  ArrowLeft as ArrowLeftIcon,
  ArrowRight as ArrowRightIcon,
  CalendarDays as CalendarDaysIcon,
} from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AdaptiveSplitScrollView from '@/components/ui/layout/AdaptiveSplitScrollView'
import {
  BottomTabScreenProps,
  useBottomTabBarHeight,
} from '@react-navigation/bottom-tabs'
import { useNavigation as useRootNavigation } from '@react-navigation/native'
import moment from 'moment'

import useServiceReport from '@/stores/serviceReport'
import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import ScheduleDayInspector from '@/features/plans/components/ScheduleDayInspector'
import { getMonthsReports } from '@/lib/serviceReport'
import {
  getPlansIntersectingDay,
  getEffectiveStartTimeInMinutesForRecurringPlan,
} from '@/lib/recurrence'
import usePublisher from '@/hooks/usePublisher'
import {
  getStartTimeInMinutes,
  isStoredDateOnLocalDay,
} from '@/lib/normalizeDate'
import { RootStackNavigation } from '@/types/rootStack'
import { HomeTabStackParamList } from '@/types/homeStack'
import { TimeEntry } from '@/types/timeEntry'

import SwipeMonthNavigator from '@/components/SwipeMonthNavigator'
import CalendarHeader, { CalendarViewMode } from '@/components/CalendarHeader'
import CalendarKey from '@/features/plans/components/CalendarKey'
import MonthTimeReportsCalendar from '@/features/service-reports/components/MonthTimeReportsCalendar'
import ScheduleScreenSections from '@/features/plans/components/ScheduleScreenSections'
import SelectedDateSheet, {
  SelectedDateSheetState,
} from '@/features/service-reports/components/SelectedDateSheet'
import Card from '@/components/ui/Card'
import Empty from '@/components/ui/Empty'
import LucideIcon from '@/components/ui/LucideIcon'
import Button from '@/components/ui/Button'
import ActionButton from '@/components/ui/ActionButton'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import PlanRow from '@/components/PlanRow'
import PlanBuddiesLine from '@/features/buddies/components/PlanBuddiesLine'
import type { PlanListItem } from '@/types/timeEntry'
import i18n from '@/lib/locales'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import MonthGoalEditorSheet from '@/features/service-reports/components/MonthGoalEditorSheet'
import ScheduleInsights from '@/features/plans/components/ScheduleInsights'
import BuddyPlansForDay from '@/features/buddies/components/BuddyPlansForDay'
import BuddyDayBadge from '@/features/buddies/components/BuddyDayBadge'
import TodayRouteEntry from '@/features/route-planning/components/TodayRouteEntry'
import useBuddyCalendarMarkers from '@/features/buddies/hooks/useBuddyCalendarMarkers'
import BuddiesHeaderButton from '@/features/buddies/components/BuddiesHeaderButton'
import RootHeader from '@/components/RootHeader'

type Props = BottomTabScreenProps<HomeTabStackParamList, 'Schedule'>

const ScheduleScreen = ({ route }: Props) => {
  const theme = useTheme()
  const { isWide, hasSidebar } = useAdaptiveLayout()
  const insets = useSafeAreaInsets()
  const tabBarHeight = useBottomTabBarHeight()
  const rootNavigation = useRootNavigation<RootStackNavigation>()
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const dayPlans = useServiceReport((s) => s.dayPlans)
  const recurringPlans = useServiceReport((s) => s.recurringPlans)
  const [year, setYear] = useState(route.params?.year ?? moment().year())
  const [month, setMonth] = useState(route.params?.month ?? moment().month())
  const [calendarViewMode, setCalendarViewMode] =
    useState<CalendarViewMode>('planned')
  const [showPastPlans, setShowPastPlans] = useState(false)
  const [goalEditorOpen, setGoalEditorOpen] = useState(false)
  const [selectedDateSheet, setSelectedDateSheet] =
    useState<SelectedDateSheetState>({
      open: false,
      date: new Date(),
    })

  // Keep the inspector within the displayed month when paging the calendar.
  useEffect(() => {
    setSelectedDateSheet((current) => {
      if (
        moment(current.date).month() === month &&
        moment(current.date).year() === year
      )
        return current
      const date = moment().year(year).month(month).startOf('month')
      if (date.isSame(moment(), 'month')) date.date(moment().date())
      return { open: false, date: date.toDate() }
    })
  }, [month, year])

  useEffect(() => {
    if (isWide) setSelectedDateSheet((current) => ({ ...current, open: false }))
  }, [isWide])

  const pendingNavigation = useRef<(() => void) | null>(null)
  const selectedMonth = useMemo(
    () => moment().month(month).year(year),
    [month, year]
  )
  const isCurrentMonth = month === moment().month() && year === moment().year()
  const isPastMonth = selectedMonth.isBefore(moment(), 'month')
  const {
    baseGoalHours,
    effectiveGoalHours,
    setOverride: setMonthlyGoalOverride,
    clearOverride: clearMonthlyGoalOverride,
  } = useMonthlyGoal({ month, year })
  const { annualGoalHours, hasAnnualGoal } = usePublisher()
  const buddyMarkers = useBuddyCalendarMarkers()

  const thisMonthsReports = useMemo(
    () => getMonthsReports(serviceReports, month, year),
    [month, serviceReports, year]
  )

  type PlanInstance = PlanListItem & { sortKey: number }

  const { pastPlans, currentAndFuturePlans } = useMemo(() => {
    const base = moment().month(month).year(year).startOf('month')
    const daysInMonth = base.daysInMonth()
    const todayStartMs = moment().startOf('day').valueOf()
    const items: PlanInstance[] = []

    for (let d = 1; d <= daysInMonth; d++) {
      const dayDate = moment(base).date(d).toDate()
      const dayStartMs = moment(base).date(d).startOf('day').valueOf()

      const dayPlansForDay = dayPlans.filter((dp) =>
        isStoredDateOnLocalDay(dp.date, dayDate)
      )
      for (const plan of dayPlansForDay) {
        items.push({
          type: 'day',
          date: dayDate,
          plan,
          sortKey: dayStartMs + getStartTimeInMinutes(plan),
        })
      }

      const recurringForDay = getPlansIntersectingDay(dayDate, recurringPlans)
      for (const plan of recurringForDay) {
        items.push({
          type: 'recurring',
          date: dayDate,
          plan,
          sortKey:
            dayStartMs +
            getEffectiveStartTimeInMinutesForRecurringPlan(plan, dayDate),
        })
      }
    }

    items.sort((a, b) => a.sortKey - b.sortKey)

    if (!isCurrentMonth) {
      return { pastPlans: [] as PlanInstance[], currentAndFuturePlans: items }
    }

    const past: PlanInstance[] = []
    const currentAndFuture: PlanInstance[] = []
    for (const item of items) {
      if (moment(item.date).startOf('day').valueOf() < todayStartMs) {
        past.push(item)
      } else {
        currentAndFuture.push(item)
      }
    }
    return { pastPlans: past, currentAndFuturePlans: currentAndFuture }
  }, [dayPlans, recurringPlans, month, year, isCurrentMonth])

  const hasAnyPlans = pastPlans.length > 0 || currentAndFuturePlans.length > 0
  const visiblePlans = showPastPlans
    ? [...currentAndFuturePlans, ...[...pastPlans].reverse()]
    : currentAndFuturePlans

  const handleAddTime = useCallback(() => {
    pendingNavigation.current = () => {
      rootNavigation.navigate('Add Time', {
        date: selectedDateSheet.date.toISOString(),
      })
    }
  }, [rootNavigation, selectedDateSheet.date])

  const handlePlanDay = useCallback(() => {
    pendingNavigation.current = () => {
      rootNavigation.navigate('PlanDay', {
        date: selectedDateSheet.date.toISOString(),
      })
    }
  }, [rootNavigation, selectedDateSheet.date])

  const handleEditTimeReport = useCallback(
    (report: TimeEntry) => {
      pendingNavigation.current = () => {
        rootNavigation.navigate('Add Time', {
          existingReport: JSON.stringify(report),
        })
      }
    },
    [rootNavigation]
  )

  useEffect(() => {
    if (!selectedDateSheet.open && pendingNavigation.current) {
      const callback = pendingNavigation.current
      pendingNavigation.current = null
      setTimeout(callback, 125)
    }
  }, [selectedDateSheet.open])

  const handleArrowNavigate = useCallback(
    (direction: 'forward' | 'back') => {
      if (direction === 'forward') {
        if (month === 11) {
          setMonth(0)
          setYear(year + 1)
        } else {
          setMonth(month + 1)
        }
      } else {
        if (month === 0) {
          setMonth(11)
          setYear(year - 1)
        } else {
          setMonth(month - 1)
        }
      }
    },
    [month, year]
  )

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <RootHeader
        title={i18n.t('Schedule')}
        actions={<BuddiesHeaderButton />}
        contentStyle={{ maxWidth: isWide ? 1200 : 720 }}
      />
      <SwipeMonthNavigator
        onSwipeForward={() => handleArrowNavigate('forward')}
        onSwipeBack={() => handleArrowNavigate('back')}
        style={{ flex: 1 }}
      >
        <AdaptiveSplitScrollView
          leadingFraction={0.54}
          gap={20}
          paddingTop={8}
          paddingBottom={(hasSidebar ? insets.bottom : tabBarHeight) + 40}
          header={
            <View style={{ gap: 15 }}>
              <XView
                style={{
                  justifyContent: 'space-between',
                }}
              >
                <Button
                  onPress={() => handleArrowNavigate('back')}
                  style={navButtonStyle(theme)}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      gap: 5,
                      alignItems: 'center',
                    }}
                  >
                    <IconButton icon={ArrowLeftIcon} size={15} />
                    <Text style={{ color: theme.colors.textAlt }}>
                      {moment(selectedMonth).subtract(1, 'month').format('MMM')}
                    </Text>
                  </View>
                </Button>
                <Text
                  style={{
                    fontSize: theme.fontSize('lg'),
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {selectedMonth.format('MMMM YYYY')}
                </Text>
                <Button
                  onPress={() => handleArrowNavigate('forward')}
                  style={navButtonStyle(theme)}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      gap: 5,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: theme.colors.textAlt }}>
                      {moment(selectedMonth).add(1, 'month').format('MMM')}
                    </Text>
                    <IconButton icon={ArrowRightIcon} size={15} />
                  </View>
                </Button>
              </XView>
              {!isCurrentMonth && (
                <Button
                  style={{
                    alignSelf: 'center',
                    backgroundColor: theme.colors.accentTranslucent,
                    paddingVertical: 5,
                    paddingHorizontal: 15,
                    borderRadius: theme.numbers.borderRadiusSm,
                  }}
                  onPress={() => {
                    setYear(moment().year())
                    setMonth(moment().month())
                  }}
                >
                  <Text style={{ textDecorationLine: 'underline' }}>
                    {i18n.t('today')}
                  </Text>
                </Button>
              )}
            </View>
          }
          leading={
            <View style={{ gap: 15 }}>
              <ScheduleInsights
                month={month}
                year={year}
                onEditGoal={
                  baseGoalHours > 0 && !isPastMonth
                    ? () => setGoalEditorOpen(true)
                    : undefined
                }
              />
              <Card>
                <CalendarHeader
                  viewMode={calendarViewMode}
                  onChangeViewMode={setCalendarViewMode}
                />
                <View>
                  <CalendarKey
                    showBuddiesOut={Object.entries(buddyMarkers).some(
                      ([day, marker]) =>
                        day.startsWith(selectedMonth.format('YYYY-MM')) &&
                        marker.withBuddies.length === 0 &&
                        marker.goingOut.length > 0
                    )}
                  />
                  <MonthTimeReportsCalendar
                    month={month}
                    year={year}
                    monthsReports={thisMonthsReports}
                    setSheet={(next) =>
                      setSelectedDateSheet((previous) => {
                        const selected =
                          typeof next === 'function' ? next(previous) : next
                        return { ...selected, open: !isWide }
                      })
                    }
                    selectedDate={isWide ? selectedDateSheet.date : undefined}
                    viewMode={calendarViewMode}
                    renderDayOverlay={(date) =>
                      buddyMarkers[date] ? (
                        <BuddyDayBadge marker={buddyMarkers[date]} />
                      ) : null
                    }
                  />
                </View>
                <ActionButton
                  onPress={() => rootNavigation.navigate('PlanDay', {})}
                >
                  {i18n.t('createPlan')}
                </ActionButton>
              </Card>
              <ScheduleScreenSections month={month} year={year} />
            </View>
          }
          trailing={
            <View style={{ gap: 20 }}>
              {isWide && (
                <ScheduleDayInspector
                  date={selectedDateSheet.date}
                  reports={thisMonthsReports || []}
                />
              )}
              <View style={{ gap: 8 }}>
                <XView
                  style={{
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.textAlt,
                      textTransform: 'uppercase',
                      fontSize: theme.fontSize('sm'),
                      fontFamily: theme.fonts.semiBold,
                      letterSpacing: 0.5,
                    }}
                  >
                    {i18n.t('plans')}
                  </Text>
                  {isCurrentMonth && pastPlans.length > 0 && (
                    <Button onPress={() => setShowPastPlans((v) => !v)}>
                      <Text
                        style={{
                          color: theme.colors.textAlt,
                          fontSize: theme.fontSize('sm'),
                          fontFamily: theme.fonts.semiBold,
                          textDecorationLine: 'underline',
                        }}
                      >
                        {showPastPlans
                          ? i18n.t('hidePreviousPlans')
                          : i18n.t('showPreviousPlans')}
                      </Text>
                    </Button>
                  )}
                </XView>
                <View style={{ gap: 10, minHeight: 10 }}>
                  {!hasAnyPlans ? (
                    <Empty
                      dashedOutline
                      icon={
                        <LucideIcon
                          icon={CalendarDaysIcon}
                          size={24}
                          color={theme.colors.text}
                        />
                      }
                      title={i18n.t('noPlansScheduledForThisMonth')}
                    />
                  ) : (
                    visiblePlans.map((item) => (
                      <PlanRow
                        key={`${item.type}-${item.plan.id}-${item.date.toISOString()}`}
                        item={item}
                        dateDisplay='monthList'
                        contextMonth={month}
                        contextYear={year}
                        footer={
                          item.type === 'day' ? (
                            <PlanBuddiesLine plan={item.plan} />
                          ) : undefined
                        }
                      />
                    ))
                  )}
                </View>
              </View>
            </View>
          }
        />
      </SwipeMonthNavigator>
      {!isWide && (
        <SelectedDateSheet
          sheet={selectedDateSheet}
          setSheet={setSelectedDateSheet}
          thisMonthsReports={thisMonthsReports}
          onAddTime={handleAddTime}
          onPlanDay={handlePlanDay}
          onEditTimeReport={handleEditTimeReport}
          renderFooter={(date, onNavigate) => (
            <>
              <TodayRouteEntry date={date} onNavigate={onNavigate} />
              <BuddyPlansForDay date={date} onNavigate={onNavigate} />
            </>
          )}
          renderDayPlanFooter={(plan) => <PlanBuddiesLine plan={plan} />}
        />
      )}
      {baseGoalHours > 0 && !isPastMonth ? (
        <MonthGoalEditorSheet
          open={goalEditorOpen}
          onOpenChange={setGoalEditorOpen}
          month={month}
          year={year}
          regularGoalHours={baseGoalHours}
          effectiveGoalHours={effectiveGoalHours}
          annualGoalHours={hasAnnualGoal ? annualGoalHours : null}
          onSaveGoal={setMonthlyGoalOverride}
          onUseRegularGoal={clearMonthlyGoalOverride}
        />
      ) : null}
    </View>
  )
}

const navButtonStyle = (theme: ReturnType<typeof useTheme>) => ({
  borderColor: theme.colors.border,
  borderWidth: 1,
  borderRadius: theme.numbers.borderRadiusLg,
  paddingHorizontal: 15,
  paddingVertical: 5,
})

export default ScheduleScreen
