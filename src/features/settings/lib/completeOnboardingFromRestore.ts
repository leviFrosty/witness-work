import { analytics } from '@/lib/analytics'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'

export type RestoreCompletionMethod =
  | 'account_backup'
  | 'backup_restore'
  | 'icloud_restore'
  | 'cloud_sync'

export function completeOnboardingFromRestore(method: RestoreCompletionMethod) {
  analytics.capture('onboarding_completed', { completion_method: method })
  usePreferences.getState().set({
    onboardingComplete: true,
    onboardingStepId: null,
    onboardingPasskeysOffered: null,
    hasCompletedMapOnboarding: true,
  })
  useProfile.getState().set({ hasCompletedProfileSetup: true })
}
