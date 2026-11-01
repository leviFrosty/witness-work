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
import { getMonthsReports, isCountableEntry } from '@/lib/serviceReport'
import { entryMinutes } from '@/lib/entryMinutes'
import type { Publisher } from '@/types/publisher'
import type { TimeEntriesByYear } from '@/types/timeEntry'

export type ServiceHistoryRow = {
  target: CalendarMonth
  savedStatus: MonthStatus
  status: MonthStatus

  loggedMinutes: number | null
  hours: string
  creditHours: string
  shared: boolean
}

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
        loggedMinutes: reports.some(isCountableEntry)
          ? reports.reduce((sum, r) => sum + entryMinutes(r), 0)
          : null,
        hours: '',
        creditHours: '',
        shared: false,
      }
    })
}

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

export const clearedRow = (row: ServiceHistoryRow): ServiceHistoryRow => ({
  ...row,
  status: row.savedStatus,
  hours: '',
  creditHours: '',
  shared: false,
})

export const rowsDiffer = (a: ServiceHistoryRow, b: ServiceHistoryRow) =>
  a.status !== b.status ||
  a.hours !== b.hours ||
  a.creditHours !== b.creditHours ||
  a.shared !== b.shared
