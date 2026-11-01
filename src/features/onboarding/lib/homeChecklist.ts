import moment from 'moment'
import { calendarDaysBetween } from '@/lib/normalizeDate'
import { isCountableEntry } from '@/lib/serviceReport'
import { TimeEntriesByYear } from '@/types/timeEntry'

export type HomeChecklistItemId =
  | 'setMonthlyGoal'
  | 'logFirstMinute'
  | 'addFirstContact'
  | 'logThreeDays'

export const LOGGED_DAYS_GOAL = 3

const RETIRED_ITEM_IDS: Record<string, HomeChecklistItemId> = {
  sendFirstReport: 'logThreeDays',
}

export const resolveManualCompletions = (ids: readonly string[]): Set<string> =>
  new Set(ids.map((id) => RETIRED_ITEM_IDS[id] ?? id))

export const manualCompletionIdsFor = (id: HomeChecklistItemId): string[] => [
  id,
  ...Object.keys(RETIRED_ITEM_IDS).filter(
    (old) => RETIRED_ITEM_IDS[old] === id
  ),
]

export const countLoggedDays = (
  serviceReports: TimeEntriesByYear,
  cap = LOGGED_DAYS_GOAL
): number => {
  const days = new Set<string>()
  for (const year of Object.keys(serviceReports)) {
    const months = serviceReports[year]
    for (const month of Object.keys(months)) {
      for (const entry of months[month] ?? []) {
        if (!isCountableEntry(entry)) continue
        days.add(moment(entry.date).format('YYYY-MM-DD'))
        if (days.size >= cap) return cap
      }
    }
  }
  return days.size
}

export const daysSinceInstallBucket = (
  installedOn: moment.MomentInput,
  now: moment.MomentInput = new Date()
): string => {
  const days = calendarDaysBetween(installedOn, now)
  if (!Number.isFinite(days) || days < 0) return 'unknown'
  if (days === 0) return '0'
  if (days === 1) return '1'
  if (days <= 3) return '2_3'
  if (days <= 7) return '4_7'
  if (days <= 14) return '8_14'
  if (days <= 30) return '15_30'
  return 'over_30'
}
