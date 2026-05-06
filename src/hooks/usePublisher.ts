import { usePreferences } from '../stores/preferences'
import {
  derivePublisherCapabilities,
  type PublisherCapabilities,
} from '../lib/publisherCapabilities'

const usePublisher = (): PublisherCapabilities => {
  const {
    publisher,
    publisherHours,
    userSpecifiedHasAnnualGoal,
    milestoneOverrides,
    overrideCreditLimit,
    customCreditLimitHours,
  } = usePreferences()

  return derivePublisherCapabilities({
    publisher,
    publisherHours,
    userSpecifiedHasAnnualGoal,
    milestoneOverrides,
    overrideCreditLimit,
    customCreditLimitHours,
  })
}

export default usePublisher
