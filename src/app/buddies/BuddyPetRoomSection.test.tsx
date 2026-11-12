import { createElement, type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Buddy } from '@/features/buddies/lib/state'

const fake = vi.hoisted(() => ({
  petsOn: true,
  capture: vi.fn(),
}))

vi.mock('react-native-reanimated', () => {
  const passthrough = ({ children }: { children?: ReactNode }) => children
  const fade = { duration: () => fade }
  return {
    default: { View: passthrough },
    LayoutAnimationConfig: passthrough,
    FadeIn: fade,
    FadeOut: fade,
  }
})
vi.mock('@/lib/analytics', () => ({ analytics: { capture: fake.capture } }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (
    select: (state: { homeScreenElements: { pet: boolean } }) => unknown
  ) => select({ homeScreenElements: { pet: fake.petsOn } }),
}))
vi.mock('@/features/buddies/lib/buddyProfile', () => ({
  buddyDisplayName: (buddy: { name: string; nickname?: string }) =>
    buddy.nickname ?? buddy.name,
}))
vi.mock('@/lib/canvasKit/canvasKitComponent', () => ({
  canvasKitComponent: () => (props: object) => createElement('room', props),
}))

const { default: BuddyPetRoomSection } = await import(
  '@/app/buddies/BuddyPetRoomSection'
)

const maria: Buddy = {
  inboxId: 'maria',
  name: 'Maria',
  status: 'active',
  dhPub: 'd',
  inviteSecret: 's',
  colorIndex: 0,
  pairedAt: 0,
  pet: {
    species: 'cat',
    coat: 'calico',
    name: 'Pip',
    room: { floor: 'stone' },
  },
}

const rooms = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => (node.type as unknown) === 'room')

describe('a buddy’s pet room on their page', () => {
  beforeEach(() => {
    fake.petsOn = true
    fake.capture.mockClear()
  })

  it('goes away, without an error, once the buddy stops sharing their pet', () => {
    let tree!: ReactTestRenderer
    act(() => {
      tree = create(createElement(BuddyPetRoomSection, { buddy: maria }))
    })
    expect(rooms(tree)).toHaveLength(1)
    expect(rooms(tree)[0].props).toMatchObject({
      pet: maria.pet,
      ownerName: 'Maria',
    })

    act(() => {
      tree.update(
        createElement(BuddyPetRoomSection, {
          buddy: { ...maria, pet: undefined },
        })
      )
    })
    expect(rooms(tree)).toHaveLength(0)
    expect(tree.toJSON()).toBeNull()

    act(() => {
      tree.update(createElement(BuddyPetRoomSection, { buddy: maria }))
    })
    expect(rooms(tree)).toHaveLength(1)
  })

  it('shows nothing for a buddy who never shared a pet', () => {
    let tree!: ReactTestRenderer
    act(() => {
      tree = create(
        createElement(BuddyPetRoomSection, {
          buddy: { ...maria, pet: undefined },
        })
      )
    })
    expect(tree.toJSON()).toBeNull()
    expect(fake.capture).not.toHaveBeenCalled()
  })

  it('stays hidden while the pairing waits or the pet section is off Home', () => {
    let tree!: ReactTestRenderer
    act(() => {
      tree = create(
        createElement(BuddyPetRoomSection, {
          buddy: { ...maria, status: 'awaitingConfirm' },
        })
      )
    })
    expect(tree.toJSON()).toBeNull()

    fake.petsOn = false
    act(() => {
      tree.update(createElement(BuddyPetRoomSection, { buddy: maria }))
    })
    expect(tree.toJSON()).toBeNull()
  })

  it('counts a view once while the room stays up', () => {
    let tree!: ReactTestRenderer
    act(() => {
      tree = create(createElement(BuddyPetRoomSection, { buddy: maria }))
    })
    act(() => {
      tree.update(
        createElement(BuddyPetRoomSection, {
          buddy: { ...maria, pet: { ...maria.pet!, name: 'Pippin' } },
        })
      )
    })
    expect(fake.capture).toHaveBeenCalledTimes(1)
    expect(fake.capture).toHaveBeenCalledWith('buddy_pet_room_viewed')
  })
})
