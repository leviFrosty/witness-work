import { View } from 'react-native'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faPlus } from '@fortawesome/free-solid-svg-icons/faPlus'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import useTheme from '@/contexts/theme'
import moment from 'moment'
import { formatDate } from '@/lib/dates'
import { FlashList } from '@shopify/flash-list'
import { TimeEntry, DayPlan } from '@/types/timeEntry'
import TimeReportRow from '@/features/service-reports/components/TimeReportRow'
import Empty from '@/components/ui/Empty'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import { useMemo } from 'react'
import useServiceReport from '@/stores/serviceReport'
import XView from '@/components/ui/layout/XView'
import { useFormattedMinutes } from '@/lib/minutes'
import {
  getPlansIntersectingDay,
  RecurringPlan,
  getEffectiveMinutesForRecurringPlan,
} from '@/lib/recurrence'
import PlanRow, { getPlanItemStartTime } from '@/components/PlanRow'
import type { PlanListItem } from '@/components/PlanRow'
import Circle from '@/components/ui/Circle'
import { getDateStatusColor } from '@/components/CalendarDay'

interface DayHistoryViewProps {
  date: Date
  serviceReports?: TimeEntry[]
  showHeader?: boolean
  onDayPlanPress?: (plan: DayPlan, date: Date) => void
  onRecurringPlanPress?: (plan: RecurringPlan, date: Date) => void
  onTimeReportPress?: (report: TimeEntry) => void
  onAddTime?: () => void
  onPlanDay?: () => void
}

