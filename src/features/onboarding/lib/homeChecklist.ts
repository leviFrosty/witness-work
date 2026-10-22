import moment from 'moment'
import { calendarDaysBetween } from '@/lib/normalizeDate'
import { isCountableEntry } from '@/lib/serviceReport'
import { TimeEntriesByYear } from '@/types/timeEntry'

/**
 * Checklist item ids. Stable because manual completions are persisted (and
 * synced) by id. `setMonthlyGoal` keeps its original id but completes on any
 * Plan, and is labeled that way.
 */
export type HomeChecklistItemId =
  | 'setMonthlyGoal'
  | 'logFirstMinute'
  | 'addFirstContact'
  | 'logThreeDays'

/** Distinct days with a logged entry that complete `logThreeDays`. */
export const LOGGED_DAYS_GOAL = 3

/**
 * Retired ids whose manual completion carries over to the step that replaced
 * them. `sendFirstReport` waited for the month to end, so it was swapped for
 * `logThreeDays` (October 2026). Read at render time rather than migrated, so a
 * device on an older version that syncs the old id back keeps working.
 */
const RETIRED_ITEM_IDS: Record<string, HomeChecklistItemId> = {
  sendFirstReport: 'logThreeDays',
}

/** Manual completions with retired ids mapped to their replacements. */
export const resolveManualCompletions = (ids: readonly string[]): Set<string> =>
  new Set(ids.map((id) => RETIRED_ITEM_IDS[id] ?? id))

/** Stored ids, including retired ones, that mark `id` as done by hand. */
export const manualCompletionIdsFor = (id: HomeChecklistItemId): string[] => [
  id,
  ...Object.keys(RETIRED_ITEM_IDS).filter(
    (old) => RETIRED_ITEM_IDS[old] === id
  ),
]

/**
 * Distinct calendar days with a countable Time Entry, counted up to `cap` (Time
 * Rollover entries don't count; see `isCountableEntry`).
 */
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

/** Coarse install age for analytics; exact dates aren't needed. */
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
