import { analytics } from '@/lib/analytics'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'

/**
 * Finishes onboarding after its "From your other phone" path restored the
 * account's backup: the restored profile and preferences replace what the
 * remaining steps would set, so they aren't asked again.
 */
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
