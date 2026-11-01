import moment from 'moment'
import { getMonthsReports, isCountableEntry } from '@/lib/serviceReport'
import type { TimeEntriesByYear } from '@/types/timeEntry'

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

export const dueReportMonth = ({
  installedOn,
  now,
  serviceReports,
  submittedReportMonths,
}: {
  installedOn: Date
  now: Date
  serviceReports: TimeEntriesByYear
  submittedReportMonths: readonly string[]
}): { month: number; year: number; isPreviousMonth: boolean } => {
  const previousMonth = moment(now).subtract(1, 'month')
  const isPreviousMonth = shouldShowPreviousReportReminder({
    installedOn,
    now,
    previousMonthHasEntries: getMonthsReports(
      serviceReports,
      previousMonth.month(),
      previousMonth.year()
    ).some(isCountableEntry),
    submittedReportMonths,
  })
  const due = isPreviousMonth ? previousMonth : moment(now)
  return { month: due.month(), year: due.year(), isPreviousMonth }
}
