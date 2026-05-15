import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import { useNavigation as useRootNavigation } from '@react-navigation/native'
import moment from 'moment'
import { faArrowLeft, faArrowRight } from '@fortawesome/free-solid-svg-icons'
import _ from 'lodash'

import useServiceReport from '@/stores/serviceReport'
import useTheme from '@/contexts/theme'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
  getPlansIntersectingDay,
  getEffectiveStartTimeInMinutesForRecurringPlan,
  getServiceYearFromDate,
  getServiceYearReports,
  getTotalMinutesForServiceYear,
  RecurringPlan,
} from '@/lib/serviceReport'
import { computeProjectedTotal } from '@/lib/projectedTotal'
import { getPeriodTense } from '@/lib/projectedTotalCopy'
import usePublisher from '@/hooks/usePublisher'
import { getStartTimeInMinutes } from '@/lib/normalizeDate'
import { RootStackNavigation } from '@/types/rootStack'
import { HomeTabStackParamList } from '@/types/homeStack'
import { DayPlan, ServiceReport } from '@/types/serviceReport'

import GlassCard from '@/components/ui/GlassCard'
import SwipeMonthNavigator from '@/components/SwipeMonthNavigator'
import CalendarHeader, { CalendarViewMode } from '@/components/CalendarHeader'
import CalendarKey from '@/features/plans/components/CalendarKey'
import MonthTimeReportsCalendar from '@/features/service-reports/components/MonthTimeReportsCalendar'
import AssistantSection from '@/components/AssistantSection'
import SelectedDateSheet, {
  SelectedDateSheetState,
} from '@/features/service-reports/components/SelectedDateSheet'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import SimpleProgressBar from '@/components/ui/SimpleProgressBar'
import DayPlanRow from '@/components/DayPlanRow'
import RecurringPlanRow from '@/components/RecurringPlanRow'
import i18n from '@/lib/locales'

type Props = BottomTabScreenProps<HomeTabStackParamList, 'Schedule'>

