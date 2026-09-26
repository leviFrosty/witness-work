import { usePreferences } from '@/stores/preferences'
import {
  derivePublisherCapabilities,
  type PublisherCapabilities,
} from '@/lib/publisherCapabilities'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import {
  calendarMonthOf,
  publisherCapabilitiesForMonth,
} from '@/lib/roleHistory'

/**
 * Resolves the User's field-ministry role to a fully derived
 * `PublisherCapabilities` object. This hook is the React-side seam for role +
 * capability data only — for profile-shaped data (name, avatar, etc.) call
 * `useUser()` instead. Components that need both call both hooks.
 *
 * `target` picks the calendar month (default: this month). A month renders with
 * the role that applied then — per the User's **Role History** — so past
 * reports, caps, and exports don't change when the role does. `'standing'`
 * resolves the User's `role` preference itself, for Settings surfaces that edit
 * it (it differs from this month's role during a one-off month).
 */
const usePublisher = (
  target?: CalendarMonth | 'standing'
): PublisherCapabilities => {
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

  if (target === 'standing') {
    return derivePublisherCapabilities({
      publisher: role,
      publisherHours,
      userSpecifiedHasAnnualGoal,
      milestoneOverrides,
      overrideCreditLimit,
      customCreditLimitHours,
      logsHours,
    })
  }

  return publisherCapabilitiesForMonth(
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
    target ?? calendarMonthOf()
  )
}

export default usePublisher
