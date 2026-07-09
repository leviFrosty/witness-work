import {
  ArrowLeft as ArrowLeftIcon,
  ArrowRight as ArrowRightIcon,
  CalendarClock as CalendarClockIcon,
  CircleCheck as CircleCheckIcon,
  TrendingDown as TrendingDownIcon,
  TrendingUp as TrendingUpIcon,
} from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import {
  BottomTabScreenProps,
  useBottomTabBarHeight,
} from '@react-navigation/bottom-tabs'
import { useNavigation as useRootNavigation } from '@react-navigation/native'
import moment from 'moment'

import useServiceReport from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import useTheme from '@/contexts/theme'
import { getMonthsReports } from '@/lib/serviceReport'
import {
  getPlansIntersectingDay,
  getEffectiveStartTimeInMinutesForRecurringPlan,
  RecurringPlan,
} from '@/lib/recurrence'
import { getPeriodTense } from '@/lib/projectedTotalCopy'
import usePublisher from '@/hooks/usePublisher'
import useProjectedTotal from '@/hooks/useProjectedTotal'
import { useFormattedMinutes } from '@/lib/minutes'
import {
  getScheduleStatusForMonth,
  type ScheduleStatusState,
} from '@/lib/scheduleStatus'
import { getStartTimeInMinutes } from '@/lib/normalizeDate'
import { RootStackNavigation } from '@/types/rootStack'
import { HomeTabStackParamList } from '@/types/homeStack'
import { DayPlan, TimeEntry } from '@/types/timeEntry'

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
import ActionButton from '@/components/ui/ActionButton'
import IconButton from '@/components/ui/IconButton'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import SimpleProgressBar from '@/components/ui/SimpleProgressBar'
import PlanRow from '@/components/PlanRow'
import type { PlanListItem } from '@/components/PlanRow'
import i18n, { type TranslationKey } from '@/lib/locales'

type Props = BottomTabScreenProps<HomeTabStackParamList, 'Schedule'>

