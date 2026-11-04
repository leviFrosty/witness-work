import { analytics } from '@/lib/analytics'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'

/**
 * How the records came back: onboarding's "Pick up where you left off", or
 * Cloud Sync in a browser that just signed in.
 */
export type RestoreCompletionMethod =
  | 'account_backup'
  | 'backup_restore'
  | 'icloud_restore'
  | 'cloud_sync'

/**
 * Finishes onboarding after a restore brought the User's records back: the
 * account's backup or Cloud Sync ("From your other phone", a recovery key), a
 * backup file, or iCloud. The restored profile and preferences replace what the
 * remaining steps would set, so they aren't asked again. Onboarding ends before
 * its Save a Passkey step, and a restore earns no passkey prompt (ADR 0038 §9).
 * A browser that just signed in and pulled the account's Cloud Sync data
 * finishes it the same way (`cloud_sync`).
 */
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
