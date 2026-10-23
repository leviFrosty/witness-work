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
    // Pending until the card takes it, which keeps the pet out of the room.
    expect(usePetSession.getState().entrance).toBe('donkey')
  })
})
