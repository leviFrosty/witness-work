import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
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
  } = usePreferences()
  // `name` moved to the Profile store in wave-3. Publisher capabilities still
  // surface it via the same shape so consumers (e.g. ProfileCard) don't have
  // to call both hooks; a future `useUser()` will retire this seam.
  const { name } = useProfile()

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