const ScheduleScreen = ({ route }: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const rootNavigation = useRootNavigation<RootStackNavigation>()
  const { serviceReports, dayPlans, recurringPlans } = useServiceReport()

  const [year, setYear] = useState(route.params?.year ?? moment().year())
  const [month, setMonth] = useState(route.params?.month ?? moment().month())
  const [calendarViewMode, setCalendarViewMode] =
    useState<CalendarViewMode>('planned')
  const [showPastPlans, setShowPastPlans] = useState(false)
  const [selectedDateSheet, setSelectedDateSheet] =
    useState<SelectedDateSheetState>({
      open: false,
      date: new Date(),
    })

  const pendingNavigation = useRef<(() => void) | null>(null)
  const selectedMonth = useMemo(
    () => moment().month(month).year(year),
    [month, year]
  )
  const isCurrentMonth = month === moment().month() && year === moment().year()

  const thisMonthsReports = useMemo(
    () => getMonthsReports(serviceReports, month, year),
    [month, serviceReports, year]
  )

  type PlanInstance =
    | { kind: 'day'; date: Date; plan: DayPlan; sortKey: number }
    | { kind: 'recurring'; date: Date; plan: RecurringPlan; sortKey: number }

  const { pastPlans, currentAndFuturePlans } = useMemo(() => {
    const base = moment().month(month).year(year).startOf('month')
    const daysInMonth = base.daysInMonth()
    const todayStartMs = moment().startOf('day').valueOf()
    const items: PlanInstance[] = []

    for (let d = 1; d <= daysInMonth; d++) {
      const dayDate = moment(base).date(d).toDate()
      const dayStartMs = moment(base).date(d).startOf('day').valueOf()

      const dayPlansForDay = dayPlans.filter((dp) =>
        moment(dp.date).isSame(dayDate, 'day')
      )
      for (const plan of dayPlansForDay) {
        items.push({
          kind: 'day',
          date: dayDate,
          plan,
          sortKey: dayStartMs + getStartTimeInMinutes(plan),
        })
      }

      const recurringForDay = getPlansIntersectingDay(dayDate, recurringPlans)
      for (const plan of recurringForDay) {
        items.push({
          kind: 'recurring',
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
    ? [...pastPlans, ...currentAndFuturePlans]
    : currentAndFuturePlans

  const handleEditDayPlan = useCallback(
    (plan: DayPlan, date: Date) => {
      rootNavigation.navigate('PlanDay', {
        date: date.toISOString(),
        existingDayPlanId: plan.id,
      })
    },
    [rootNavigation]
  )

  const handleEditRecurringPlanInstance = useCallback(
    (plan: RecurringPlan, date: Date) => {
      rootNavigation.navigate('PlanDay', {
        date: date.toISOString(),
        existingRecurringPlanId: plan.id,
        recurringPlanDate: date.toISOString(),
      })
    },
    [rootNavigation]
  )

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

  const handleNavigateToPlanDay = useCallback(
    (existingDayPlanId: string) => {
      pendingNavigation.current = () => {
        rootNavigation.navigate('PlanDay', {
          date: selectedDateSheet.date.toISOString(),
          existingDayPlanId,
        })
      }
    },
    [rootNavigation, selectedDateSheet.date]
  )

  const handleNavigateToRecurringPlan = useCallback(
    (existingRecurringPlanId: string, recurringPlanDate: string) => {
      pendingNavigation.current = () => {
        rootNavigation.navigate('PlanDay', {
          date: selectedDateSheet.date.toISOString(),
          existingRecurringPlanId,
          recurringPlanDate,
        })
      }
    },
    [rootNavigation, selectedDateSheet.date]
  )

  const handleEditTimeReport = useCallback(
    (report: ServiceReport) => {
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
      <SwipeMonthNavigator
        onSwipeForward={() => handleArrowNavigate('forward')}
        onSwipeBack={() => handleArrowNavigate('back')}
        style={{ flex: 1 }}
      >
        <KeyboardAwareScrollView
          contentContainerStyle={{
            paddingTop: insets.top + 15,
            paddingHorizontal: 15,
            paddingBottom: insets.bottom + 40,
            gap: 15,
          }}
        >
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
                <IconButton icon={faArrowLeft} size={15} />
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
                <IconButton icon={faArrowRight} size={15} />
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
          <Card style={{ gap: 10 }}>
            <View style={{ gap: 4 }}>
              <Text
                style={{
                  fontFamily: theme.fonts.bold,
                  fontSize: theme.fontSize('xl'),
                }}
              >
                {i18n.t('projectedHoursTitle')}
              </Text>
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {i18n.t('projectedHoursDescription')}
              </Text>
            </View>
            <XView style={{ flex: 1, gap: 10 }}>
              <MonthScheduleSection month={month} year={year} />
              <AnnualScheduleSection month={month} year={year} />
            </XView>
          </Card>
          <GlassCard>
            <CalendarHeader
              viewMode={calendarViewMode}
              onChangeViewMode={setCalendarViewMode}
            />
            <CalendarKey />
            <View style={{ marginTop: 4 }}>
              <MonthTimeReportsCalendar
                month={month}
                year={year}
                monthsReports={thisMonthsReports}
                setSheet={setSelectedDateSheet}
                viewMode={calendarViewMode}
              />
            </View>
          </GlassCard>
          <MonthAssistantCard month={month} year={year} />
          <View style={{ gap: 8 }}>
            <XView style={{ justifyContent: 'space-between' }}>
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
                <Card>
                  <Text>{i18n.t('noPlansScheduledForThisMonth')}</Text>
                </Card>
              ) : (
                visiblePlans.map((item) =>
                  item.kind === 'day' ? (
                    <DayPlanRow
                      key={`day-${item.plan.id}-${item.date.toISOString()}`}
                      plan={item.plan}
                      date={item.date}
                      onPress={() => handleEditDayPlan(item.plan, item.date)}
                    />
                  ) : (
                    <RecurringPlanRow
                      key={`recurring-${item.plan.id}-${item.date.toISOString()}`}
                      plan={item.plan}
                      date={item.date}
                      onPress={() =>
                        handleEditRecurringPlanInstance(item.plan, item.date)
                      }
                    />
                  )
                )
              )}
            </View>
          </View>
        </KeyboardAwareScrollView>
      </SwipeMonthNavigator>
      <SelectedDateSheet
        sheet={selectedDateSheet}
        setSheet={setSelectedDateSheet}
        thisMonthsReports={thisMonthsReports}
        onAddTime={handleAddTime}
        onPlanDay={handlePlanDay}
        onNavigateToPlanDay={handleNavigateToPlanDay}
        onNavigateToRecurringPlan={handleNavigateToRecurringPlan}
        onEditTimeReport={handleEditTimeReport}
      />
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

const MonthScheduleSection = (props: { month: number; year: number }) => {
  const theme = useTheme()
  const { dayPlans, recurringPlans, serviceReports } = useServiceReport()
  const {
    monthlyGoalHours: goalHours,
    creditCapMinutes,
    type: publisher,
  } = usePublisher()

  const today = useMemo(() => new Date(), [])

  const loggedAdjustedMinutes = useMemo(() => {
    const reports = getMonthsReports(serviceReports, props.month, props.year)
    return (
      adjustedMinutesForSpecificMonth(
        reports,
        props.month,
        props.year,
        publisher
      ).value ?? 0
    )
  }, [serviceReports, props.month, props.year, publisher])

  const result = useMemo(
    () =>
      computeProjectedTotal({
        scope: { kind: 'month', month: props.month, year: props.year },
        today,
        goalMinutes: goalHours * 60,
        loggedAdjustedMinutes,
        dayPlans,
        recurringPlans,
        creditCapMinutes,
      }),
    [
      props.month,
      props.year,
      today,
      goalHours,
      loggedAdjustedMinutes,
      dayPlans,
      recurringPlans,
      creditCapMinutes,
    ]
  )

  const projectedHours = result.projectedMinutes / 60
  const percentProjected = goalHours > 0 ? projectedHours / goalHours : 0

  return (
    <View style={{ gap: 5, flex: 1 }}>
      <XView style={{ justifyContent: 'space-between' }}>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('month')}
        </Text>
        <XView>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('xs'),
            }}
          >
            {`${_.round(
              projectedHours,
              1
            )} ${i18n.t('of')} ${goalHours} ${i18n.t('hours')}`}
          </Text>
        </XView>
      </XView>
      <SimpleProgressBar
        percentage={percentProjected}
        color={percentProjected < 1 ? theme.colors.warn : theme.colors.accent}
      />
    </View>
  )
}

const AnnualScheduleSection = (props: { month: number; year: number }) => {
  const { month, year } = props
  const theme = useTheme()
  const { dayPlans, recurringPlans, serviceReports } = useServiceReport()
  const { annualGoalHours, hasAnnualGoal } = usePublisher()
  const serviceYear = getServiceYearFromDate(moment().month(month).year(year))

  const today = useMemo(() => new Date(), [])

  const loggedMinutes = useMemo(() => {
    const reports = getServiceYearReports(serviceReports, serviceYear)
    return getTotalMinutesForServiceYear(reports, serviceYear)
  }, [serviceReports, serviceYear])

  const result = useMemo(
    () =>
      computeProjectedTotal({
        scope: { kind: 'serviceYear', serviceYear },
        today,
        goalMinutes: annualGoalHours * 60,
        loggedAdjustedMinutes: loggedMinutes,
        dayPlans,
        recurringPlans,
        creditCapMinutes: null,
      }),
    [
      serviceYear,
      today,
      annualGoalHours,
      loggedMinutes,
      dayPlans,
      recurringPlans,
    ]
  )

  if (!hasAnnualGoal) {
    return null
  }

  const projectedHours = result.projectedMinutes / 60
  const percentProjected =
    annualGoalHours > 0 ? projectedHours / annualGoalHours : 0

  return (
    <View style={{ gap: 5, flex: 1 }}>
      <XView style={{ justifyContent: 'space-between' }}>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('year')}
        </Text>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('xs'),
          }}
        >
          {`${_.round(
            projectedHours,
            1
          )} ${i18n.t('of')} ${annualGoalHours} ${i18n.t('hours')}`}
        </Text>
      </XView>
      <SimpleProgressBar
        percentage={percentProjected}
        color={percentProjected < 1 ? theme.colors.warn : theme.colors.accent}
      />
    </View>
  )
}

const MonthAssistantCard = ({
  month,
  year,
}: {
  month: number
  year: number
}) => {
  const { monthlyGoalHours, creditCapMinutes, type: publisher } = usePublisher()
  const { serviceReports, dayPlans, recurringPlans } = useServiceReport()
  const today = useMemo(() => new Date(), [])

  const tense = getPeriodTense({ kind: 'month', month, year }, today)

  const loggedAdjustedMinutes = useMemo(() => {
    const reports = getMonthsReports(serviceReports, month, year)
    return (
      adjustedMinutesForSpecificMonth(reports, month, year, publisher).value ??
      0
    )
  }, [serviceReports, month, year, publisher])

  const projection = useMemo(
    () =>
      computeProjectedTotal({
        scope: { kind: 'month', month, year },
        today,
        goalMinutes: monthlyGoalHours * 60,
        loggedAdjustedMinutes,
        dayPlans,
        recurringPlans,
        creditCapMinutes,
      }),
    [
      month,
      year,
      today,
      monthlyGoalHours,
      loggedAdjustedMinutes,
      dayPlans,
      recurringPlans,
      creditCapMinutes,
    ]
  )

  if (monthlyGoalHours <= 0 || tense === 'past') return null

  return (
    <Card>
      <AssistantSection
        year={year}
        month={month}
        today={today}
        monthlyGoalHours={monthlyGoalHours}
        loggedAdjustedMinutes={loggedAdjustedMinutes}
        projection={projection}
        standalone
      />
    </Card>
  )
}

export default ScheduleScreen
