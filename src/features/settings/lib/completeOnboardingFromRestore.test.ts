import { describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  prefs: {
    onboardingComplete: false,
    onboardingStepId: 'pickUpWhereLeftOff' as string | null,
    onboardingPasskeysOffered: true as boolean | null,
    hasCompletedMapOnboarding: false,
  },
  profile: { hasCompletedProfileSetup: false },
}))

vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: {
    getState: () => ({
      set: (partial: object) => Object.assign(runtime.prefs, partial),
    }),
  },
}))
vi.mock('@/stores/profile', () => ({
  useProfile: {
    getState: () => ({
      set: (partial: object) => Object.assign(runtime.profile, partial),
    }),
  },
}))

import { completeOnboardingFromRestore } from '@/features/settings/lib/completeOnboardingFromRestore'
import { analytics } from '@/lib/analytics'

describe('completeOnboardingFromRestore', () => {
  it('ends onboarding and forgets whether its passkey step was offered', () => {
    completeOnboardingFromRestore('account_backup')
    expect(runtime.prefs).toEqual({
      onboardingComplete: true,
      onboardingStepId: null,
      onboardingPasskeysOffered: null,
      hasCompletedMapOnboarding: true,
    })
    expect(runtime.profile.hasCompletedProfileSetup).toBe(true)
  })

  it.each(['account_backup', 'backup_restore', 'icloud_restore'] as const)(
    'reports how it ended: %s',
    (method) => {
      completeOnboardingFromRestore(method)
      expect(analytics.capture).toHaveBeenLastCalledWith(
        'onboarding_completed',
        { completion_method: method }
      )
    }
  )
})
