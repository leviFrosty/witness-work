import { View } from 'react-native'
import Button from './Button'
import Text from './MyText'
import i18n from '../lib/locales'
import Divider from './Divider'
import MonthServiceReportProgressBar from './MonthServiceReportProgressBar'
import { faArrowUpFromBracket } from '@fortawesome/free-solid-svg-icons'
import IconButton from './IconButton'
import {
  ldcMinutesForSpecificMonth,
  otherMinutesForSpecificMonth,
  standardMinutesForSpecificMonth,
  totalMinutesForSpecificMonth,
} from '../lib/serviceReport'
import { useMemo, useState } from 'react'
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
  const [expandOtherCategories, setExpandOtherCategories] = useState(false)
  const goalHours = publisherHours[publisher]
  const navigation = useNavigation<RootStackNavigation>()

  const totalMinutes = useMemo(
    () =>
      monthsReports
        ? totalMinutesForSpecificMonth(monthsReports, month, year)
        : 0,
    [month, monthsReports, year]
  )

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

  if (!monthsReports) {
    return (
      <Card>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
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
            }}
          >
            {i18n.t('addTime')}
          </Text>
        </ActionButton>
      </Card>
    )
  }

  return (
    <Card
      style={{
        borderColor: theme.colors.accent,
        borderWidth: highlightAsCurrentMonth ? 2 : 0,
      }}
    >
      <View style={{ gap: 10 }}>
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
            {title ?? i18n.t('monthDetails')}
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
              color: theme.colors.textAlt,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {' '}
            {`${_.round(totalMinutes / 60, 1)} ${i18n.t(
              'of'
            )} ${goalHours} ${i18n.t('hoursToGoal')}`}{' '}
          </Text>
          <MonthServiceReportProgressBar month={month} year={year} />
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
            />
            {otherMinutes && otherMinutes.length > 0 && (
              <>
                {!expandOtherCategories && (
                  <Button onPress={() => setExpandOtherCategories(true)}>
                    <Text
                      style={{
                        textDecorationLine: 'underline',
                        color: theme.colors.textAlt,
                        fontSize: theme.fontSize('sm'),
                      }}
                    >
                      {i18n.t('showOtherCategories')}
                    </Text>
                  </Button>
                )}
                {expandOtherCategories &&
                  otherMinutes.map((report, index) => (
                    <TimeCategoryTableRow
                      key={index}
                      title={report.tag}
                      number={_.round(report.minutes / 60, 1)}
                    />
                  ))}
              </>
            )}
          </View>
        </View>
      )}
    </Card>
  )
}
export default MonthSummary
