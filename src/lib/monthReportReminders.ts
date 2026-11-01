import moment from 'moment'
import type { TimeEntriesByYear } from '@/types/timeEntry'

export const DEFAULT_MONTH_REPORT_REMINDER_TIME = 9 * 60

export type MonthReportSources = {
  serviceReports: TimeEntriesByYear

  submittedReportMonths: readonly string[]

  remindAt: number
}

export type MonthReportPreferences = {
  monthReportReminders: boolean
  monthReportReminderTime: number
  submittedReportMonths: string[]
}

export function monthReportSources(
  records: { serviceReports: TimeEntriesByYear },
  prefs: MonthReportPreferences
): MonthReportSources | undefined {
  if (!prefs.monthReportReminders) return undefined
  const time = prefs.monthReportReminderTime
  return {
    serviceReports: records.serviceReports,
    submittedReportMonths: prefs.submittedReportMonths,
    remindAt:
      Number.isInteger(time) && time >= 0 && time < 24 * 60
        ? time
        : DEFAULT_MONTH_REPORT_REMINDER_TIME,
  }
}

export function monthReportDue(
  monthKey: string,
  sources: Pick<MonthReportSources, 'serviceReports' | 'submittedReportMonths'>
): boolean {
  const month = moment(monthKey, 'YYYY-MM', true)
  if (!month.isValid() || sources.submittedReportMonths.includes(monthKey))
    return false

  return (sources.serviceReports[month.year()]?.[month.month()] ?? []).some(
    (entry) =>
      entry.rollover !== true &&
      (entry.hours ?? 0) * 60 + (entry.minutes ?? 0) >= 0
  )
}

export function nextMonthReportReminder(
  sources: MonthReportSources,
  now: number
): { date: Date; month: string } | null {
  const current = new Date(now)
  const at = (monthsAhead: number) =>
    new Date(
      current.getFullYear(),
      current.getMonth() + monthsAhead,
      1,
      0,
      sources.remindAt
    )
  const thisMonth = at(0)
  const date = thisMonth.getTime() > now ? thisMonth : at(1)
  const month = moment(date).subtract(1, 'month').format('YYYY-MM')
  return monthReportDue(month, sources) ? { date, month } : null
}
