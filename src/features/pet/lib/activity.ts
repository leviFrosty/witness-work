import { isCountableEntry } from '@/lib/serviceReport'
import type {
  DayPlan,
  RecurringPlan,
  TimeEntriesByYear,
} from '@/types/timeEntry'
import type { Visit } from '@/types/visit'
import {
  isDayKey,
  localDayKey,
  monthOfDayKey,
  recordDayKey,
} from '@/features/pet/lib/dayKeys'

export type PetActivityRecords = {
  serviceReports: TimeEntriesByYear
  visits: Pick<Visit, 'date' | 'receivedAt'>[]
  dayPlans: Pick<DayPlan, 'savedOn'>[]
  recurringPlans: Pick<RecurringPlan, 'savedOn'>[]
}

export function petActiveDays({
  serviceReports,
  visits,
  dayPlans,
  recurringPlans,
}: PetActivityRecords): Set<string> {
  const days = new Set<string>()
  for (const year of Object.values(serviceReports))
    for (const month of Object.values(year))
      for (const entry of month)
        if (isCountableEntry(entry)) days.add(recordDayKey(entry.date))
  for (const visit of visits) {
    if (visit.receivedAt !== undefined) continue
    const key = localDayKey(visit.date)
    if (key !== 'Invalid date') days.add(key)
  }
  for (const plan of dayPlans)
    if (isDayKey(plan.savedOn)) days.add(plan.savedOn)
  for (const plan of recurringPlans)
    if (isDayKey(plan.savedOn)) days.add(plan.savedOn)
  return days
}

export function activeMonths(
  days: Iterable<string>,
  sinceKey: string,
  untilKey?: string
): number {
  const months = new Set<string>()
  for (const day of days) {
    if (day < sinceKey || (untilKey !== undefined && day > untilKey)) continue
    months.add(monthOfDayKey(day))
  }
  return months.size
}
