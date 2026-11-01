import { analytics } from '@/lib/analytics'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'

export function completeOnboardingFromRestore() {
  analytics.capture('onboarding_completed', {
    completion_method: 'account_backup',
  })
  usePreferences.getState().set({
    onboardingComplete: true,
    onboardingStepId: null,
    hasCompletedMapOnboarding: true,
  })
  useProfile.getState().set({ hasCompletedProfileSetup: true })
}
