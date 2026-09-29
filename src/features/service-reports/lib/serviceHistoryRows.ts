import {
  monthlyGoalKey,
  type CalendarMonth,
  type MonthlyGoalOverrides,
} from '@/lib/monthlyGoals'
import { monthStatusOf, type MonthStatus } from '@/lib/monthStatus'
import {
  calendarMonthOf,
  roleForMonth,
  serviceYearMonths,
  type RoleHistory,
} from '@/lib/roleHistory'
import { getMonthsReports } from '@/lib/serviceReport'
import type { Publisher } from '@/types/publisher'
import type { TimeEntriesByYear } from '@/types/timeEntry'

/** One month in the Service History editor's unsaved form. */
export type ServiceHistoryRow = {
  target: CalendarMonth
  savedStatus: MonthStatus
  status: MonthStatus
  /** Raw logged minutes; `null` when the month has no Time Entries. */
  loggedMinutes: number | null
  hours: string
  creditHours: string
  shared: boolean
}

/**
 * The saved state of every finished month of a Service Year, with nothing
 * entered yet.
 */
export const buildServiceHistoryRows = ({
  serviceYear,
  role,
  roleHistory,
  monthlyGoalOverrides,
  serviceReports,
  now = new Date(),
}: {
  serviceYear: number
  role: Publisher
  roleHistory: RoleHistory | null
  monthlyGoalOverrides: MonthlyGoalOverrides
  serviceReports: TimeEntriesByYear
  now?: Date
}): ServiceHistoryRow[] => {
  const currentKey = monthlyGoalKey(calendarMonthOf(now))
  return serviceYearMonths(serviceYear)
    .filter((target) => monthlyGoalKey(target) < currentKey)
    .map((target) => {
      const savedStatus = monthStatusOf(
        roleForMonth(roleHistory, role, target),
        monthlyGoalOverrides[monthlyGoalKey(target)]
      )
      const reports = getMonthsReports(
        serviceReports,
        target.month,
        target.year
      )
      return {
        target,
        savedStatus,
        status: savedStatus,
        loggedMinutes: reports.length
          ? reports.reduce((sum, r) => sum + r.hours * 60 + r.minutes, 0)
          : null,
        hours: '',
        creditHours: '',
        shared: false,
      }
    })
}

/**
 * Row `index` with the previous month's status and, when neither month has
 * logged time, its entered hours / credit / participation.
 */
export const copiedFromPreviousRow = (
  rows: ServiceHistoryRow[],
  index: number
): ServiceHistoryRow => {
  const row = rows[index]
  const previous = rows[index - 1]
  if (!previous) return row
  const bothEmpty =
    row.loggedMinutes === null && previous.loggedMinutes === null
  return {
    ...row,
    status: previous.status,
    ...(bothEmpty
      ? {
          hours: previous.hours,
          creditHours: previous.creditHours,
          shared: previous.shared,
        }
      : {}),
  }
}

/** The row back to its saved status with nothing entered. */
export const clearedRow = (row: ServiceHistoryRow): ServiceHistoryRow => ({
  ...row,
  status: row.savedStatus,
  hours: '',
  creditHours: '',
  shared: false,
})

/** Whether two versions of a row differ in anything the user can edit. */
export const rowsDiffer = (a: ServiceHistoryRow, b: ServiceHistoryRow) =>
  a.status !== b.status ||
  a.hours !== b.hours ||
  a.creditHours !== b.creditHours ||
  a.shared !== b.shared
