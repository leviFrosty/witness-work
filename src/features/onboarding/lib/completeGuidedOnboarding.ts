import { earnPasskeyPrompt } from '@/app/account/passkeyPrompt'
import { analytics } from '@/lib/analytics'
import { usePreferences } from '@/stores/preferences'

export function completeGuidedOnboarding(): void {
  usePreferences.getState().set({
    onboardingComplete: true,
    onboardingStepId: null,
    onboardingPasskeysOffered: null,
  })
  earnPasskeyPrompt('onboarding')
  analytics.capture('onboarding_completed', { completion_method: 'guided' })
}
