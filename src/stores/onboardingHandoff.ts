import { create } from 'zustand'

/**
 * One-shot, in-memory signal that lets a screen pushed _over_ the onboarding
 * flow (currently the Notes Import composer, opened from the "From Notes" step)
 * ask onboarding to advance to its next step.
 *
 * Why a store rather than a navigation-param callback: the composer is a
 * sibling route rendered above `Onboarding`, so it has no direct handle on
 * onboarding's `goNext`. Function params would also trip React Navigation's
 * non-serializable-params warning. This stays ephemeral (never persisted) —
 * it's a transient request, not durable state. Onboarding consumes it
 * synchronously, so it can't double-fire across re-renders.
 */
interface OnboardingHandoffState {
  continueRequested: boolean
  /** Composer asks onboarding to move on (then it dismisses itself). */
  requestContinue: () => void
  /** Onboarding acknowledges and clears the request. */
  consumeContinue: () => void
}

export const useOnboardingHandoff = create<OnboardingHandoffState>((set) => ({
  continueRequested: false,
  requestContinue: () => set({ continueRequested: true }),
  consumeContinue: () => set({ continueRequested: false }),
}))
