import { getStreakKind } from '@/lib/publisherCapabilities'
import {
  calendarMonthOf,
  roleForMonth,
  type RoleHistory,
} from '@/lib/roleHistory'
import {
  serviceStreak,
  streakHistory,
  type ServiceStreak,
  type StreakHistory,
  type StreakRecords,
} from '@/lib/serviceStreak'
import { usePreferences } from '@/stores/preferences'
import { useServiceReport } from '@/stores/serviceReport'
import type { Publisher } from '@/types/publisher'

export function serviceStreakFor(
  prefs: { role: Publisher; roleHistory: RoleHistory | null },
  records: StreakRecords,
  now: Date = new Date()
): ServiceStreak {
  const role = roleForMonth(prefs.roleHistory, prefs.role, calendarMonthOf(now))
  return serviceStreak(getStreakKind(role), records, now)
}

export function streakHistoryFor(
  prefs: { role: Publisher; roleHistory: RoleHistory | null },
  records: StreakRecords,
  now: Date = new Date()
): StreakHistory {
  const role = roleForMonth(prefs.roleHistory, prefs.role, calendarMonthOf(now))
  return streakHistory(getStreakKind(role), records, now)
}

export function currentServiceStreak(now: Date = new Date()): ServiceStreak {
  const { serviceReports, dayPlans, recurringPlans } =
    useServiceReport.getState()
  return serviceStreakFor(
    usePreferences.getState(),
    { serviceReports, dayPlans, recurringPlans },
    now
  )
}
