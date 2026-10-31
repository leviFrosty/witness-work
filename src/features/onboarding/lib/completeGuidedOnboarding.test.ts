import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PASSKEY_PROMPT_INITIAL,
  type PasskeyPromptState,
} from '@/lib/passkeys/promptRules'

const runtime = vi.hoisted(() => ({
  prefs: {
    onboardingComplete: false,
    onboardingStepId: 'founderNote' as string | null,
    onboardingPasskeysOffered: false as boolean | null,
    passkeyPrompt: undefined as unknown as PasskeyPromptState,
  },
}))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
// A new install: no account yet when onboarding ends.
vi.mock('@/lib/serverAccount', () => ({
  accountSessions: { snapshot: () => null },
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: {
    getState: () => ({
      ...runtime.prefs,
      set: (partial: object) => Object.assign(runtime.prefs, partial),
    }),
    setState: (partial: object) => Object.assign(runtime.prefs, partial),
  },
}))

import { completeGuidedOnboarding } from '@/features/onboarding/lib/completeGuidedOnboarding'
import { analytics } from '@/lib/analytics'

beforeEach(() => {
  vi.clearAllMocks()
  runtime.prefs.passkeyPrompt = PASSKEY_PROMPT_INITIAL
})

describe('completeGuidedOnboarding', () => {
  it('ends onboarding and earns the gentle passkey prompt on a new install', () => {
    completeGuidedOnboarding()
    expect(runtime.prefs).toMatchObject({
      onboardingComplete: true,
      onboardingStepId: null,
      onboardingPasskeysOffered: null,
    })
    expect(runtime.prefs.passkeyPrompt.earned).toMatchObject({
      reason: 'onboarding',
      shown: false,
    })
    expect(analytics.capture).toHaveBeenCalledWith('onboarding_completed', {
      completion_method: 'guided',
    })
  })

  it('earns nothing after the step’s Not Now backed it off', () => {
    runtime.prefs.passkeyPrompt = {
      ...PASSKEY_PROMPT_INITIAL,
      notNowAt: Date.now() - 1000,
    }
    completeGuidedOnboarding()
    expect(runtime.prefs.passkeyPrompt.earned).toBeNull()
  })

  it('earns nothing once a passkey was saved', () => {
    runtime.prefs.passkeyPrompt = { ...PASSKEY_PROMPT_INITIAL, stopped: true }
    completeGuidedOnboarding()
    expect(runtime.prefs.passkeyPrompt.earned).toBeNull()
  })
})
