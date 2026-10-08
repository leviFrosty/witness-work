import { storedDayKey } from '@/lib/normalizeDate'
import {
  getEffectiveMinutesForRecurringPlan,
  getPlansIntersectingDay,
  type RecurringPlan,
} from '@/lib/recurrence'
import { serviceYearMonths } from '@/lib/roleHistory'
import { isCountableEntry } from '@/lib/serviceReport'
import type { DayPlan, TimeEntriesByYear, TimeEntry } from '@/types/timeEntry'
import { dayStatus, type DayStatus } from '@/features/plans/lib/dayStatus'
import { dayKeyOf } from '@/features/plans/lib/scheduleRows'

/**
 * Time Entries and Day Plans grouped by calendar day (`YYYY-MM-DD`), so a grid
 * of hundreds of days looks each one up instead of scanning every record.
 */
export type ScheduleDayIndex = {
  reportsByDay: Map<string, TimeEntry[]>
  dayPlansByDay: Map<string, DayPlan[]>
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
  const dayPlansByDay = new Map<string, DayPlan[]>()
  for (const plan of dayPlans)
    push(dayPlansByDay, storedDayKey(plan.date), plan)
  return { reportsByDay, dayPlansByDay }
}

/** Every day of a Service Year (September → August), keyed `YYYY-MM-DD`. */
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
      const recurring = dayPlans.length
        ? []
        : getPlansIntersectingDay(date, recurringPlans)
      // A Time Rollover moves time between months; it isn't that day's service.
      const reports = (index.reportsByDay.get(key) ?? []).filter(
        isCountableEntry
      )
      const plannedMinutes = dayPlans.length
        ? dayPlans.reduce((total, plan) => total + plan.minutes, 0)
        : Math.max(
            0,
            ...recurring.map((plan) =>
              getEffectiveMinutesForRecurringPlan(plan, date)
            )
          )
      statuses.set(
        key,
        dayStatus({
          hasPlan: dayPlans.length > 0 || recurring.length > 0,
          plannedMinutes,
          hasEntries: reports.length > 0,
          loggedMinutes: reports.reduce(
            (total, report) => total + report.hours * 60 + report.minutes,
            0
          ),
          isPast: key < todayKey,
        })
      )
    }
  }
  return statuses
}
