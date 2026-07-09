import moment from 'moment'

export const shouldShowPreviousReportReminder = ({
  installedOn,
  now,
  previousMonthHasEntries,
  submittedReportMonths,
}: {
  installedOn: Date
  now: Date
  previousMonthHasEntries: boolean
  submittedReportMonths: readonly string[]
}): boolean => {
  const currentMonth = moment(now).startOf('month')
  const previousMonthKey = moment(now).subtract(1, 'month').format('YYYY-MM')

  if (submittedReportMonths.includes(previousMonthKey)) return false
  if (previousMonthHasEntries) return true

  return moment(installedOn).isBefore(currentMonth)
}
