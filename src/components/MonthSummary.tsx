import { View } from 'react-native'
import Text from './MyText'
import i18n from '../lib/locales'
import Divider from './Divider'
import MonthServiceReportProgressBar from './MonthServiceReportProgressBar'
import { faArrowUpFromBracket } from '@fortawesome/free-solid-svg-icons'
import IconButton from './IconButton'
import {
  AdjustedMinutes,
  adjustedMinutesForSpecificMonth,
  ldcMinutesForSpecificMonth,
  otherMinutesForSpecificMonth,
  standardMinutesForSpecificMonth,
} from '../lib/serviceReport'
import { useMemo } from 'react'
import useTheme from '../contexts/theme'
import { ExportTimeSheetState } from './ExportTimeSheet'
import { ServiceReport } from '../types/serviceReport'
import TimeCategoryTableRow from './TimeCategoryTableRow'
import { usePreferences } from '../stores/preferences'
import Card from './Card'
import ActionButton from './ActionButton'
import { useNavigation } from '@react-navigation/native'
import _ from 'lodash'
import moment from 'moment'
import { useFormattedMinutes, useCompactFormattedMinutes } from '../lib/minutes'
import { RootStackNavigation } from '../types/rootStack'

interface MonthSummaryProps {
  monthsReports: ServiceReport[] | null
  month: number
  year: number
  setSheet?: React.Dispatch<React.SetStateAction<ExportTimeSheetState>>
  title?: string
  noDetails?: boolean
  highlightAsCurrentMonth?: boolean
}

