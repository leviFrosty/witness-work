import {
  type OnboardingIntroducedTopic,
  usePreferences,
} from '@/stores/preferences'

/** Remembers that onboarding showed `topic`, so Schedule's intro skips it. */
export const markIntroduced = (topic: OnboardingIntroducedTopic) => {
  const { onboardingIntroduced, set } = usePreferences.getState()
  if (onboardingIntroduced.includes(topic)) return
  set({ onboardingIntroduced: [...onboardingIntroduced, topic] })
}

/** The topic an onboarding tour page or setup step introduces, if any. */
export const introducedTopic = (
  id: string
): OnboardingIntroducedTopic | null => {
  if (id === 'plan' || id === 'planMonth') return 'plan'
  if (id === 'buddies') return 'buddies'
  return null
}
