import { describe, expect, it } from 'vitest'
import {
  isRoomOptionUnlocked,
  nextUnlockIn,
  unlockedRoomItems,
} from '@/features/pet/lib/unlocks'
import {
  ROOM_PART_OPTIONS,
  STARTER_ROOM_ITEMS,
  UNLOCK_ORDER,
  type UnlockableRoomPart,
} from '@/types/pet'

describe('room unlocks', () => {
  it('lists every unlockable option once, starters or in the order', () => {
    const parts = Object.keys(ROOM_PART_OPTIONS).filter(
      (part) => part !== 'sign'
    ) as UnlockableRoomPart[]
    const every = parts.flatMap((part) =>
      ROOM_PART_OPTIONS[part].map((option) => `${part}:${option}`)
    )
    const listed = [...STARTER_ROOM_ITEMS, ...UNLOCK_ORDER]
    expect(new Set(listed).size).toBe(listed.length)
    expect([...listed].sort()).toEqual([...every].sort())
  })

  it('mixes parts so the same part never unlocks twice in a row', () => {
    for (let i = 1; i < UNLOCK_ORDER.length; i++)
      expect(UNLOCK_ORDER[i].split(':')[0]).not.toBe(
        UNLOCK_ORDER[i - 1].split(':')[0]
      )
  })

  it('starts with the starters and adds one item per active month', () => {
    expect([...unlockedRoomItems(0)]).toEqual([...STARTER_ROOM_ITEMS])
    const three = unlockedRoomItems(3)
    expect(three.size).toBe(STARTER_ROOM_ITEMS.length + 3)
    for (const item of UNLOCK_ORDER.slice(0, 3))
      expect(three.has(item)).toBe(true)
    expect(three.has(UNLOCK_ORDER[3])).toBe(false)
    expect(unlockedRoomItems(100).size).toBe(
      STARTER_ROOM_ITEMS.length + UNLOCK_ORDER.length
    )
    expect(unlockedRoomItems(-2).size).toBe(STARTER_ROOM_ITEMS.length)
  })

  it('says how many active months until an item unlocks', () => {
    expect(nextUnlockIn('floor:wood', 0)).toBe(0)
    expect(nextUnlockIn(UNLOCK_ORDER[0], 0)).toBe(1)
    expect(nextUnlockIn(UNLOCK_ORDER[0], 1)).toBe(0)
    expect(nextUnlockIn(UNLOCK_ORDER[4], 2)).toBe(3)
    expect(nextUnlockIn(UNLOCK_ORDER.at(-1)!, 0)).toBe(UNLOCK_ORDER.length)
    expect(nextUnlockIn('floor:marble', 0)).toBeNull()
  })

  it('keeps the window and sign free', () => {
    const unlocked = unlockedRoomItems(0)
    expect(isRoomOptionUnlocked('sign', 'convos', unlocked)).toBe(true)
    expect(isRoomOptionUnlocked('window', 'night', unlocked)).toBe(true)
    expect(isRoomOptionUnlocked('floor', 'wood', unlocked)).toBe(true)
    expect(isRoomOptionUnlocked('floor', 'tile', unlocked)).toBe(false)
  })
})
