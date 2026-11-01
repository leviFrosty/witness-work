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
import { useShallow } from 'zustand/react/shallow'

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
  } = usePreferences(
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
