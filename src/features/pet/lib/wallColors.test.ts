import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ROOM,
  STARTER_ROOM_ITEMS,
  WALL_COLORS,
  WALL_PATTERNS,
  type PetRoomSettings,
} from '@/types/pet'
import { lockerSections } from '@/features/pet/lib/locker'
import {
  roomChoicePatch,
  roomTabSections,
  roomWithChoice,
  thumbRoom,
} from '@/features/pet/lib/roomOptions'
import {
  fitsPattern,
  patternColor,
  wallColorsFor,
} from '@/features/pet/lib/wallColors'
import { unlockedRoomItems } from '@/features/pet/lib/unlocks'

const STRIPES: PetRoomSettings = {
  ...DEFAULT_ROOM,
  wallPattern: 'stripes',
  wallColor: 'rose',
}

describe('wall colors for each pattern', () => {
  it('gives every pattern a starter color it can wear', () => {
    const starters = WALL_COLORS.filter((color) =>
      (STARTER_ROOM_ITEMS as readonly string[]).includes(`wallColor:${color}`)
    )
    for (const pattern of WALL_PATTERNS) {
      const colors = wallColorsFor(pattern)
      expect(new Set(colors).size).toBe(colors.length)
      expect(colors.some((color) => starters.includes(color))).toBe(true)
    }
  })

  it('offers sky colors for skies and leaf colors for leaves', () => {
    expect(wallColorsFor('stripes')).toEqual(WALL_COLORS)
    expect(fitsPattern('aurora', 'indigo')).toBe(true)
    expect(fitsPattern('aurora', 'paprika')).toBe(false)
    expect(fitsPattern('leaves', 'terracotta')).toBe(true)
    expect(fitsPattern('leaves', 'sky')).toBe(false)
    expect(fitsPattern('mountains', 'turmeric')).toBe(false)
  })

  it('lists only the shown pattern’s colors, and the one on the wall', () => {
    const aurora = { ...DEFAULT_ROOM, wallPattern: 'aurora' as const }
    expect(roomTabSections('wall', aurora)[1]).toEqual({
      part: 'wallColor',
      options: [...wallColorsFor('aurora'), 'sand'],
    })
    expect(
      roomTabSections('wall', { ...aurora, wallColor: 'cream' })[1].options
    ).toEqual(wallColorsFor('aurora'))
    const unlocked = unlockedRoomItems(
      ['wallColor:indigo', 'wallColor:rose'],
      []
    )
    expect(
      lockerSections('wall', { ...aurora, wallColor: 'indigo' }, unlocked)[1]
        .owned
    ).toEqual(['indigo', 'cream'])
  })
})

describe('a pattern keeps its own color', () => {
  const unlocked = unlockedRoomItems(['wallColor:indigo', 'wallColor:sky'], [])

  it('starts a picture in its first owned color, a motif in the color on the wall', () => {
    expect(patternColor(STRIPES, 'aurora', unlocked)).toBe('indigo')
    expect(patternColor(STRIPES, 'aurora')).toBe('cream')
    expect(patternColor(STRIPES, 'leaves', unlocked)).toBe('sand')
    expect(patternColor(STRIPES, 'trellis', unlocked)).toBe('rose')
  })

  it('remembers the color each pattern had', () => {
    const toAurora = roomWithChoice(STRIPES, 'wallPattern', 'aurora', unlocked)
    expect(toAurora).toMatchObject({
      wallPattern: 'aurora',
      wallColor: 'indigo',
      wallColors: { stripes: 'rose', aurora: 'indigo' },
    })

    const recolored = roomWithChoice(toAurora, 'wallColor', 'sky')
    expect(recolored.wallColors).toEqual({ stripes: 'rose', aurora: 'sky' })

    const back = roomWithChoice(recolored, 'wallPattern', 'stripes', unlocked)
    expect(back).toMatchObject({ wallPattern: 'stripes', wallColor: 'rose' })
    expect(
      roomWithChoice(back, 'wallPattern', 'aurora', unlocked).wallColor
    ).toBe('sky')
  })

  it('ignores a remembered color the pattern no longer offers', () => {
    const room = { ...STRIPES, wallColors: { aurora: 'paprika' as const } }
    expect(patternColor(room, 'aurora', unlocked)).toBe('indigo')
  })

  it('changes only the wall parts', () => {
    expect(roomChoicePatch(STRIPES, 'wallColor', 'sage')).toEqual({
      wallPattern: 'stripes',
      wallColor: 'sage',
      wallColors: { stripes: 'sage' },
    })
  })

  it('shows a color the pattern doesn’t offer on a plain wall', () => {
    const leaves = { ...DEFAULT_ROOM, wallPattern: 'leaves' as const }
    expect(thumbRoom(leaves, 'wallColor', 'sky')).toMatchObject({
      wallPattern: 'plain',
      wallColor: 'sky',
    })
    expect(thumbRoom(leaves, 'wallColor', 'cream').wallPattern).toBe('leaves')
  })
})
