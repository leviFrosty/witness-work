import { describe, expect, it } from 'vitest'
import {
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
  ROOM_PART_OPTIONS,
  STARTER_ROOM_ITEMS,
  UNLOCK_ORDER,
  type PetRecord,
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

  it('grows by streak only while there is a streak to grow', () => {
    expect(
      unlockMode({ showStreaks: true, kind: 'plans', hasPlans: true })
    ).toBe('streak')
    expect(
      unlockMode({ showStreaks: true, kind: 'plans', hasPlans: false })
    ).toBe('months')
    // A months streak needs no Plans.
    expect(
      unlockMode({ showStreaks: true, kind: 'months', hasPlans: false })
    ).toBe('streak')
    expect(
      unlockMode({ showStreaks: false, kind: 'plans', hasPlans: true })
    ).toBe('months')
    expect(
      unlockMode({ showStreaks: false, kind: 'months', hasPlans: true })
    ).toBe('months')
  })

  it('earns the items whose threshold the streak reaches, by kind', () => {
    const plans = (count: number) =>
      roomItemsEarnedBy({ mode: 'streak', kind: 'plans', count })
    expect(plans(0)).toEqual([])
    expect(plans(1)).toEqual([UNLOCK_ORDER[0]])
    expect(plans(6)).toEqual(UNLOCK_ORDER.slice(0, 4))
    expect(plans(7)).toEqual(UNLOCK_ORDER.slice(0, 5))
    expect(plans(119)).toEqual(UNLOCK_ORDER.slice(0, 16))
    expect(plans(120)).toEqual(UNLOCK_ORDER)

    const months = (count: number) =>
      roomItemsEarnedBy({ mode: 'streak', kind: 'months', count })
    expect(months(1)).toEqual(UNLOCK_ORDER.slice(0, 1))
    expect(months(2)).toEqual(UNLOCK_ORDER.slice(0, 3))
    expect(months(6)).toEqual(UNLOCK_ORDER.slice(0, 10))
    expect(months(12)).toEqual(UNLOCK_ORDER)
  })

  it('earns one item per active month in months mode', () => {
    const byMonths = (activeMonths: number) =>
      roomItemsEarnedBy({ mode: 'months', activeMonths })
    expect(byMonths(0)).toEqual([])
    expect(byMonths(3)).toEqual(UNLOCK_ORDER.slice(0, 3))
    expect(byMonths(100)).toEqual(UNLOCK_ORDER)
    expect(byMonths(-2)).toEqual([])
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
    const unlocked = unlockedRoomItems([], [])
    expect(isRoomOptionUnlocked('sign', 'convos', unlocked)).toBe(true)
    expect(isRoomOptionUnlocked('window', 'night', unlocked)).toBe(true)
    expect(isRoomOptionUnlocked('floor', 'wood', unlocked)).toBe(true)
    expect(isRoomOptionUnlocked('floor', 'tile', unlocked)).toBe(false)
  })
})
