import { getStreakKind } from '@/lib/publisherCapabilities'
import {
  calendarMonthOf,
  roleForMonth,
  type RoleHistory,
} from '@/lib/roleHistory'
import {
  serviceStreak,
  type ServiceStreak,
  type StreakRecords,
} from '@/lib/serviceStreak'
import { usePreferences } from '@/stores/preferences'
import { useServiceReport } from '@/stores/serviceReport'
import type { Publisher } from '@/types/publisher'

/** The Service Streak, counted the way this month's role counts it. */
export function serviceStreakFor(
  prefs: { role: Publisher; roleHistory: RoleHistory | null },
  records: StreakRecords,
  now: Date = new Date()
): ServiceStreak {
  const role = roleForMonth(prefs.roleHistory, prefs.role, calendarMonthOf(now))
  return serviceStreak(getStreakKind(role), records, now)
}

/**
 * The Service Streak as of `now`, read from the stores, for callers outside
 * React (Buddy Cards, reminders).
 */
export function currentServiceStreak(now: Date = new Date()): ServiceStreak {
  const { serviceReports, dayPlans, recurringPlans } =
    useServiceReport.getState()
  return serviceStreakFor(
    usePreferences.getState(),
    { serviceReports, dayPlans, recurringPlans },
    now
  )
}
