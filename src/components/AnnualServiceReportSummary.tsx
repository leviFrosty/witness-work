import { useMemo } from 'react'
import useServiceReport from '../stores/serviceReport'
import Card from './Card'
import Text from './MyText'
import usePublisher from '../hooks/usePublisher'
import {
  getTotalHoursForServiceYear,
  serviceReportHoursPerMonthToGoal,
} from '../lib/serviceReport'
import SimpleProgressBar from './SimpleProgressBar'
import { View } from 'react-native'
import i18n from '../lib/locales'
import useTheme from '../contexts/theme'
import Badge from './Badge'
import IconButton from './IconButton'
import { faStopwatch } from '@fortawesome/free-solid-svg-icons'

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
}

const AnnualServiceReportSummary = ({
  serviceYear,
  year,
  month,
}: AnnualServiceReportSummaryProps) => {
  const theme = useTheme()
  const { annualGoalHours, goalHours } = usePublisher()
  // const { minDate, maxDate } = serviceYearsDateRange(serviceYear)
  const { serviceReports } = useServiceReport()

  const totalHoursForServiceYear = getTotalHoursForServiceYear(
    serviceReports,
    serviceYear
  )

  const percentage = useMemo(() => {
    return parseFloat(
      (totalHoursForServiceYear / annualGoalHours).toPrecision(3)
    )
  }, [totalHoursForServiceYear, annualGoalHours])

  const hoursPerMonthToGoal = useMemo(() => {
    return serviceReportHoursPerMonthToGoal({
      currentDate: {
        month,
        year,
      },
      goalHours,
      serviceReports,
      serviceYear,
    })
  }, [goalHours, month, serviceReports, serviceYear, year])

  return (
    <Card>
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
            {`${totalHoursForServiceYear} ${i18n.t(
              'of'
            )} ${annualGoalHours} ${i18n.t('hours')}`}
          </Text>
        </View>
      </View>
      <SimpleProgressBar
        percentage={percentage}
        height={10}
        color={theme.colors.textAlt}
      />
      <View style={{ flexDirection: 'row' }}>
        <Badge color={theme.colors.backgroundLighter}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <IconButton icon={faStopwatch} size={10} />
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
              }}
            >
              {hoursPerMonthToGoal} {i18n.t('hoursPerMonthToGoal')}
            </Text>
          </View>
        </Badge>
      </View>
    </Card>
  )
}

export default AnnualServiceReportSummary
