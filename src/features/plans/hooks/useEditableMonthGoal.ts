import moment from 'moment'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import { publisherCapabilitiesForMonth } from '@/lib/roleHistory'
import { usePreferences } from '@/stores/preferences'

/**
 * Whether a month's goal can be changed from the Schedule: the month hasn't
 * ended and its role has a Monthly Goal to adjust, as the old month header
 * allowed.
 */
export default function useEditableMonthGoal(): (
  target: CalendarMonth
) => boolean {
  const {
    role,
    roleHistory,
    publisherHours,
    userSpecifiedHasAnnualGoal,
    milestoneOverrides,
    overrideCreditLimit,
    customCreditLimitHours,
    logsHours,
  } = usePreferences()
  const thisMonth = moment().startOf('month')
  return (target) =>
    !moment({ year: target.year, month: target.month, day: 1 }).isBefore(
      thisMonth,
      'month'
    ) &&
    publisherCapabilitiesForMonth(
      {
        role,
        roleHistory,
        publisherHours,
        userSpecifiedHasAnnualGoal,
        milestoneOverrides,
        overrideCreditLimit,
        customCreditLimitHours,
        logsHours,
      },
      target
    ).monthlyGoalHours > 0
}
