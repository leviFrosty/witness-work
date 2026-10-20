import moment from 'moment'
import { useShallow } from 'zustand/react/shallow'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import {
  publisherCapabilitiesForMonth,
  type RolePreferences,
} from '@/lib/roleHistory'
import { usePreferences } from '@/stores/preferences'

/**
 * Whether a month's goal can be changed from the Schedule: the month hasn't
 * ended and its role has a Monthly Goal to adjust, as the old month header
 * allowed.
 */
export default function useEditableMonthGoal(): (
  target: CalendarMonth
) => boolean {
  // Only the role preferences: the Schedule screen calls this, and any other
  // preference write would re-render the whole tab.
  const prefs: RolePreferences = usePreferences(
    useShallow((s) => ({
      role: s.role,
      roleHistory: s.roleHistory,
      publisherHours: s.publisherHours,
      userSpecifiedHasAnnualGoal: s.userSpecifiedHasAnnualGoal,
      milestoneOverrides: s.milestoneOverrides,
      overrideCreditLimit: s.overrideCreditLimit,
      customCreditLimitHours: s.customCreditLimitHours,
      logsHours: s.logsHours,
    }))
  )
  return (target) =>
    !moment({ year: target.year, month: target.month, day: 1 }).isBefore(
      moment(),
      'month'
    ) && publisherCapabilitiesForMonth(prefs, target).monthlyGoalHours > 0
}
