import { useMemo } from 'react'
import { Pressable, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import moment from 'moment'

import useTheme from '@/contexts/theme'
import usePublisher from '@/hooks/usePublisher'
import useServiceReport from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import {
  adjustedMinutesForSpecificMonth,
  calculateMonthlyPlannedMinutesOptimized,
  getMonthsReports,
} from '@/lib/serviceReport'
import { useFormattedMinutes } from '@/lib/minutes'
import i18n from '@/lib/locales'

import YearMilestoneCard from '@/components/YearMilestoneCard'
import ProjectedTotalCard from '@/components/ProjectedTotalCard'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import Badge from '@/components/ui/Badge'
import { useCardStyle } from '@/components/ui/Card'

interface ProgressYearTabProps {
  /** End year of the service year (Sep 1 of `year - 1` → Aug 31 of `year`). */
  year: number
  /** Invoked when the user taps "adjust milestones" on the hero card. */
  onAdjustMilestones: () => void
  /** Invoked when the user taps a month row — parent switches to Month tab. */
  onMonthPress: (month: number, year: number) => void
}

/**
 * One row per month in the service year. Compact single-liner matching the
 * wireframe: `{MMM} {hours}h {+delta}`. Tap → Month tab for that month.
 */
const MonthRow = ({
  month,
  year,
  isCurrent,
  isFuture,
  onPress,
}: {
  month: number
  year: number
  isCurrent: boolean
  isFuture: boolean
  onPress: () => void
}) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const { role, publisherHours, overrideCreditLimit, customCreditLimitHours } =
    usePreferences()
  const { serviceReports, dayPlans, recurringPlans } = useServiceReport()

  const goalHours = publisherHours[role]

  const monthsReports = useMemo(
    () => getMonthsReports(serviceReports, month, year),
    [serviceReports, month, year]
  )

  const completedMinutes = useMemo(() => {
    const adjusted = adjustedMinutesForSpecificMonth(
      monthsReports,
      month,
      year,
      role,
      { enabled: overrideCreditLimit, customLimitHours: customCreditLimitHours }
    )
    return adjusted.value
  }, [
    monthsReports,
    month,
    year,
    role,
    overrideCreditLimit,
    customCreditLimitHours,
  ])

  const plannedMinutes = useMemo(() => {
    if (!isFuture) return 0
    return calculateMonthlyPlannedMinutesOptimized(
      month,
      year,
      dayPlans,
      recurringPlans
    )
  }, [isFuture, month, year, dayPlans, recurringPlans])

  const completedDisplay = useFormattedMinutes(completedMinutes)
  const plannedDisplay = useFormattedMinutes(plannedMinutes)
  const goalMinutes = Math.round(goalHours * 60)
  const deltaMinutes = completedMinutes - goalMinutes
  const deltaDisplay = useFormattedMinutes(Math.abs(deltaMinutes))

  // Only show delta when there's a meaningful goal and at least some activity,
  // or when the month is in the past (so an all-zero past month reads as a
  // miss). Future months with no activity should stay visually quiet.
  const hasActivity = completedMinutes > 0
  const showDelta = goalHours > 0 && hasActivity
  // Future months haven't happened yet — surface planned hours instead of a
  // bare "0h", styled with textAlt so the eye still reads it as upcoming.
  const showFuturePlanned = isFuture && !hasActivity && plannedMinutes > 0

  const deltaLabel =
    deltaMinutes === 0
      ? deltaDisplay.formatted
      : `${deltaMinutes > 0 ? '+' : '-'}${deltaDisplay.formatted}`
  const deltaColor =
    !showDelta || deltaMinutes === 0
      ? theme.colors.textAlt
      : deltaMinutes > 0
        ? theme.colors.accent
        : theme.colors.warn

  const monthYearLabel = moment().month(month).year(year).format('MMMM, YYYY')

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole='button'
      style={({ pressed }) => ({
        ...cardStyle,
        opacity: pressed ? 0.6 : 1,
        paddingHorizontal: 15,
        paddingVertical: 12,
      })}
    >
      <XView style={{ justifyContent: 'space-between', gap: 12 }}>
        <XView style={{ gap: 8, flexShrink: 1 }}>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('md'),
              color: theme.colors.text,
              minWidth: 44,
            }}
          >
            {monthYearLabel}
          </Text>
          {isCurrent ? <Badge size='xs'>{i18n.t('today')}</Badge> : null}
        </XView>
        <XView style={{ gap: 12 }}>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: hasActivity ? theme.colors.text : theme.colors.textAlt,
              letterSpacing: -0.3,
            }}
          >
            {showFuturePlanned
              ? plannedDisplay.formatted
              : completedDisplay.formatted}
          </Text>
          {showDelta ? (
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                color: deltaColor,
                letterSpacing: -0.3,
                minWidth: 48,
                textAlign: 'right',
              }}
            >
              {deltaLabel}
            </Text>
          ) : (
            <View style={{ minWidth: 48 }} />
          )}
        </XView>
      </XView>
    </Pressable>
  )
}

