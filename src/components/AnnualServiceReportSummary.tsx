import { useMemo } from 'react'
import useServiceReport from '../stores/serviceReport'
import Card from './Card'
import Text from './MyText'
import usePublisher from '../hooks/usePublisher'
import {
  getServiceYearReports,
  getTotalMinutesForServiceYear,
  serviceReportHoursPerMonthToGoal,
  useFormattedMinutes,
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
