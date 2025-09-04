import { useMemo } from 'react'
import useServiceReport from '../stores/serviceReport'
import Card from './Card'
import Text from './MyText'
import usePublisher from '../hooks/usePublisher'
import {
  getServiceYearReports,
  getTotalMinutesForServiceYear,
  serviceReportHoursPerMonthToGoal,
} from '../lib/serviceReport'
import SimpleProgressBar from './SimpleProgressBar'
import { View } from 'react-native'
import i18n from '../lib/locales'
import useTheme from '../contexts/theme'
import Badge from './Badge'
import IconButton from './IconButton'
import {
  faCaretDown,
  faCaretUp,
  faMinus,
} from '@fortawesome/free-solid-svg-icons'
import _ from 'lodash'
import { useFormattedMinutes, useCompactFormattedMinutes } from '../lib/minutes'
import moment from 'moment'

/** Renders all service reports for the given year as a summary. */
interface AnnualServiceReportSummaryProps {
  /**
   * A service year starts on September 1st.
   *
   * It runs from September 1st of the current year to August 31st of the next
   * year.
   *
   * @example
   *   // 2020-2021 service year
   *   serviceYear: 2020
   */
  serviceYear: number
  year: number
  month: number
  hidePerMonthToGoal?: boolean
}

const AnnualServiceReportSummary = ({
  serviceYear,
  year,
  month,
  hidePerMonthToGoal,
}: AnnualServiceReportSummaryProps) => {
  const theme = useTheme()
  const { annualGoalHours, goalHours } = usePublisher()
  const { serviceReports } = useServiceReport()

  const totalMinutesForServiceYear = useMemo(() => {
    const serviceYearsReports = getServiceYearReports(serviceReports, year - 1)
    const total = getTotalMinutesForServiceYear(
      serviceYearsReports,
      serviceYear
    )

    return total
  }, [serviceReports, serviceYear, year])

  const totalMinutesForServiceYearWithFormat = useFormattedMinutes(
    totalMinutesForServiceYear
  )

  const percentage = useMemo(() => {
    return _.round(totalMinutesForServiceYear / 60 / annualGoalHours, 6)
  }, [totalMinutesForServiceYear, annualGoalHours])

  const hoursPerMonthToGoal = useMemo(() => {
    if (hidePerMonthToGoal) {
      return
    }

    const hoursPerMonth = serviceReportHoursPerMonthToGoal({
      currentDate: {
        month,
        year,
      },
      goalHours,
      serviceReports,
      serviceYear,
    })

    return hoursPerMonth
  }, [goalHours, hidePerMonthToGoal, month, serviceReports, serviceYear, year])

  const isFasterThanMonthlyGoalHours =
    hoursPerMonthToGoal === goalHours || !hoursPerMonthToGoal
      ? undefined
      : hoursPerMonthToGoal < goalHours
        ? true
        : false

  // Calculate additional stats similar to MonthSummary
  const currentDate = moment()
  const serviceYearStart = moment().month(8).year(serviceYear) // September 1st
  const serviceYearEnd = moment()
    .month(7)
    .year(serviceYear + 1)
    .endOf('month') // August 31st

  const isCurrentServiceYear = currentDate.isBetween(
    serviceYearStart,
    serviceYearEnd,
    'day',
    '[]'
  )
  const isPastServiceYear = currentDate.isAfter(serviceYearEnd, 'day')
  const isFutureServiceYear = currentDate.isBefore(serviceYearStart, 'day')

  const daysInServiceYear = serviceYearEnd.diff(serviceYearStart, 'days') + 1
  const daysRemaining = isCurrentServiceYear
    ? Math.max(0, serviceYearEnd.diff(currentDate, 'days'))
    : 0

  const hoursCompleted = totalMinutesForServiceYear / 60
  const hoursRemaining = Math.max(0, annualGoalHours - hoursCompleted)
  const hasMetGoal = hoursCompleted >= annualGoalHours && annualGoalHours > 0

  // Format time values using utility functions
  const hoursRemainingFormatted = useFormattedMinutes(hoursRemaining * 60)
  const annualGoalHoursFormatted = useCompactFormattedMinutes(
    annualGoalHours * 60
  )

  return (
    <Card style={{ flexGrow: 1 }}>
      <View
        style={{
          flexDirection: 'row',
          gap: 5,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {serviceYear}-{serviceYear + 1}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {`${totalMinutesForServiceYearWithFormat.formatted} ${i18n.t(
              'of'
            )} ${annualGoalHours} ${i18n.t('hours')}`}
          </Text>
        </View>
      </View>
      <SimpleProgressBar
        percentage={percentage}
        height={10}
        color={percentage >= 1 ? theme.colors.accent : theme.colors.textAlt}
      />

      {/* Goal Progress Stats */}
      {annualGoalHours > 0 && (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 8,
            backgroundColor: theme.colors.background,
            borderRadius: theme.numbers.borderRadiusSm,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          {/* Left side - Primary stats */}
          <View style={{ flex: 1 }}>
            {hasMetGoal ? (
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  color: theme.colors.accent,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                🎯 {i18n.t('goalAchieved')}
              </Text>
            ) : isCurrentServiceYear && daysRemaining > 0 ? (
              <Text
                style={{
                  fontSize: theme.fontSize('md'),
                  color: theme.colors.text,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {hoursRemainingFormatted.formatted} {i18n.t('remaining')}
              </Text>
            ) : isPastServiceYear ? (
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  color: hasMetGoal
                    ? theme.colors.accent
                    : theme.colors.textAlt,
                  fontFamily: theme.fonts.medium,
                }}
              >
                {hasMetGoal
                  ? `✅ ${i18n.t('completed')}`
                  : `${hoursRemainingFormatted.formatted} ${i18n.t('short')}`}
              </Text>
            ) : isFutureServiceYear ? (
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  color: theme.colors.textAlt,
                  fontFamily: theme.fonts.medium,
                }}
              >
                {annualGoalHoursFormatted} {i18n.t('goal')}
              </Text>
            ) : null}
          </View>

          {/* Right side - Secondary stats */}
          <View style={{ alignItems: 'flex-end' }}>
            {isCurrentServiceYear && (
              <Text
                style={{
                  fontSize: theme.fontSize('xs'),
                  color: theme.colors.textAlt,
                }}
              >
                {daysRemaining} {i18n.t('daysLeft')}
              </Text>
            )}
            {isPastServiceYear && annualGoalHours > 0 && (
              <Text
                style={{
                  fontSize: theme.fontSize('xs'),
                  color: theme.colors.textAlt,
                }}
              >
                {Math.round((hoursCompleted / annualGoalHours) * 100)}%{' '}
                {i18n.t('of')} {i18n.t('goal')}
              </Text>
            )}
            {isFutureServiceYear && (
              <Text
                style={{
                  fontSize: theme.fontSize('xs'),
                  color: theme.colors.textAlt,
                }}
              >
                {daysInServiceYear} {i18n.t('days_lowercase')} {i18n.t('total')}
              </Text>
            )}
          </View>
        </View>
      )}
      {!hidePerMonthToGoal && (
        <View style={{ flexDirection: 'row' }}>
          <Badge
            color={
              isFasterThanMonthlyGoalHours === undefined
                ? theme.colors.backgroundLighter
                : isFasterThanMonthlyGoalHours
                  ? theme.colors.accent
                  : theme.colors.error
            }
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
            >
              <IconButton
                color={
                  isFasterThanMonthlyGoalHours === undefined
                    ? theme.colors.text
                    : theme.colors.textInverse
                }
                icon={
                  isFasterThanMonthlyGoalHours === undefined
                    ? faMinus
                    : isFasterThanMonthlyGoalHours
                      ? faCaretUp
                      : faCaretDown
                }
                size={12}
              />
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  color:
                    isFasterThanMonthlyGoalHours === undefined
                      ? theme.colors.text
                      : theme.colors.textInverse,
                }}
              >
                {hoursPerMonthToGoal} {i18n.t('hoursPerMonthToGoal')}
              </Text>
            </View>
          </Badge>
        </View>
      )}
    </Card>
  )
}

export default AnnualServiceReportSummary
