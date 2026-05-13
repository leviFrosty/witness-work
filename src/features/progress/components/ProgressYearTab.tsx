import { useMemo } from 'react'
import { Pressable, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import moment from 'moment'
import _ from 'lodash'

import useTheme from '../../../contexts/theme'
import usePublisher from '../../../hooks/usePublisher'
import useServiceReport from '../../../stores/serviceReport'
import { usePreferences } from '../../../stores/preferences'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
} from '../../../lib/serviceReport'
import i18n from '../../../lib/locales'

import YearMilestoneCard from '../../../components/YearMilestoneCard'
import Text from '../../../components/MyText'
import XView from '../../../components/layout/XView'
import Badge from '../../../components/Badge'
import { useCardStyle } from '../../../components/Card'

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
  onPress,
}: {
  month: number
  year: number
  isCurrent: boolean
  onPress: () => void
}) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const {
    publisher,
    publisherHours,
    overrideCreditLimit,
    customCreditLimitHours,
  } = usePreferences()
  const { serviceReports } = useServiceReport()

  const goalHours = publisherHours[publisher]

  const monthsReports = useMemo(
    () => getMonthsReports(serviceReports, month, year),
    [serviceReports, month, year]
  )

  const hoursCompleted = useMemo(() => {
    const adjusted = adjustedMinutesForSpecificMonth(
      monthsReports,
      month,
      year,
      publisher,
      { enabled: overrideCreditLimit, customLimitHours: customCreditLimitHours }
    )
    return adjusted.value / 60
  }, [
    monthsReports,
    month,
    year,
    publisher,
    overrideCreditLimit,
    customCreditLimitHours,
  ])

  const hoursRounded = _.round(hoursCompleted, 1)
  const delta = _.round(hoursCompleted - goalHours, 1)

  // Only show delta when there's a meaningful goal and at least some activity,
  // or when the month is in the past (so an all-zero past month reads as a
  // miss). Future months with no activity should stay visually quiet.
  const hasActivity = hoursCompleted > 0
  const showDelta = goalHours > 0 && hasActivity

  const deltaLabel = delta > 0 ? `+${delta}` : `${delta}`
  const deltaColor =
    !showDelta || delta === 0
      ? theme.colors.textAlt
      : delta > 0
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
            {hoursRounded}h
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

      <View style={{ gap: 8, paddingTop: 10 }}>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            paddingHorizontal: 5,
          }}
        >
          {i18n.t('allMonths')}
        </Text>
        <View style={{ gap: 6 }}>
          {months.map(({ month, year: calendarYear }) => {
            const isCurrent =
              month === currentMonth && calendarYear === currentYear
            return (
              <MonthRow
                key={`${calendarYear}-${month}`}
                month={month}
                year={calendarYear}
                isCurrent={isCurrent}
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
