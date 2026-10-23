import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ appState: 'active' }))

vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return native.appState
    },
  },
}))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
}))
vi.mock('@/features/pet/components/PetUnlockArt', () => ({
  default: () => null,
}))
vi.mock('@/features/pet/lib/unlockNews', () => ({
  petUnlockKey: (item: string) => `pet-item:${item}`,
  unlockText: (item: string) => ({
    eyebrow: 'pet.unlock.newHat',
    title: item,
    message: 'pet.unlock.hatReady',
  }),
}))

import { announcePetUnlocks } from '@/features/pet/lib/unlockAnnounce'
import { showPetUnlockToasts } from '@/features/pet/lib/unlockToasts'
import {
  settlePetUnlocks,
  usePetUnlockNews,
} from '@/features/pet/stores/petUnlockNews'
import { noteUserAction, resetUserActions } from '@/lib/userAction'
import { resetToasts, toast, useToasts } from '@/stores/toasts'

const NOW = 1_800_000_000_000

beforeEach(() => {
  native.appState = 'active'
  resetUserActions()
  resetToasts()
  usePetUnlockNews.setState({ unseen: [], revealing: null, toasting: null })
})

/** Shows what `PetUnlockRevealHost` would, as it does. */
const showRequested = () => {
  const { toasting } = usePetUnlockNews.getState()
  if (toasting)
    showPetUnlockToasts(toasting.items, toasting.petName, toasting.expiresAt)
}

describe('announcePetUnlocks: the action rule', () => {
  it("asks for an unlock toast for an item the User's action just opened", () => {
    noteUserAction('time', NOW - 500)
    announcePetUnlocks(['hat:beret'], 'Pip', NOW)
    expect(usePetUnlockNews.getState().toasting).toEqual({
      items: ['hat:beret'],
      petName: 'Pip',
      expiresAt: NOW - 500 + 15_000,
    })
    showRequested()
    const [unlock] = useToasts.getState().toasts
    expect(unlock.intent).toBe('unlock')
    expect(unlock.key).toBe('pet-item:hat:beret')
    // Still news until it's opened or swiped away.
    expect(usePetUnlockNews.getState().unseen).toEqual([
      { item: 'hat:beret', at: NOW },
    ])
  })

  it('files an item from elsewhere in the tray only', () => {
    announcePetUnlocks(['floor:stone'], 'Pip', NOW)
    expect(usePetUnlockNews.getState().toasting).toBeNull()
    expect(usePetUnlockNews.getState().unseen).toHaveLength(1)
  })

  it('stays quiet in the background', () => {
    noteUserAction('time', NOW - 500)
    native.appState = 'background'
    announcePetUnlocks(['hat:beret'], 'Pip', NOW)
    expect(usePetUnlockNews.getState().toasting).toBeNull()
  })

  it('settles an item swiped away, and keeps one that timed out or was opened', () => {
    noteUserAction('time', NOW - 500)
    announcePetUnlocks(['hat:beret', 'floor:stone', 'hat:cap'], 'Pip', NOW)
    showRequested()
    const [beret, stone, cap] = useToasts.getState().toasts
    toast.dismiss(beret.id, 'swiped')
    toast.dismiss(stone.id, 'timeout')
    // Opened: its reveal settles it when it closes.
    toast.dismiss(cap.id, 'opened')
    expect(usePetUnlockNews.getState().unseen.map((u) => u.item)).toEqual([
      'floor:stone',
      'hat:cap',
    ])
    settlePetUnlocks(['floor:stone', 'hat:cap'])
    expect(usePetUnlockNews.getState().unseen).toEqual([])
  })
})
