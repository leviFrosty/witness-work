import { usePreferences } from '@/stores/preferences'
import {
  derivePublisherCapabilities,
  type PublisherCapabilities,
} from '@/lib/publisherCapabilities'
import i18n from '@/lib/locales'

const usePublisher = (): PublisherCapabilities => {
  const {
    role,
    publisherHours,
    userSpecifiedHasAnnualGoal,
    milestoneOverrides,
    overrideCreditLimit,
    customCreditLimitHours,
    name,
  } = usePreferences()

  const capabilities = derivePublisherCapabilities({
    publisher: role,
    publisherHours,
    userSpecifiedHasAnnualGoal,
    milestoneOverrides,
    overrideCreditLimit,
    customCreditLimitHours,
    name,
  })
  return {
    ...capabilities,
    displayName: capabilities.hasName
      ? capabilities.name
      : i18n.t('profileGreetingNoName'),
  }
}

export default usePublisher
