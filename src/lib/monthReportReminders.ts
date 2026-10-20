import moment from 'moment'
import type { TimeEntriesByYear } from '@/types/timeEntry'

/** 9:00 AM, as minutes after midnight. */
export const DEFAULT_MONTH_REPORT_REMINDER_TIME = 9 * 60

export type MonthReportSources = {
  serviceReports: TimeEntriesByYear
  /** `YYYY-MM` months whose report was sent or marked submitted. */
  submittedReportMonths: readonly string[]
  /** Local minutes after midnight on the 1st the reminder goes out. */
  remindAt: number
}

/** The Preferences that turn on and time the month's report reminder. */
export type MonthReportPreferences = {
  monthReportReminders: boolean
  monthReportReminderTime: number
  submittedReportMonths: string[]
}

/** What the report reminder is built from; undefined when it's off. */
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

/**
 * Whether month `YYYY-MM` still has a report to send: something was logged in
 * it and it isn't marked submitted. The same rules as last month's report in
 * the notifications tray.
 */
export function monthReportDue(
  monthKey: string,
  sources: Pick<MonthReportSources, 'serviceReports' | 'submittedReportMonths'>
): boolean {
  const month = moment(monthKey, 'YYYY-MM', true)
  if (!month.isValid() || sources.submittedReportMonths.includes(monthKey))
    return false
  // Logged time, rollovers aside (`isCountableEntry`); a month logged with no
  // hours still has a report.
  return (sources.serviceReports[month.year()]?.[month.month()] ?? []).some(
    (entry) =>
      entry.rollover !== true &&
      (entry.hours ?? 0) * 60 + (entry.minutes ?? 0) >= 0
  )
}

/**
 * The next report reminder after `now`: `remindAt` on the 1st, for the month
 * that just ended. Null when that month has nothing to send.
 */
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
