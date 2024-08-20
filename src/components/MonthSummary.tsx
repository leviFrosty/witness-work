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
import { RootStackNavigation } from '../stacks/RootStack'
import _ from 'lodash'
import moment from 'moment'

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
  const { publisher, publisherHours } = usePreferences()
  const goalHours = publisherHours[publisher]
  const navigation = useNavigation<RootStackNavigation>()

  const adjustedMinutes: AdjustedMinutes = monthsReports
    ? adjustedMinutesForSpecificMonth(monthsReports, month, year)
    : { value: 0, credit: 0, standard: 0, creditOverage: 0 }

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
            {`${_.round(adjustedMinutes.value / 60, 1)} ${i18n.t(
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
              number={_.round(standardMinutes / 60, 1)}
            />
            <TimeCategoryTableRow
              title={i18n.t('ldc')}
              number={_.round(ldcMinutes / 60, 1)}
              credit
            />
            {otherMinutes &&
              otherMinutes.length > 0 &&
              otherMinutes.map((report, index) => (
                <TimeCategoryTableRow
                  key={index}
                  title={report.tag}
                  number={_.round(report.minutes / 60, 1)}
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