/**
 * Service-year tab body. Renders the milestone hero card at the top and then an
 * "ALL MONTHS" list — one compact row per month across the service year.
 * Service years run Sep → Aug (12 months), so month order here is `[8, 9, 10,
 * 11, 0, 1, 2, 3, 4, 5, 6, 7]`.
 */
const ProgressYearTab = ({
  year,
  onAdjustMilestones,
  onMonthPress,
}: ProgressYearTabProps) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const now = moment()
  const currentMonth = now.month()
  const currentYear = now.year()

  // Pairs of (monthIndex, calendarYear) for the service year span.
  const months = useMemo(() => {
    const list: { month: number; year: number }[] = []
    // Aug(7) → Jan(0) of year
    for (let m = 7; m >= 0; m--) {
      list.push({ month: m, year })
    }
    //  Dec(11) → Sep(8) of year - 1
    for (let m = 11; m >= 8; m--) {
      list.push({ month: m, year: year - 1 })
    }
    return list
  }, [year])

  const { hasAnnualGoal } = usePublisher()

  const { role, publisherHours } = usePreferences()
  const monthlyGoalHours = publisherHours[role]
  const showDeltaColumn = monthlyGoalHours > 0

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={{
        paddingHorizontal: 15,
        paddingBottom: insets.bottom + 100,
        gap: 24,
      }}
    >
      {hasAnnualGoal ? (
        <YearMilestoneCard
          year={year}
          onAdjustMilestones={onAdjustMilestones}
        />
      ) : null}

      <ProjectedTotalCard
        scope={{ kind: 'serviceYear', serviceYear: year - 1 }}
      />

      <View style={{ gap: 8, paddingTop: 10 }}>
        <View style={{ gap: 6 }}>
          <XView
            style={{
              justifyContent: 'space-between',
              gap: 12,
              paddingHorizontal: 15,
              paddingBottom: 2,
            }}
          >
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('xs'),
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
              numberOfLines={1}
            >
              {i18n.t('month')}
            </Text>
            <XView style={{ gap: 12 }}>
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('xs'),
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  textAlign: 'right',
                }}
                numberOfLines={1}
              >
                {i18n.t('hours')}
              </Text>
              {showDeltaColumn ? (
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('xs'),
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    minWidth: 48,
                    textAlign: 'right',
                  }}
                  numberOfLines={1}
                >
                  {i18n.t('vsGoal')}
                </Text>
              ) : (
                <View style={{ minWidth: 48 }} />
              )}
            </XView>
          </XView>
          {months.map(({ month, year: calendarYear }) => {
            const isCurrent =
              month === currentMonth && calendarYear === currentYear
            const isFuture =
              calendarYear > currentYear ||
              (calendarYear === currentYear && month > currentMonth)
            return (
              <MonthRow
                key={`${calendarYear}-${month}`}
                month={month}
                year={calendarYear}
                isCurrent={isCurrent}
                isFuture={isFuture}
                onPress={() => onMonthPress(month, calendarYear)}
              />
            )
          })}
        </View>
      </View>
    </KeyboardAwareScrollView>
  )
}

export default ProgressYearTab
