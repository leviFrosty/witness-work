import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ROOM,
  ROOM_PART_OPTIONS,
  UNLOCK_ORDER,
  type PetRoomSettings,
} from '@/types/pet'
import { SCENE_H, SCENE_W } from '@/features/pet/art'
import { unlockedRoomItems } from '@/features/pet/lib/unlocks'
import {
  isLiveWindow,
  isRoomChoiceUnlocked,
  liveWindowPatch,
  silhouetteRooms,
  silhouetteStyle,
  ROOM_TABS,
  ROOM_THUMB_VIEWS,
  roomChoicePatch,
  roomTabSections,
  roomWithChoice,
  selectedRoomOption,
  thumbRoom,
} from '@/features/pet/lib/roomOptions'

const FIXED: PetRoomSettings = {
  ...DEFAULT_ROOM,
  window: { time: 'dusk', season: 'live' },
}

describe('Decorate Room options', () => {
  it('has the eight tabs in order, the hat first and the window last', () => {
    expect(ROOM_TABS).toEqual([
      'hat',
      'wall',
      'floor',
      'bed',
      'shelf',
      'lamp',
      'sign',
      'window',
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
    for (const tab of ['floor', 'bed', 'shelf', 'lamp', 'sign', 'hat'] as const)
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
    expect(selectedRoomOption(FIXED, 'hat')).toBe('none')
    expect(roomChoicePatch(FIXED, 'hat', 'beret')).toEqual({ hat: 'beret' })
  })

  it('draws thumbnails by day, except the window time choices', () => {
    expect(thumbRoom(FIXED, 'hat', 'beret')).toEqual({
      ...FIXED,
      hat: 'beret',
      window: { time: 'day', season: 'live' },
    })
    expect(thumbRoom(FIXED, 'windowSeason', 'winter').window).toEqual({
      time: 'day',
      season: 'winter',
    })
    expect(thumbRoom(FIXED, 'windowTime', 'night').window).toEqual({
      time: 'night',
      season: 'live',
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
    const none = unlockedRoomItems([], [])
    expect(isRoomChoiceUnlocked('windowTime', 'night', none)).toBe(true)
    expect(isRoomChoiceUnlocked('sign', 'plan', none)).toBe(true)
    expect(isRoomChoiceUnlocked('floor', 'wood', none)).toBe(true)
    expect(isRoomChoiceUnlocked('floor', 'stone', none)).toBe(false)
    const [first] = UNLOCK_ORDER
    expect(first).toBe('bed:hay')
    expect(
      isRoomChoiceUnlocked('bed', 'hay', unlockedRoomItems([], [first]))
    ).toBe(true)
    expect(isRoomChoiceUnlocked('hat', 'none', none)).toBe(true)
    expect(isRoomChoiceUnlocked('hat', 'bow', none)).toBe(false)
  })

  it('compares a secret with a few rooms by day for its silhouette', () => {
    const night: PetRoomSettings = {
      ...DEFAULT_ROOM,
      window: { time: 'night', season: 'winter' },
    }
    const { room, references } = silhouetteRooms(night, 'hat', 'duck')
    expect(room.hat).toBe('duck')
    expect(room.window).toEqual({ time: 'day', season: 'winter' })

    expect(references.map((ref) => ref.hat)).toEqual(['duck', 'none'])
    expect(references[0]).toMatchObject({
      wallColor: 'indigo',
      floor: 'lilypond',
    })
    const shelf = silhouetteRooms(night, 'shelf', 'globe').references
    expect(shelf.map((ref) => ref.shelf)).toEqual([
      'globe',
      'scrolls',
      'books',
      'pottery',
      'fruit',
    ])
    expect(shelf[0].wallColor).not.toBe(night.wallColor)
    expect(shelf[0].floor).not.toBe(night.floor)

    const pond = { ...night, wallColor: 'indigo', floor: 'lilypond' } as const
    expect(silhouetteRooms(pond, 'bed', 'clam').references[0]).toMatchObject({
      wallColor: 'cream',
      floor: 'brick',
      bed: 'clam',
    })

    const wall = silhouetteRooms(night, 'wallPattern', 'waves').references
    expect(wall.map((ref) => [ref.wallColor, ref.wallPattern])).toEqual([
      ['sand', 'plain'],
      ['sky', 'waves'],
    ])
    expect(
      silhouetteRooms(night, 'wallColor', 'sky').references.map((ref) => [
        ref.wallColor,
        ref.wallPattern,
      ])
    ).toEqual([
      ['sky', 'plain'],
      ['rose', 'plain'],
    ])
    expect(
      silhouetteRooms(night, 'floor', 'tatami').references.map((r) => r.floor)
    ).toEqual(['wood', 'tile'])
    const secrets = [
      ['wallColor', 'plum'],
      ['floor', 'hex'],
      ['bed', 'nest'],
      ['lamp', 'lava'],
      ['hat', 'tam'],
    ] as const
    for (const [part, option] of secrets) {
      const shapes = silhouetteRooms(night, part, option)
      expect(shapes.references.length).toBeLessThanOrEqual(5)
      expect(shapes.references.every((ref) => ref.window.time === 'day')).toBe(
        true
      )
    }
    expect(silhouetteStyle('floor')).toBe('surface')
    expect(silhouetteStyle('lamp')).toBe('object')
  })
})
