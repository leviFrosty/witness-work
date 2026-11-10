import { dayPlansOnLocalDay } from '@/lib/dayPlansByDay'
import { entryMinutes } from '@/lib/entryMinutes'
import {
  calendarDaysBetween,
  localDayKey,
  storedDayKey,
} from '@/lib/normalizeDate'
import {
  resolvePlannedContributionsForDay,
  type RecurringPlan,
} from '@/lib/recurrence'
import { getMonthsReports, isCountableEntry } from '@/lib/serviceReport'
import type { DayPlan, TimeEntriesByYear } from '@/types/timeEntry'

export const ENTRY_DAYS_MAX = 7
export const ENTRY_DAYS_MIN = 5

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12)

export const entryDayCount = (width: number, minCellWidth: number): number =>
  width > 0
    ? Math.min(
        ENTRY_DAYS_MAX,
        Math.max(ENTRY_DAYS_MIN, Math.floor(width / minCellWidth))
      )
    : ENTRY_DAYS_MAX

export const entryDays = (
  selected: Date,
  today: Date,
  count: number = ENTRY_DAYS_MAX
): Date[] => {
  const fromToday = calendarDaysBetween(today, selected)
  const end =
    fromToday > 0
      ? selected
      : fromToday > -count
        ? today
        : addDays(selected, Math.floor((count - 1) / 2))
  return Array.from({ length: count }, (_, index) =>
    addDays(end, index - (count - 1))
  )
}

export const loggedMinutesOnDays = (
  serviceReports: TimeEntriesByYear,
  days: Date[]
): Map<string, number> => {
  const logged = new Map<string, number>()
  for (const day of days) {
    const key = localDayKey(day)
    const minutes = getMonthsReports(
      serviceReports,
      day.getMonth(),
      day.getFullYear()
    )
      .filter((entry) => isCountableEntry(entry))
      .filter((entry) => storedDayKey(entry.date) === key)
      .reduce((total, entry) => total + entryMinutes(entry), 0)
    logged.set(key, minutes)
  }
  return logged
}

export type DayPlanSuggestion = {
  minutes: number

  categoryId?: string
}

export const dayPlanSuggestion = (
  day: Date,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
): DayPlanSuggestion | undefined => {
  const planned = resolvePlannedContributionsForDay(
    day,
    dayPlansOnLocalDay(dayPlans, day),
    recurringPlans
  ).filter((contribution) => contribution.minutes > 0)
  const minutes = planned.reduce((total, plan) => total + plan.minutes, 0)
  if (minutes <= 0) return undefined
  const categories = new Set(planned.map(({ plan }) => plan.categoryId))
  return {
    minutes,
    categoryId: categories.size === 1 ? planned[0].plan.categoryId : undefined,
  }
}