const ScheduleScreen = ({ route }: Props) => {
  const theme = useTheme()
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
        moment(dp.date).isSame(dayDate, 'day')
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
      <SwipeMonthNavigator
        onSwipeForward={() => handleArrowNavigate('forward')}
        onSwipeBack={() => handleArrowNavigate('back')}
        style={{ flex: 1 }}
      >
        <KeyboardAwareScrollView
          contentContainerStyle={{
            paddingTop: insets.top + 15,
            paddingHorizontal: 15,
            paddingBottom: tabBarHeight + 40,
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
          <ScheduleStatusCard month={month} year={year} />
          <Card>
            <CalendarHeader
              viewMode={calendarViewMode}
              onChangeViewMode={setCalendarViewMode}
            />
            <View>
              <CalendarKey />
              <MonthTimeReportsCalendar
                month={month}
                year={year}
                monthsReports={thisMonthsReports}
                setSheet={setSelectedDateSheet}
                viewMode={calendarViewMode}
              />
            </View>
            <ActionButton
              onPress={() => rootNavigation.navigate('PlanDay', {})}
            >
              {i18n.t('createPlan')}
            </ActionButton>
          </Card>
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
                visiblePlans.map((item) => (
                  <PlanRow
                    key={`${item.type}-${item.plan.id}-${item.date.toISOString()}`}
                    item={item}
                    dateDisplay='monthList'
                    contextMonth={month}
                    contextYear={year}
                    onPress={() => {
                      if (item.type === 'day') {
                        handleEditDayPlan(item.plan, item.date)
                      } else {
                        handleEditRecurringPlanInstance(item.plan, item.date)
                      }
                    }}
                  />
                ))
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

const STATUS_TITLE_KEYS: Record<ScheduleStatusState, TranslationKey> = {
  ahead: 'scheduleStatus.ahead',
  behind: 'scheduleStatus.behind',
  onTrack: 'scheduleStatus.onTrack',
  noPlan: 'scheduleStatus.noPlan',
  notStarted: 'scheduleStatus.upcoming',
}

const ScheduleStatusCard = (props: { month: number; year: number }) => {
  const { month, year } = props
  const theme = useTheme()
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const dayPlans = useServiceReport((s) => s.dayPlans)
  const recurringPlans = useServiceReport((s) => s.recurringPlans)
  const { role, overrideCreditLimit, customCreditLimitHours } = usePreferences()

  const status = getScheduleStatusForMonth({
    month,
    year,
    serviceReports,
    dayPlans,
    recurringPlans,
    publisher: role,
    creditLimit: {
      enabled: overrideCreditLimit,
      customLimitHours: customCreditLimitHours,
    },
  })

  const actualDisplay = useFormattedMinutes(status.actualMinutes)
  const plannedDisplay = useFormattedMinutes(status.plannedMinutes)
  const differenceDisplay = useFormattedMinutes(
    Math.abs(status.differenceMinutes)
  )

  const statusColor = (() => {
    switch (status.state) {
      case 'ahead':
      case 'onTrack':
        return theme.colors.accent
      case 'behind':
        return theme.colors.warn
      default:
        return theme.colors.textAlt
    }
  })()
  const iconBackground = (() => {
    switch (status.state) {
      case 'ahead':
      case 'onTrack':
        return theme.colors.accentTranslucent
      case 'behind':
        return theme.colors.warnTranslucent
      default:
        return theme.colors.backgroundLighter
    }
  })()
  const StatusIcon = (() => {
    switch (status.state) {
      case 'ahead':
        return TrendingUpIcon
      case 'behind':
        return TrendingDownIcon
      case 'onTrack':
        return CircleCheckIcon
      default:
        return CalendarClockIcon
    }
  })()
  const statusMeta = (() => {
    switch (status.state) {
      case 'ahead':
        return `+${differenceDisplay.formatted}`
      case 'behind':
        return `-${differenceDisplay.formatted}`
      case 'onTrack':
        return i18n.t('scheduleStatus.matched')
      case 'noPlan':
        return i18n.t('scheduleStatus.noPlannedTime')
      case 'notStarted':
        return i18n.t('scheduleStatus.notStarted')
    }
  })()
  const progress =
    status.plannedMinutes > 0
      ? Math.max(0, status.actualMinutes / status.plannedMinutes)
      : status.actualMinutes > 0
        ? 1
        : 0

  return (
    <Card style={{ gap: 12 }}>
      <XView style={{ alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: iconBackground,
          }}
        >
          <LucideIcon icon={StatusIcon} color={statusColor} size={22} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('xl'),
              color: statusColor,
            }}
          >
            {i18n.t(STATUS_TITLE_KEYS[status.state])}
          </Text>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {statusMeta}
          </Text>
        </View>
      </XView>

      <SimpleProgressBar
        percentage={progress}
        color={statusColor}
        height={10}
        animated={false}
      />

      <XView style={{ justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('xs'),
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {i18n.t('actual')}
          </Text>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {actualDisplay.formatted}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 2, alignItems: 'flex-end' }}>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('xs'),
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {i18n.t('planned')}
          </Text>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {plannedDisplay.formatted}
          </Text>
        </View>
      </XView>
    </Card>
  )
}

const MonthAssistantCard = ({
  month,
  year,
}: {
  month: number
  year: number
}) => {
  const { monthlyGoalHours } = usePublisher()

  const { projection, today } = useProjectedTotal(
    { kind: 'month', month, year },
    monthlyGoalHours * 60
  )

  const tense = getPeriodTense({ kind: 'month', month, year }, today)

  if (monthlyGoalHours <= 0 || tense === 'past') return null

  return (
    <AssistantSection
      year={year}
      month={month}
      today={today}
      monthlyGoalHours={monthlyGoalHours}
      projection={projection}
      standalone
    />
  )
}

export default ScheduleScreen