const EmptyActionButton = (props: { label: string; onPress?: () => void }) => {
  const theme = useTheme()

  if (!props.onPress) return null

  return (
    <Button
      noTransform
      variant='outline'
      onPress={props.onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 9,
        gap: 7,
        alignItems: 'center',
      }}
    >
      <FontAwesomeIcon icon={faPlus} size={12} color={theme.colors.text} />
      <Text
        style={{
          color: theme.colors.text,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {props.label}
      </Text>
    </Button>
  )
}

const DayHistoryView: React.FC<DayHistoryViewProps> = ({
  date,
  serviceReports = [],
  showHeader = false,
  onDayPlanPress,
  onRecurringPlanPress,
  onTimeReportPress,
  onAddTime,
  onPlanDay,
}) => {
  const theme = useTheme()
  const { dayPlans, recurringPlans } = useServiceReport()

  const thisDaysReports = useMemo(
    () => serviceReports?.filter((r) => moment(r.date).isSame(date, 'day')),
    [date, serviceReports]
  )

  const actualMinutes = useMemo(() => {
    if (!thisDaysReports) {
      return 0
    }
    return thisDaysReports.reduce(
      (acc, report) => acc + report.hours * 60 + report.minutes,
      0
    )
  }, [thisDaysReports])

  const dayPlansForToday = useMemo(() => {
    return dayPlans.filter((dp) => moment(dp.date).isSame(date, 'day'))
  }, [dayPlans, date])

  const recurringPlansForToday = useMemo(() => {
    return getPlansIntersectingDay(date, recurringPlans)
  }, [recurringPlans, date])

  const planItemsForToday = useMemo<PlanListItem[]>(() => {
    const items: PlanListItem[] = [
      ...dayPlansForToday.map((plan) => ({
        type: 'day' as const,
        date,
        plan,
      })),
      ...recurringPlansForToday.map((plan) => ({
        type: 'recurring' as const,
        date,
        plan,
      })),
    ]

    return items.sort(
      (a, b) => getPlanItemStartTime(a) - getPlanItemStartTime(b)
    )
  }, [date, dayPlansForToday, recurringPlansForToday])

  const goalMinutes = useMemo(() => {
    const dayPlan = dayPlans.find((dp) => moment(dp.date).isSame(date, 'day'))

    // Get the highest recurring plan for the day, but use effective minutes (with overrides)
    const highestRecurringPlanForDay = recurringPlansForToday
      .map((plan) => ({
        plan,
        effectiveMinutes: getEffectiveMinutesForRecurringPlan(plan, date),
      }))
      .sort((a, b) => b.effectiveMinutes - a.effectiveMinutes)[0]

    if (!dayPlan?.minutes && !highestRecurringPlanForDay?.effectiveMinutes) {
      return undefined
    }

    return dayPlan?.minutes || highestRecurringPlanForDay.effectiveMinutes
  }, [dayPlans, recurringPlansForToday, date])

  const actualDisplay = useFormattedMinutes(actualMinutes)
  const goalDisplay = useFormattedMinutes(goalMinutes ?? 0)

  const hasTimeReports = !!thisDaysReports?.length
  const hasPlans = planItemsForToday.length > 0
  const wentInService = hasTimeReports
  const isToday = moment().isSame(date, 'day')
  const dateInPast = moment(date).isSameOrBefore(moment(), 'day')
  const hitGoal = actualMinutes >= (goalMinutes ?? 0)

  const statusColor = getDateStatusColor(
    theme,
    wentInService,
    isToday,
    dateInPast,
    hitGoal
  )

  return (
    <View style={{ gap: 20 }}>
      {showHeader && (
        <View style={{ marginBottom: 10, gap: 5 }}>
          <XView style={{ justifyContent: 'space-between' }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: theme.fontSize('xl'),
                fontFamily: theme.fonts.bold,
              }}
            >
              {formatDate(date)}
            </Text>

            <XView>
              {goalMinutes ? (
                <>
                  <Circle color={statusColor.bg} />
                  <Text
                    style={{
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('md'),
                      fontFamily: theme.fonts.semiBold,
                    }}
                  >
                    {`${actualDisplay.formatted} ${i18n.t('of')} ${goalDisplay.formatted} ${i18n.t(
                      'plannedHours'
                    )}`}
                  </Text>
                </>
              ) : null}
            </XView>
          </XView>
        </View>
      )}

      <View style={{ gap: 8 }}>
        <XView style={{ justifyContent: 'space-between' }}>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
              textTransform: 'uppercase',
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('timeReports')}
          </Text>
          {hasTimeReports && onAddTime && (
            <IconButton
              noTransform
              icon={faPlus}
              onPress={onAddTime}
              accessibilityLabel={i18n.t('addTime')}
              size={13}
              style={{
                borderColor: theme.colors.border,
                borderWidth: 1,
                borderRadius: 999,
                padding: 7,
              }}
              hitSlop={8}
            />
          )}
        </XView>
        <View style={{ flex: 1, minHeight: 10 }}>
          <FlashList
            scrollEnabled={false}
            data={
              thisDaysReports
                ? thisDaysReports.sort((a, b) =>
                    moment(a.date).unix() < moment(b.date).unix() ? 1 : -1
                  )
                : undefined
            }
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => (
              <TimeReportRow
                report={item}
                onPress={() => onTimeReportPress?.(item)}
              />
            )}
            ListEmptyComponent={
              <Empty
                dashedOutline
                title={i18n.t('noReportsThisDay')}
                action={
                  onAddTime ? (
                    <EmptyActionButton
                      label={i18n.t('addTime')}
                      onPress={onAddTime}
                    />
                  ) : undefined
                }
              />
            }
          />
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <XView style={{ justifyContent: 'space-between' }}>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
              textTransform: 'uppercase',
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('plans')}
          </Text>
          {hasPlans && onPlanDay && (
            <IconButton
              noTransform
              icon={faPlus}
              onPress={onPlanDay}
              accessibilityLabel={i18n.t('planDay')}
              size={13}
              style={{
                borderColor: theme.colors.border,
                borderWidth: 1,
                borderRadius: 999,
                padding: 7,
              }}
              hitSlop={8}
            />
          )}
        </XView>
        <View style={{ flex: 1, minHeight: 10 }}>
          <FlashList
            scrollEnabled={false}
            data={planItemsForToday}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => (
              <PlanRow
                item={item}
                onPress={() => {
                  if (item.type === 'day') {
                    onDayPlanPress?.(item.plan, item.date)
                  } else {
                    onRecurringPlanPress?.(item.plan, item.date)
                  }
                }}
              />
            )}
            ListEmptyComponent={
              <Empty
                dashedOutline
                title={i18n.t('noPlansThisDay')}
                action={
                  onPlanDay ? (
                    <EmptyActionButton
                      label={i18n.t('planDay')}
                      onPress={onPlanDay}
                    />
                  ) : undefined
                }
              />
            }
          />
        </View>
      </View>
    </View>
  )
}

export default DayHistoryView
