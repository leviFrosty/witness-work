import { describe, expect, it, beforeEach, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('@/lib/locales', () => ({
  default: { t: (k: string) => k },
}))

// Replace the React-aware `useProfile` hook with a plain function reading
// directly from the underlying zustand store. The store itself is still real
// (so `setName` / `set` exercise the same stamping wrapper), but calling
// `useProfile()` no longer goes through `useSyncExternalStore` — which keeps
// the hook callable outside a React tree.
vi.mock('@/stores/profile', async () => {
  const actual =
    await vi.importActual<typeof import('@/stores/profile')>('@/stores/profile')
  const useProfile = ((selector?: (s: unknown) => unknown) => {
    const state = actual.useProfile.getState()
    return selector ? selector(state) : state
  }) as unknown as typeof actual.useProfile
  Object.assign(useProfile, actual.useProfile)
  return { ...actual, useProfile }
})

import { useProfile, PROFILE_DEFAULTS } from '@/stores/profile'
import useUser from '@/hooks/useUser'
import i18n from '@/lib/locales'

describe('useUser', () => {
  beforeEach(() => {
    useProfile.setState({ ...PROFILE_DEFAULTS, profileUpdatedAt: {} })
  })

  it('falls back to the localized greeting when no name is set', () => {
    const user = useUser()
    expect(user.name).toBe('')
    expect(user.hasName).toBe(false)
    expect(user.displayName).toBe(i18n.t('profileGreetingNoName'))
  })

  it('treats a whitespace-only name as unset', () => {
    useProfile.getState().setName('   ')
    const user = useUser()
    expect(user.name).toBe('')
    expect(user.hasName).toBe(false)
    expect(user.displayName).toBe(i18n.t('profileGreetingNoName'))
  })

  it('returns the trimmed name and uses it as the display name', () => {
    useProfile.getState().setName('  Alice  ')
    const user = useUser()
    expect(user.name).toBe('Alice')
    expect(user.hasName).toBe(true)
    expect(user.displayName).toBe('Alice')
  })

  it('reacts to the Profile store updating between calls', () => {
    expect(useUser().hasName).toBe(false)
    useProfile.getState().setName('Bob')
    expect(useUser()).toMatchObject({
      name: 'Bob',
      hasName: true,
      displayName: 'Bob',
    })
    useProfile.getState().setName('')
    expect(useUser().hasName).toBe(false)
  })

  it('passes through avatar, customAvatarBackground, and setup flag', () => {
    useProfile.getState().set({
      avatar: { type: 'emoji', value: '🌱' },
      customAvatarBackground: '#112233',
      hasCompletedProfileSetup: true,
    })
    const user = useUser()
    expect(user.avatar).toEqual({ type: 'emoji', value: '🌱' })
    expect(user.customAvatarBackground).toBe('#112233')
    expect(user.hasCompletedProfileSetup).toBe(true)
  })
})
