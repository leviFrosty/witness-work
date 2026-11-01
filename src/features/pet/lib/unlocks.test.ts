import { describe, expect, it } from 'vitest'
import {
  isRoomOptionUnlocked,
  roomItemsToStore,
  storedPurchases,
  storedRoomItems,
  unlockedRoomItems,
} from '@/features/pet/lib/unlocks'
import {
  HAT_UNLOCK_ORDER,
  ROOM_PART_OPTIONS,
  SECRET_ROOM_ITEMS,
  STARTER_ROOM_ITEMS,
  UNLOCK_ORDER,
  type PetPurchase,
  type PetRecord,
  type UnlockableRoomPart,
} from '@/types/pet'

const bought = (item: string): PetPurchase => ({
  item,
  price: 5,
  on: '2026-10-01',
})

describe('room unlocks', () => {
  it('lists every unlockable option once: a starter, in an order, or secret', () => {
    const parts = Object.keys(ROOM_PART_OPTIONS).filter(
      (part) => part !== 'sign'
    ) as UnlockableRoomPart[]
    const every = parts.flatMap((part) =>
      ROOM_PART_OPTIONS[part].map((option) => `${part}:${option}`)
    )
    const listed = [
      ...STARTER_ROOM_ITEMS,
      ...UNLOCK_ORDER,
      ...HAT_UNLOCK_ORDER,
      ...SECRET_ROOM_ITEMS,
    ]
    expect(new Set(listed).size).toBe(listed.length)
    expect([...listed].sort()).toEqual([...every].sort())
  })

  it('mixes parts so the same part never unlocks twice in a row', () => {
    for (let i = 1; i < UNLOCK_ORDER.length; i++)
      expect(UNLOCK_ORDER[i].split(':')[0]).not.toBe(
        UNLOCK_ORDER[i - 1].split(':')[0]
      )
  })

  it('has at least twelve hats', () => {
    expect(HAT_UNLOCK_ORDER.length).toBeGreaterThanOrEqual(12)
    for (const item of HAT_UNLOCK_ORDER) expect(item).toMatch(/^hat:/)
  })

  it('reads the stored items, none for an older or damaged record', () => {
    expect(storedRoomItems(null)).toEqual([])
    expect(storedRoomItems({})).toEqual([])
    expect(
      storedRoomItems({
        earnedRoomItems: [UNLOCK_ORDER[0], 7, 'floor:marble'],
      } as unknown as PetRecord)
    ).toEqual([UNLOCK_ORDER[0], 'floor:marble'])
    expect(
      storedRoomItems({
        earnedRoomItems: 'bed:cushion',
      } as unknown as PetRecord)
    ).toEqual([])
  })

  it('unlocks the starters, the stored items and what is earned now', () => {
    expect([...unlockedRoomItems([], [])]).toEqual([...STARTER_ROOM_ITEMS])

    const stored = UNLOCK_ORDER.slice(0, 5)
    const unlocked = unlockedRoomItems(stored, UNLOCK_ORDER.slice(0, 2))
    expect(unlocked.size).toBe(STARTER_ROOM_ITEMS.length + 5)
    for (const item of stored) expect(unlocked.has(item)).toBe(true)
    expect(unlocked.has(UNLOCK_ORDER[5])).toBe(false)
    expect(
      unlockedRoomItems([UNLOCK_ORDER[0]], UNLOCK_ORDER.slice(0, 3)).size
    ).toBe(STARTER_ROOM_ITEMS.length + 3)
  })

  it('unlocks what is bought in the Shop', () => {
    const unlocked = unlockedRoomItems([], [], [bought('hat:cap')])
    expect(unlocked.has('hat:cap')).toBe(true)
    expect(unlocked.has('hat:bow')).toBe(false)
  })

  it('reads the stored purchases, none for an older or damaged record', () => {
    expect(storedPurchases(null)).toEqual([])
    expect(storedPurchases({})).toEqual([])
    expect(
      storedPurchases({
        purchases: [
          bought('hat:cap'),
          7,
          null,
          { item: 3 },
          { ...bought('hat:bow'), price: 'free' },
          { ...bought('hat:bow'), on: 'soon' },
        ],
      } as unknown as PetRecord)
    ).toEqual([bought('hat:cap')])
    expect(
      storedPurchases({ purchases: 'hat:cap' } as unknown as PetRecord)
    ).toEqual([])
  })

  it('stores only what is earned now and not stored yet', () => {
    expect(roomItemsToStore([], UNLOCK_ORDER.slice(0, 2))).toEqual(
      UNLOCK_ORDER.slice(0, 2)
    )
    expect(
      roomItemsToStore(UNLOCK_ORDER.slice(0, 3), UNLOCK_ORDER.slice(0, 2))
    ).toEqual([])
    expect(
      roomItemsToStore(
        ['floor:marble', UNLOCK_ORDER[0]],
        UNLOCK_ORDER.slice(0, 2)
      )
    ).toEqual([UNLOCK_ORDER[1]])
  })

  it('keeps the window and sign free', () => {
    const unlocked = unlockedRoomItems([], [])
    expect(isRoomOptionUnlocked('sign', 'convos', unlocked)).toBe(true)
    expect(isRoomOptionUnlocked('window', 'night', unlocked)).toBe(true)
    expect(isRoomOptionUnlocked('floor', 'wood', unlocked)).toBe(true)
    expect(isRoomOptionUnlocked('floor', 'tile', unlocked)).toBe(false)
    expect(isRoomOptionUnlocked('hat', 'none', unlocked)).toBe(true)
    expect(isRoomOptionUnlocked('hat', 'bow', unlocked)).toBe(false)
  })
})
