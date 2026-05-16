import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import { useProfile, PROFILE_DEFAULTS } from '@/stores/profile'

describe('useProfile store', () => {
  beforeEach(() => {
    // Reset to defaults between tests. Using setState directly bypasses
    // the stamping wrapper so we can start each test from a clean slate.
    useProfile.setState({ ...PROFILE_DEFAULTS, profileUpdatedAt: {} })
  })

  it('exposes the expected default shape', () => {
    const state = useProfile.getState()
    expect(state.name).toBe('')
    expect(state.avatar).toEqual({ type: 'none', value: '' })
    expect(state.customAvatarBackground).toBeNull()
    expect(state.hasCompletedProfileSetup).toBe(false)
  })

  it('sets the name through the setter', () => {
    useProfile.getState().setName('Alice')
    expect(useProfile.getState().name).toBe('Alice')
  })

  it('sets the avatar through the setter', () => {
    useProfile.getState().setAvatar({ type: 'emoji', value: '🌱' })
    expect(useProfile.getState().avatar).toEqual({
      type: 'emoji',
      value: '🌱',
    })
  })

  it('stamps profileUpdatedAt on syncable field writes', () => {
    const before = Date.now()
    useProfile.getState().set({ name: 'Bob' })
    const after = Date.now()
    const stamp = useProfile.getState().profileUpdatedAt.name
    expect(stamp).toBeDefined()
    expect(stamp).toBeGreaterThanOrEqual(before)
    expect(stamp).toBeLessThanOrEqual(after)
  })

  it('updates the customAvatarBackground field', () => {
    useProfile.getState().set({ customAvatarBackground: '#112233' })
    expect(useProfile.getState().customAvatarBackground).toBe('#112233')
  })

  it('flips hasCompletedProfileSetup independently of other fields', () => {
    useProfile.getState().set({ hasCompletedProfileSetup: true })
    expect(useProfile.getState().hasCompletedProfileSetup).toBe(true)
    expect(useProfile.getState().name).toBe('') // unchanged
  })
})
