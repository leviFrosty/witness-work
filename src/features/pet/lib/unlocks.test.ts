import { describe, expect, it } from 'vitest'
import {
  HAT_THRESHOLDS,
  isRoomOptionUnlocked,
  nextUnlockIn,
  roomItemsEarnedBy,
  roomItemsToStore,
  storedRoomItems,
  STREAK_THRESHOLDS,
  unlockedRoomItems,
  unlockMode,
  unlockStreakFor,
} from '@/features/pet/lib/unlocks'
import {
  HAT_UNLOCK_ORDER,
  ROOM_PART_OPTIONS,
  SECRET_ROOM_ITEMS,
  STARTER_ROOM_ITEMS,
  UNLOCK_ORDER,
  type PetRecord,
  type UnlockableRoomPart,
} from '@/types/pet'

/** The room items of a list, without hats. */
const roomOnly = (items: readonly string[]) =>
  items.filter((item) => !item.startsWith('hat:'))
/** The hats of a list. */
const hatsOnly = (items: readonly string[]) =>
  items.filter((item) => item.startsWith('hat:'))

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

  it.each(['plans', 'months'] as const)(
    'gives every item a rising %s streak threshold, from 1',
    (kind) => {
      const thresholds = STREAK_THRESHOLDS[kind]
      expect(thresholds).toHaveLength(UNLOCK_ORDER.length)
      expect(thresholds[0]).toBe(1)
      for (let i = 1; i < thresholds.length; i++)
        expect(thresholds[i]).toBeGreaterThanOrEqual(thresholds[i - 1])
    }
  )

  it('has at least twelve hats: three quick ones, then slower', () => {
    expect(HAT_UNLOCK_ORDER.length).toBeGreaterThanOrEqual(12)
    for (const item of HAT_UNLOCK_ORDER) expect(item).toMatch(/^hat:/)
    expect(HAT_THRESHOLDS.plans.slice(0, 3)).toEqual([3, 5, 9])
    for (const counts of Object.values(HAT_THRESHOLDS)) {
      expect(counts).toHaveLength(HAT_UNLOCK_ORDER.length)
      for (let i = 1; i < counts.length; i++)
        expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1])
    }
    // After the three gimmes, each step is longer than the one before it.
    const plans = HAT_THRESHOLDS.plans
    for (let i = 4; i < plans.length; i++)
      expect(plans[i] - plans[i - 1]).toBeGreaterThanOrEqual(
        plans[i - 1] - plans[i - 2]
      )
  })

  it('grows by streak while streaks show, and by months while hidden', () => {
    expect(unlockMode({ showStreaks: true })).toBe('streak')
    expect(unlockMode({ showStreaks: false })).toBe('months')
  })

  it('earns the items whose threshold the streak reaches, by kind', () => {
    const plans = (count: number) =>
      roomOnly(roomItemsEarnedBy({ mode: 'streak', kind: 'plans', count }))
    expect(plans(0)).toEqual([])
    expect(plans(1)).toEqual([UNLOCK_ORDER[0]])
    expect(plans(6)).toEqual(UNLOCK_ORDER.slice(0, 4))
    expect(plans(7)).toEqual(UNLOCK_ORDER.slice(0, 5))
    expect(plans(119)).toEqual(UNLOCK_ORDER.slice(0, 16))
    expect(plans(120)).toEqual(UNLOCK_ORDER)

    const months = (count: number) =>
      roomOnly(roomItemsEarnedBy({ mode: 'streak', kind: 'months', count }))
    expect(months(1)).toEqual(UNLOCK_ORDER.slice(0, 1))
    expect(months(2)).toEqual(UNLOCK_ORDER.slice(0, 3))
    expect(months(6)).toEqual(UNLOCK_ORDER.slice(0, 10))
    expect(months(12)).toEqual(UNLOCK_ORDER)
  })

  it('earns hats on their own counts, after the room items', () => {
    const plans = (count: number) =>
      roomItemsEarnedBy({ mode: 'streak', kind: 'plans', count })
    expect(hatsOnly(plans(2))).toEqual([])
    expect(hatsOnly(plans(3))).toEqual(['hat:bow'])
    expect(hatsOnly(plans(9))).toEqual(HAT_UNLOCK_ORDER.slice(0, 3))
    expect(hatsOnly(plans(120))).toEqual(HAT_UNLOCK_ORDER)
    expect(plans(9)).toEqual([
      ...UNLOCK_ORDER.slice(0, 5),
      ...HAT_UNLOCK_ORDER.slice(0, 3),
    ])
    const months = (count: number) =>
      hatsOnly(roomItemsEarnedBy({ mode: 'streak', kind: 'months', count }))
    expect(months(1)).toEqual(HAT_UNLOCK_ORDER.slice(0, 3))
    expect(months(12)).toEqual(HAT_UNLOCK_ORDER)
  })

  it('earns one item per active month in months mode', () => {
    const byMonths = (activeMonths: number) =>
      roomItemsEarnedBy({ mode: 'months', activeMonths })
    expect(byMonths(0)).toEqual([])
    expect(roomOnly(byMonths(3))).toEqual(UNLOCK_ORDER.slice(0, 3))
    expect(roomOnly(byMonths(100))).toEqual(UNLOCK_ORDER)
    expect(byMonths(-2)).toEqual([])
    // The first three hats come with the first active month.
    expect(hatsOnly(byMonths(1))).toEqual(HAT_UNLOCK_ORDER.slice(0, 3))
    // Then one more each active month.
    for (let month = 2; month <= 10; month++)
      expect(hatsOnly(byMonths(month))).toEqual(
        HAT_UNLOCK_ORDER.slice(0, month + 2)
      )
    expect(hatsOnly(byMonths(100))).toEqual(HAT_UNLOCK_ORDER)
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
    // Earned on a long streak that has since ended: still open.
    const stored = UNLOCK_ORDER.slice(0, 5)
    const unlocked = unlockedRoomItems(stored, UNLOCK_ORDER.slice(0, 2))
    expect(unlocked.size).toBe(STARTER_ROOM_ITEMS.length + 5)
    for (const item of stored) expect(unlocked.has(item)).toBe(true)
    expect(unlocked.has(UNLOCK_ORDER[5])).toBe(false)
    expect(
      unlockedRoomItems([UNLOCK_ORDER[0]], UNLOCK_ORDER.slice(0, 3)).size
    ).toBe(STARTER_ROOM_ITEMS.length + 3)
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

  it('says which streak count opens an item', () => {
    expect(unlockStreakFor('floor:wood', 'plans')).toBe(0)
    expect(unlockStreakFor(UNLOCK_ORDER[0], 'plans')).toBe(1)
    expect(unlockStreakFor(UNLOCK_ORDER[4], 'plans')).toBe(7)
    expect(unlockStreakFor(UNLOCK_ORDER[4], 'months')).toBe(3)
    expect(unlockStreakFor(UNLOCK_ORDER.at(-1)!, 'plans')).toBe(120)
    expect(unlockStreakFor(UNLOCK_ORDER.at(-1)!, 'months')).toBe(12)
    expect(unlockStreakFor('floor:marble', 'plans')).toBeNull()
    expect(unlockStreakFor('hat:none', 'plans')).toBe(0)
    expect(unlockStreakFor('hat:cap', 'plans')).toBe(5)
    expect(unlockStreakFor('hat:tophat', 'plans')).toBe(120)
    expect(unlockStreakFor('hat:cap', 'months')).toBe(1)
    expect(unlockStreakFor('hat:crown', 'plans')).toBeNull()
  })

  it('says how many active months until an item unlocks', () => {
    expect(nextUnlockIn('floor:wood', 0)).toBe(0)
    expect(nextUnlockIn(UNLOCK_ORDER[0], 0)).toBe(1)
    expect(nextUnlockIn(UNLOCK_ORDER[0], 1)).toBe(0)
    expect(nextUnlockIn(UNLOCK_ORDER[4], 2)).toBe(3)
    expect(nextUnlockIn(UNLOCK_ORDER.at(-1)!, 0)).toBe(UNLOCK_ORDER.length)
    expect(nextUnlockIn('floor:marble', 0)).toBeNull()
    expect(nextUnlockIn('hat:bow', 0)).toBe(1)
    expect(nextUnlockIn('hat:beanie', 1)).toBe(0)
    expect(nextUnlockIn('hat:tophat', 2)).toBe(8)
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
