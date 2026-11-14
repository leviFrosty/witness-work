import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/pet/lib/unlockAnnounce', () => ({
  announcePetUnlocks: vi.fn(),
}))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    clearAll() {}
  },
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/features/pet/components/PetRewardChip', () => ({
  rewardIcon: () => null,
}))
vi.mock('@/stores/rewardStack', () => ({ startReward: vi.fn(() => 1) }))
vi.mock('@/features/pet/lib/walletNow', () => ({ petEarningsNow: () => null }))
vi.mock('@/features/profile/stores/streakCelebration', () => ({
  useStreakCelebration: { setState: vi.fn() },
}))
vi.mock('@/stores/preferences', () => {
  const state = { petPromptDismissed: false, set: vi.fn() }
  return { usePreferences: { getState: () => state } }
})

import usePet from '@/stores/pet'
import { petHarness } from '@/app/dev-harness/pet'
import { usePetSession } from '@/features/pet/stores/petSession'

describe('__WW_DEV__.pet', () => {
  beforeEach(() => {
    usePet.getState()._WARNING_forceDeletePet()
    usePetSession.setState({
      entrance: null,
      command: null,
      devOverride: null,
      devSnapshot: null,
    })
  })

  it('adopts, replacing an earlier pet, and asks for an entrance', () => {
    petHarness.adopt('cat', 'calico', 'Pip')
    petHarness.adopt('dog')
    expect(usePet.getState().pet).toMatchObject({
      species: 'dog',
      coat: 'gold',
    })
    expect(usePet.getState().pet?.name).toBeUndefined()
    expect(usePetSession.getState().entrance).toBe('dog')
  })

  it('rejects an unknown species', () => {
    expect(() => petHarness.adopt('dragon')).toThrow(/Unknown species/)
  })

  it('merges overrides and clears them', () => {
    petHarness.override({ hearts: 2 })
    petHarness.override({ star: true })
    expect(petHarness.state().override).toEqual({ hearts: 2, star: true })
    petHarness.clearOverride()
    expect(petHarness.state().override).toBeNull()
  })

  it('sets the coins left to spend, on top of what is bought', () => {
    petHarness.adopt('cat')
    expect(petHarness.coins(500).override).toMatchObject({ wallet: 500 })

    const pet = usePet.getState().pet!
    usePet.setState({
      pet: {
        ...pet,
        purchases: [{ item: 'hat:bow', price: 12, on: '2026-10-05' }],
      },
    })

    expect(petHarness.coins(500).override).toMatchObject({ wallet: 620 })
    expect(petHarness.coins(0).override).toMatchObject({ wallet: 120 })
  })

  it('goes back to the real coins, keeping the other fakes', () => {
    petHarness.adopt('cat')
    petHarness.override({ hearts: 2 })
    petHarness.coins(500)
    expect(petHarness.coins(null).override).toEqual({
      hearts: 2,
      wallet: undefined,
    })
  })

  it('rejects coins without a pet, and amounts that are not whole', () => {
    expect(() => petHarness.coins(100)).toThrow(/No pet/)
    petHarness.adopt('cat')
    expect(() => petHarness.coins(-1)).toThrow(/whole number/)
    expect(() => petHarness.coins(1.5)).toThrow(/whole number/)
  })

  it('sends motions and pats to the card', () => {
    petHarness.play('trick')
    expect(usePetSession.getState().command).toMatchObject({ kind: 'trick' })
    petHarness.pat(15)
    expect(usePetSession.getState().command).toMatchObject({
      kind: 'pat',
      count: 15,
    })
  })

  it('plays an entrance at once when the card is up', () => {
    petHarness.adopt('lamb')
    usePetSession.setState({ entrance: null, devSnapshot: {} })
    petHarness.setAppearance('donkey')
    expect(usePet.getState().pet?.species).toBe('donkey')
    expect(usePetSession.getState().command).toMatchObject({ kind: 'entrance' })

    expect(usePetSession.getState().entrance).toBe('donkey')
  })
})
