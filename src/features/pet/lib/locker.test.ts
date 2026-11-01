import { describe, expect, it } from 'vitest'
import { DEFAULT_ROOM } from '@/types/pet'
import {
  hasNewRoomItem,
  isNewOption,
  lockerSections,
  tabsWithNew,
} from '@/features/pet/lib/locker'
import { unlockedRoomItems } from '@/features/pet/lib/unlocks'

const never = () => false

describe('lockerSections', () => {
  it('lists only what’s owned, and how many more the Shop sells', () => {
    const unlocked = unlockedRoomItems(
      ['hat:duck'],
      [],
      [{ item: 'hat:cap', price: 12, on: '2026-10-01' }]
    )
    const [hats] = lockerSections('hat', DEFAULT_ROOM, unlocked)
    expect(hats.part).toBe('hat')
    expect(hats.current).toBe('none')
    expect(hats.owned).toEqual(['none', 'cap', 'duck'])

    expect(hats.forSale).toBe(11)
    expect(hats.nextForSale).toBe('hat:bow')
  })

  it('keeps the one in use even if it isn’t owned', () => {
    const [floors] = lockerSections(
      'floor',
      { ...DEFAULT_ROOM, floor: 'tile' },
      unlockedRoomItems([], [])
    )
    expect(floors.owned).toEqual(['wood', 'tile'])
  })

  it('splits the wall, and has nothing to buy for the sign', () => {
    const none = unlockedRoomItems([], [])
    expect(
      lockerSections('wall', DEFAULT_ROOM, none).map(({ part }) => part)
    ).toEqual(['wallColor', 'wallPattern'])
    const [sign] = lockerSections('sign', DEFAULT_ROOM, none)
    expect(sign.forSale).toBe(0)
    expect(sign.nextForSale).toBeNull()
  })

  it('shows no parts for a live window', () => {
    expect(
      lockerSections('window', DEFAULT_ROOM, unlockedRoomItems([], []))
    ).toEqual([])
  })
})

describe('New', () => {
  it('marks owned items never picked, but no starter, free choice or one in use', () => {
    expect(isNewOption('hat', 'bow', 'none', never)).toBe(true)
    expect(isNewOption('hat', 'bow', 'none', () => true)).toBe(false)
    expect(isNewOption('hat', 'bow', 'bow', never)).toBe(false)
    expect(isNewOption('floor', 'wood', 'stone', never)).toBe(false)
    expect(isNewOption('sign', 'month', 'none', never)).toBe(false)
    expect(isNewOption('windowTime', 'dusk', 'live', never)).toBe(false)
  })

  it('names the tabs with news, and says so for Home', () => {
    const bow = unlockedRoomItems(['hat:bow'], [])
    expect([...tabsWithNew(DEFAULT_ROOM, bow, never)]).toEqual(['hat'])
    expect(hasNewRoomItem(DEFAULT_ROOM, bow, never)).toBe(true)
    expect(
      hasNewRoomItem(DEFAULT_ROOM, bow, (item) => item === 'hat:bow')
    ).toBe(false)

    expect(hasNewRoomItem({ ...DEFAULT_ROOM, hat: 'bow' }, bow, never)).toBe(
      false
    )
    expect(hasNewRoomItem(DEFAULT_ROOM, unlockedRoomItems([], []), never)).toBe(
      false
    )
  })
})
