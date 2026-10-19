import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ROOM,
  ROOM_PART_OPTIONS,
  STARTER_ROOM_ITEMS,
  UNLOCK_ORDER,
  type PetRoomSettings,
} from '@/types/pet'
import { SCENE_H, SCENE_W } from '@/features/pet/art'
import { unlockedRoomItems } from '@/features/pet/lib/unlocks'
import {
  isLiveWindow,
  isRoomChoiceUnlocked,
  liveWindowPatch,
  ROOM_TABS,
  ROOM_THUMB_VIEWS,
  roomChoicePatch,
  roomTabSections,
  roomWithChoice,
  selectedRoomOption,
  unlockMonthsFromNow,
} from '@/features/pet/lib/roomOptions'

const FIXED: PetRoomSettings = {
  ...DEFAULT_ROOM,
  window: { time: 'dusk', season: 'live' },
}

describe('Decorate Room options', () => {
  it('has the seven tabs in order', () => {
    expect(ROOM_TABS).toEqual([
      'window',
      'wall',
      'floor',
      'bed',
      'shelf',
      'lamp',
      'sign',
    ])
  })

  it('lists each tab’s options, the window’s only when it isn’t fully Live', () => {
    expect(roomTabSections('window', DEFAULT_ROOM)).toEqual([])
    expect(roomTabSections('window', FIXED)).toEqual([
      { part: 'windowTime', options: ['live', 'dawn', 'day', 'dusk', 'night'] },
      {
        part: 'windowSeason',
        options: ['live', 'spring', 'summer', 'autumn', 'winter'],
      },
    ])
    expect(roomTabSections('wall', DEFAULT_ROOM).map((s) => s.part)).toEqual([
      'wallColor',
      'wallPattern',
    ])
    for (const tab of ['floor', 'bed', 'shelf', 'lamp', 'sign'] as const)
      expect(roomTabSections(tab, DEFAULT_ROOM)).toEqual([
        { part: tab, options: ROOM_PART_OPTIONS[tab] },
      ])
    expect(roomTabSections('sign', DEFAULT_ROOM)[0].options).toEqual([
      'none',
      'month',
      'year',
      'shared',
      'plan',
      'convos',
    ])
  })

  it('reads and changes each part, the window’s time and season on their own', () => {
    expect(selectedRoomOption(FIXED, 'windowTime')).toBe('dusk')
    expect(selectedRoomOption(FIXED, 'windowSeason')).toBe('live')
    expect(selectedRoomOption(FIXED, 'floor')).toBe('wood')
    expect(roomChoicePatch(FIXED, 'windowSeason', 'winter')).toEqual({
      window: { time: 'dusk', season: 'winter' },
    })
    expect(roomChoicePatch(FIXED, 'windowTime', 'live')).toEqual({
      window: { time: 'live', season: 'live' },
    })
    expect(roomChoicePatch(FIXED, 'sign', 'convos')).toEqual({
      sign: 'convos',
    })
    expect(roomWithChoice(FIXED, 'floor', 'stone')).toEqual({
      ...FIXED,
      floor: 'stone',
    })
  })

  it('turns Live on for both, and off at what the window shows now', () => {
    expect(isLiveWindow(DEFAULT_ROOM.window)).toBe(true)
    expect(isLiveWindow(FIXED.window)).toBe(false)
    const now = { time: 'night', season: 'winter' } as const
    expect(liveWindowPatch(true, now)).toEqual({
      window: { time: 'live', season: 'live' },
    })
    expect(liveWindowPatch(false, now)).toEqual({
      window: { time: 'night', season: 'winter' },
    })
  })

  it('frames every thumbnail inside the scene at 8:5', () => {
    for (const [x, y, w, h] of Object.values(ROOM_THUMB_VIEWS)) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(x + w).toBeLessThanOrEqual(SCENE_W)
      expect(y + h).toBeLessThanOrEqual(SCENE_H)
      expect(w / h).toBeCloseTo(1.6)
    }
  })

  it('keeps the window and sign free and the rest by unlock', () => {
    const none = unlockedRoomItems(0)
    expect(isRoomChoiceUnlocked('windowTime', 'night', none)).toBe(true)
    expect(isRoomChoiceUnlocked('sign', 'plan', none)).toBe(true)
    expect(isRoomChoiceUnlocked('floor', 'wood', none)).toBe(true)
    expect(isRoomChoiceUnlocked('floor', 'stone', none)).toBe(false)
    const [first] = UNLOCK_ORDER
    expect(first).toBe('bed:cushion')
    expect(isRoomChoiceUnlocked('bed', 'cushion', unlockedRoomItems(1))).toBe(
      true
    )
  })

  it('says when a locked option opens up, counting this month only once it’s active', () => {
    // bed:cushion is first: one active month away.
    expect(unlockMonthsFromNow('bed', 'cushion', 0, true)).toBe(1)
    expect(unlockMonthsFromNow('bed', 'cushion', 0, false)).toBe(0)
    // floor:stone is fifth.
    expect(unlockMonthsFromNow('floor', 'stone', 2, true)).toBe(3)
    expect(unlockMonthsFromNow('floor', 'stone', 2, false)).toBe(2)
    // Free or already open: no badge.
    expect(unlockMonthsFromNow('floor', 'stone', 5, true)).toBeNull()
    expect(unlockMonthsFromNow('floor', 'wood', 0, true)).toBeNull()
    expect(unlockMonthsFromNow('windowTime', 'night', 0, true)).toBeNull()
    expect(unlockMonthsFromNow('sign', 'plan', 0, true)).toBeNull()
    expect(STARTER_ROOM_ITEMS).toContain('floor:wood')
  })
})
