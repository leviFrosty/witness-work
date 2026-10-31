import { earnPasskeyPrompt } from '@/app/account/passkeyPrompt'
import { analytics } from '@/lib/analytics'
import { usePreferences } from '@/stores/preferences'

/**
 * The User went through every onboarding step. On a new install the server
 * account exists only now, so this is when it can first be offered a passkey:
 * the tray's gentle prompt waits for it (ADR 0038 §9). Someone who already
 * answered the Save a Passkey step (saved one, or said Not Now) isn't asked
 * again; the prompt's own rules see to that.
 */
export function completeGuidedOnboarding(): void {
  usePreferences.getState().set({
    onboardingComplete: true,
    onboardingStepId: null,
    onboardingPasskeysOffered: null,
  })
  earnPasskeyPrompt('onboarding')
  analytics.capture('onboarding_completed', { completion_method: 'guided' })
}
