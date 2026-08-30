import {
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  Plus as PlusIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import useTheme from '@/contexts/theme'
import moment from 'moment'
import { isStoredDateOnLocalDay } from '@/lib/normalizeDate'
import { formatDate } from '@/lib/dates'
import { FlashList } from '@shopify/flash-list'
import { TimeEntry, DayPlan } from '@/types/timeEntry'
import TimeReportRow from '@/features/service-reports/components/TimeReportRow'
import Empty from '@/components/ui/Empty'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import { useMemo, useState } from 'react'
import useServiceReport from '@/stores/serviceReport'
import XView from '@/components/ui/layout/XView'
import { useFormattedMinutes } from '@/lib/minutes'
import {
  PlannedDayContribution,
  RecurringPlan,
  resolvePlannedDay,
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

const contributionToPlanListItem = (
  contribution: PlannedDayContribution,
  date: Date
): PlanListItem => {
  if (contribution.source === 'day') {
    return { type: 'day', date, plan: contribution.plan }
  }

  return { type: 'recurring', date, plan: contribution.plan }
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
      <LucideIcon icon={PlusIcon} size={12} color={theme.colors.text} />
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
  const [notCountedExpanded, setNotCountedExpanded] = useState(false)

  const thisDaysReports = useMemo(
    () => serviceReports?.filter((r) => isStoredDateOnLocalDay(r.date, date)),
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
    return dayPlans.filter((dp) => isStoredDateOnLocalDay(dp.date, date))
  }, [dayPlans, date])

  const planResolution = resolvePlannedDay(
    date,
    dayPlansForToday,
    recurringPlans
  )
  const countedPlanItems = planResolution.counted
    .map((contribution) => contributionToPlanListItem(contribution, date))
    .sort((a, b) => getPlanItemStartTime(a) - getPlanItemStartTime(b))
  const notCountedPlanItems = planResolution.notCounted
    .map((contribution) => ({
      item: contributionToPlanListItem(contribution, date),
      reason: contribution.reason,
    }))
    .sort((a, b) => getPlanItemStartTime(a.item) - getPlanItemStartTime(b.item))

  const goalMinutes = planResolution.counted.length
    ? planResolution.counted.reduce(
        (total, contribution) => total + contribution.minutes,
        0
      )
    : undefined

  const actualDisplay = useFormattedMinutes(actualMinutes)
  const goalDisplay = useFormattedMinutes(goalMinutes ?? 0)

  const hasTimeReports = !!thisDaysReports?.length
  const hasPlans = countedPlanItems.length > 0 || notCountedPlanItems.length > 0
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
              icon={PlusIcon}
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
              icon={PlusIcon}
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
            data={countedPlanItems}
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

          {notCountedPlanItems.length > 0 && (
            <View style={{ gap: 10, marginTop: 10 }}>
              <Button
                noTransform
                variant='outline'
                onPress={() => setNotCountedExpanded((expanded) => !expanded)}
                accessibilityRole='button'
                accessibilityState={{ expanded: notCountedExpanded }}
                accessibilityLabel={i18n.t('notCountedToday', {
                  count: notCountedPlanItems.length,
                })}
                style={{
                  justifyContent: 'space-between',
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: theme.numbers.borderRadiusLg,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontFamily: theme.fonts.semiBold,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {i18n.t('notCountedToday', {
                    count: notCountedPlanItems.length,
                  })}
                </Text>
                <LucideIcon
                  icon={notCountedExpanded ? ChevronUpIcon : ChevronDownIcon}
                  size={16}
                  color={theme.colors.textAlt}
                />
              </Button>

              {notCountedExpanded && (
                <View style={{ gap: 10 }}>
                  {notCountedPlanItems.some(
                    ({ reason }) => reason === 'replacedByDayPlans'
                  ) && (
                    <Text
                      style={{
                        color: theme.colors.textAlt,
                        fontSize: theme.fontSize('sm'),
                        lineHeight: theme.fontSize('sm') * 1.4,
                      }}
                    >
                      {i18n.t('dayPlansReplaceRecurringPlans_description')}
                    </Text>
                  )}
                  {notCountedPlanItems.some(
                    ({ reason }) => reason === 'lowerRecurringPriority'
                  ) && (
                    <Text
                      style={{
                        color: theme.colors.textAlt,
                        fontSize: theme.fontSize('sm'),
                        lineHeight: theme.fontSize('sm') * 1.4,
                      }}
                    >
                      {i18n.t('highestRecurringPlanCounts_description')}
                    </Text>
                  )}

                  {notCountedPlanItems.map(({ item }) => (
                    <PlanRow
                      key={`${item.type}-${item.plan.id}`}
                      item={item}
                      countingStatus='notCounted'
                      onPress={() => {
                        if (item.type === 'day') {
                          onDayPlanPress?.(item.plan, item.date)
                        } else {
                          onRecurringPlanPress?.(item.plan, item.date)
                        }
                      }}
                    />
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  )
}

export default DayHistoryView
