import { usePreferences } from '@/stores/preferences'
import {
  derivePublisherCapabilities,
  type PublisherCapabilities,
} from '@/lib/publisherCapabilities'

/**
 * Resolves the User's field-ministry role to a fully derived
 * `PublisherCapabilities` object. This hook is the React-side seam for role +
 * capability data only — for profile-shaped data (name, avatar, etc.) call
 * `useUser()` instead. Components that need both call both hooks.
 */
const usePublisher = (): PublisherCapabilities => {
  const {
    role,
    publisherHours,
    userSpecifiedHasAnnualGoal,
    milestoneOverrides,
    overrideCreditLimit,
    customCreditLimitHours,
  } = usePreferences()

  return derivePublisherCapabilities({
    publisher: role,
    publisherHours,
    userSpecifiedHasAnnualGoal,
    milestoneOverrides,
    overrideCreditLimit,
    customCreditLimitHours,
  })
}

export default usePublisher