const MonthSummary = ({
  monthsReports,
  month,
  year,
  setSheet,
  title,
  noDetails,
  highlightAsCurrentMonth,
}: MonthSummaryProps) => {
  const theme = useTheme()
  const {
    publisher,
    publisherHours,
    overrideCreditLimit,
    customCreditLimitHours,
  } = usePreferences()
  const goalHours = publisherHours[publisher]
  const navigation = useNavigation<RootStackNavigation>()

  const adjustedMinutes: AdjustedMinutes = monthsReports
    ? adjustedMinutesForSpecificMonth(monthsReports, month, year, publisher, {
        enabled: overrideCreditLimit,
        customLimitHours: customCreditLimitHours,
      })
    : { value: 0, credit: 0, standard: 0, creditOverage: 0 }

  const minutesWithFormat = useFormattedMinutes(adjustedMinutes.value)

  const currentDay = moment()
  const selectedMonth = moment().month(month).year(year)
  const isCurrentMonth = currentDay.isSame(selectedMonth, 'month')
  const isPastMonth = currentDay.isAfter(selectedMonth, 'month')
  const isFutureMonth = currentDay.isBefore(selectedMonth, 'month')

  const daysInMonth = selectedMonth.daysInMonth()
  const currentDayOfMonth = isCurrentMonth
    ? currentDay.date()
    : isPastMonth
      ? daysInMonth
      : 1
  const daysRemaining = isCurrentMonth
    ? Math.max(0, daysInMonth - currentDay.date())
    : 0

  const hoursCompleted = adjustedMinutes.value / 60
  const hoursRemaining = Math.max(0, goalHours - hoursCompleted)
  const hoursNeededPerDay =
    daysRemaining > 0 ? hoursRemaining / daysRemaining : 0
  const averagePerDay =
    currentDayOfMonth > 0 ? hoursCompleted / currentDayOfMonth : 0
  const isOnTrack =
    goalHours > 0
      ? hoursCompleted / currentDayOfMonth >= goalHours / daysInMonth
      : true
  const hasMetGoal = hoursCompleted >= goalHours && goalHours > 0

  // Format time values using utility functions
  const hoursRemainingFormatted = useFormattedMinutes(hoursRemaining * 60)
  const hoursNeededPerDayRounded = _.round(hoursNeededPerDay, 1)
  const averagePerDayFormatted = useCompactFormattedMinutes(averagePerDay * 60)
  const goalHoursFormatted = useCompactFormattedMinutes(goalHours * 60)

  const ldcMinutes = useMemo(
    () =>
      monthsReports
        ? ldcMinutesForSpecificMonth(monthsReports, month, year)
        : 0,
    [month, monthsReports, year]
  )

  const standardMinutes = useMemo(
    () =>
      monthsReports
        ? standardMinutesForSpecificMonth(monthsReports, month, year)
        : 0,
    [month, monthsReports, year]
  )

  const otherMinutes = useMemo(
    () =>
      monthsReports
        ? otherMinutesForSpecificMonth(monthsReports, month, year)
        : null,
    [month, monthsReports, year]
  )

  const monthInFuture = moment().isBefore(
    moment().month(month).year(year),
    'month'
  )

  if (!monthsReports) {
    return (
      <Card>
        <Text
          style={{
            fontSize: theme.fontSize('xl'),
            fontFamily: theme.fonts.bold,
          }}
        >
          {i18n.t('noTimeReports')}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t('noTimeReports_description')}
        </Text>
        {monthInFuture ? (
          <ActionButton
            onPress={() => navigation.navigate('PlanSchedule', { month, year })}
          >
            <Text
              style={{
                color: theme.colors.textInverse,
                fontFamily: theme.fonts.bold,
              }}
            >
              {i18n.t('createPlan')}
            </Text>
          </ActionButton>
        ) : (
          <ActionButton
            onPress={() =>
              navigation.navigate('Add Time', {
                date: moment().month(month).year(year).toISOString(),
              })
            }
          >
            <Text
              style={{
                textAlign: 'center',
                flex: 1,
                color: theme.colors.textInverse,
                fontFamily: theme.fonts.bold,
              }}
            >
              {i18n.t('addTime')}
            </Text>
          </ActionButton>
        )}
      </Card>
    )
  }

  return (
    <Card
      style={{
        borderColor: theme.colors.accent,
        borderWidth: highlightAsCurrentMonth ? 2 : 0,
        gap: noDetails ? 3 : 15,
        paddingVertical: noDetails ? 10 : 20,
      }}
    >
      <View style={{ gap: noDetails ? 2 : 10 }}>
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            justifyContent: 'space-between',
            marginBottom: 3,
          }}
        >
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('xl'),
            }}
          >
            {title ?? moment().month(month).year(year).format('MMMM YYYY')}
          </Text>
          {setSheet !== undefined && (
            <IconButton
              iconStyle={{ color: theme.colors.accent }}
              onPress={() =>
                setSheet({
                  open: true,
                  month: month,
                  year,
                })
              }
              icon={faArrowUpFromBracket}
            />
          )}
        </View>
        <View style={{ gap: 5 }}>
          <Text
            style={{
              textAlign: 'right',
              color: theme.colors.text,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {`${minutesWithFormat.formatted} ${i18n.t(
              'of'
            )} ${goalHours} ${i18n.t('hoursToGoal')}`}
          </Text>
          {!!adjustedMinutes.creditOverage && (
            <Text
              style={{
                fontSize: theme.fontSize('xs'),
                color: theme.colors.warn,
                textAlign: 'right',
              }}
            >
              {i18n.t('youHaveCreditOverage', {
                count: _.round(adjustedMinutes.creditOverage / 60, 1),
              })}
            </Text>
          )}

          <MonthServiceReportProgressBar
            month={month}
            year={year}
            minimal={noDetails}
          />

          {/* Goal Progress Stats */}
          {goalHours > 0 && !noDetails && (
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
                ) : isCurrentMonth && daysRemaining > 0 ? (
                  <View style={{ gap: 2 }}>
                    <Text
                      style={{
                        fontSize: theme.fontSize('sm'),
                        color: theme.colors.text,
                        fontFamily: theme.fonts.semiBold,
                      }}
                    >
                      {hoursRemainingFormatted.formatted} {i18n.t('remaining')}
                    </Text>
                    <Text
                      style={{
                        fontSize: theme.fontSize('xs'),
                        color: isOnTrack
                          ? theme.colors.textAlt
                          : theme.colors.warn,
                      }}
                    >
                      {hoursNeededPerDayRounded}h/{i18n.t('days_lowercase')}{' '}
                      {i18n.t('needed')}
                    </Text>
                  </View>
                ) : isPastMonth ? (
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
                ) : isFutureMonth ? (
                  <Text
                    style={{
                      fontSize: theme.fontSize('sm'),
                      color: theme.colors.textAlt,
                      fontFamily: theme.fonts.medium,
                    }}
                  >
                    {goalHoursFormatted} {i18n.t('goal')}
                  </Text>
                ) : null}
              </View>

              {/* Right side - Secondary stats */}
              <View style={{ alignItems: 'flex-end' }}>
                {isCurrentMonth && (
                  <View style={{ gap: 2, alignItems: 'flex-end' }}>
                    <Text
                      style={{
                        fontSize: theme.fontSize('xs'),
                        color: theme.colors.textAlt,
                      }}
                    >
                      {averagePerDayFormatted}/{i18n.t('days_lowercase')}{' '}
                      {i18n.t('average')}
                    </Text>
                    <Text
                      style={{
                        fontSize: theme.fontSize('xs'),
                        color: theme.colors.textAlt,
                      }}
                    >
                      {daysRemaining} {i18n.t('daysLeft')}
                    </Text>
                  </View>
                )}
                {isPastMonth && goalHours > 0 && (
                  <Text
                    style={{
                      fontSize: theme.fontSize('xs'),
                      color: theme.colors.textAlt,
                    }}
                  >
                    {Math.round((hoursCompleted / goalHours) * 100)}%{' '}
                    {i18n.t('of')} {i18n.t('goal')}
                  </Text>
                )}
                {isFutureMonth && (
                  <Text
                    style={{
                      fontSize: theme.fontSize('xs'),
                      color: theme.colors.textAlt,
                    }}
                  >
                    {daysInMonth} {i18n.t('days_lowercase')} {i18n.t('total')}
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>
      </View>
      {!noDetails && (
        <View style={{ gap: 5 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('categories')}
            </Text>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('hours')}
            </Text>
          </View>
          <Divider />
          <View style={{ gap: 10 }}>
            <TimeCategoryTableRow
              title={i18n.t('standard')}
              number={standardMinutes}
            />
            <TimeCategoryTableRow
              title={i18n.t('ldc')}
              number={ldcMinutes}
              credit
            />
            {otherMinutes &&
              otherMinutes.length > 0 &&
              otherMinutes.map((report, index) => (
                <TimeCategoryTableRow
                  key={index}
                  title={report.tag}
                  number={report.minutes}
                  credit={report.credit}
                />
              ))}
          </View>
        </View>
      )}
      {monthInFuture ? (
        <ActionButton
          onPress={() => navigation.navigate('PlanSchedule', { month, year })}
        >
          <Text
            style={{
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.bold,
            }}
          >
            {i18n.t('createPlan')}
          </Text>
        </ActionButton>
      ) : !noDetails ? (
        <ActionButton
          onPress={() =>
            navigation.navigate('Add Time', {
              date: moment().month(month).year(year).toISOString(),
            })
          }
        >
          <Text
            style={{
              textAlign: 'center',
              flex: 1,
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.bold,
            }}
          >
            {i18n.t('addTime')}
          </Text>
        </ActionButton>
      ) : null}
    </Card>
  )
}
export default MonthSummary
