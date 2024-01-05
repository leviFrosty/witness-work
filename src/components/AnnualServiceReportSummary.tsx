import { useMemo } from 'react'
import useServiceReport from '../stores/serviceReport'
import Card from './Card'
import Text from './MyText'
import moment from 'moment'
import usePublisher from '../hooks/usePublisher'
import { serviceYearsDateRange } from '../lib/serviceReport'

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
  const { annualGoalHours, goalHours } = usePublisher()
  const { minDate, maxDate } = serviceYearsDateRange(serviceYear)

  const percentage = useMemo(() => {
    return (totalServiceHours / annualGoalHours).toFixed(2)
  }, [totalServiceHours, annualGoalHours])

  return (
    <Card>
      <Text>Service Year: {serviceYear}</Text>
      <Text>Reports: {reports.length}</Text>
      <Text>Hours: {totalServiceHours}</Text>
      <Text>Goal Hours: {annualGoalHours}</Text>
      <Text>Percentage: {percentage}</Text>
      <Text>Hours Per Month To Goal: {hoursPerMonthToGoal}</Text>
    </Card>
  )
}

export default AnnualServiceReportSummary
