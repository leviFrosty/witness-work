import { dayPlansByDayKey } from '@/lib/dayPlansByDay'
import { storedDayKey } from '@/lib/normalizeDate'
import {
  getPlansIntersectingDay,
  plannedMinutesForDay,
  type RecurringPlan,
} from '@/lib/recurrence'
import { serviceYearMonths } from '@/lib/roleHistory'
import { isCountableEntry } from '@/lib/serviceReport'
import { entryMinutes } from '@/lib/entryMinutes'
import type { DayPlan, TimeEntriesByYear, TimeEntry } from '@/types/timeEntry'
import { dayStatus, type DayStatus } from '@/features/plans/lib/dayStatus'
import { dayKeyOf } from '@/features/plans/lib/scheduleRows'

export type ScheduleDayIndex = {
  reportsByDay: Map<string, TimeEntry[]>
  dayPlansByDay: ReadonlyMap<string, DayPlan[]>
}

const push = <T>(map: Map<string, T[]>, key: string, value: T) => {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

export function buildScheduleDayIndex(
  serviceReports: TimeEntriesByYear,
  dayPlans: DayPlan[]
): ScheduleDayIndex {
  const reportsByDay = new Map<string, TimeEntry[]>()
  for (const months of Object.values(serviceReports)) {
    for (const reports of Object.values(months)) {
      for (const report of reports) {
        push(reportsByDay, storedDayKey(report.date), report)
      }
    }
  }
  return { reportsByDay, dayPlansByDay: dayPlansByDayKey(dayPlans) }
}

export function serviceYearDayStatuses({
  serviceYear,
  index,
  recurringPlans,
  today,
}: {
  serviceYear: number
  index: ScheduleDayIndex
  recurringPlans: RecurringPlan[]
  today: Date
}): Map<string, DayStatus> {
  const statuses = new Map<string, DayStatus>()
  const todayKey = dayKeyOf(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  )
  for (const { year, month } of serviceYearMonths(serviceYear)) {
    const days = new Date(year, month + 1, 0).getDate()
    for (let day = 1; day <= days; day++) {
      const key = dayKeyOf(year, month, day)
      const date = new Date(year, month, day, 12)
      const dayPlans = index.dayPlansByDay.get(key) ?? []
      const recurring = getPlansIntersectingDay(date, recurringPlans)

      const reports = (index.reportsByDay.get(key) ?? []).filter(
        isCountableEntry
      )
      const plannedMinutes = plannedMinutesForDay(date, dayPlans, recurring)
      statuses.set(
        key,
        dayStatus({
          hasPlan: dayPlans.length > 0 || recurring.length > 0,
          plannedMinutes,
          hasEntries: reports.length > 0,
          loggedMinutes: reports.reduce(
            (total, report) => total + entryMinutes(report),
            0
          ),
          isPast: key < todayKey,
        })
      )
    }
  }
  return statuses
}
