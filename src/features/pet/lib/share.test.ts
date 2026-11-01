import { describe, expect, it } from 'vitest'
import { crop, pixelAt } from '@/lib/pixelArt'
import {
  composeScene,
  DEMO_SIGN_DATA,
  SIGN_IDS,
  VIEW_CARD,
  type PlayerInput,
  type SignData,
} from '@/features/pet/art'
import type { ServiceStreak } from '@/lib/serviceStreak'
import {
  PET_SHARE_SCALE,
  petShareFileName,
  petShareImage,
  petShareStats,
} from '@/features/pet/lib/share'

const INPUT: PlayerInput = {
  room: {
    time: 'day',
    season: 'spring',
    wallColor: 'sand',
    wallPattern: 'plain',
    floor: 'wood',
    bed: 'rug',
    shelf: 'scrolls',
    lamp: 'clay',
    sign: 'month',
  },
  sign: DEMO_SIGN_DATA,
  lampLevel: 3,
  pet: { species: 'cat', coat: 'calico', mood: 'happy', seed: 7 },
}

describe('sharing the pet', () => {
  it('names the file after the pet and the day, in any script', () => {
    expect(petShareFileName('Ari', '2026-10-18')).toBe('Ari-2026-10-18.png')
    expect(petShareFileName('Golden pup', '2026-10-18')).toBe(
      'Golden-pup-2026-10-18.png'
    )
    expect(petShareFileName('Mr. Whiskers / 2', '2026-01-02')).toBe(
      'Mr-Whiskers-2-2026-01-02.png'
    )
    expect(petShareFileName('ريم', '2026-10-18')).toBe('ريم-2026-10-18.png')
    expect(petShareFileName('Zoë', '2026-10-18')).toBe('Zoë-2026-10-18.png')
    expect(petShareFileName('..//', '2026-10-18')).toBe('pet-2026-10-18.png')
  })

  it('draws the Home card’s view, 4× with square pixels', () => {
    const image = petShareImage(INPUT)
    expect(PET_SHARE_SCALE).toBe(4)
    expect(image.width).toBe(VIEW_CARD[2] * 4)
    expect(image.height).toBe(VIEW_CARD[3] * 4)

    for (const [x, y] of [
      [0, 0],
      [120, 200],
      [400, 300],
    ])
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++)
          expect(pixelAt(image, x + i, y + j)).toEqual(pixelAt(image, x, y))

    expect(petShareImage(INPUT).data).toEqual(image.data)
  })

  it('draws bigger on request, still with square pixels', () => {
    const image = petShareImage(INPUT, 8)
    expect(image.width).toBe(VIEW_CARD[2] * 8)
    expect(pixelAt(image, 7, 7)).toEqual(pixelAt(image, 0, 0))
  })

  it('leaves the wall sign and its records out of the picture', () => {
    const noSign = petShareImage(
      { ...INPUT, room: { ...INPUT.room, sign: 'none' } },
      1
    ).data
    const otherRecords: SignData = {
      ...DEMO_SIGN_DATA,
      monthMinutes: 4290,
      monthGoal: 50,
      yearBars: [60, 55, 71.5, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      currentMonthIndex: 2,
      yearMinutes: 11190,
      sharedMonths: Array.from({ length: 12 }, (_, i) => i < 3),
      planDay: 3,
      planMinutes: 240,
      conversations: 42,
      returnVisits: 17,
    }
    for (const sign of SIGN_IDS)
      for (const data of [DEMO_SIGN_DATA, otherRecords])
        expect(
          petShareImage(
            { ...INPUT, room: { ...INPUT.room, sign }, sign: data },
            1
          ).data
        ).toEqual(noSign)
  })

  it('draws the sign when asked', () => {
    const room = { ...INPUT.room, sign: 'month' as const }
    const withSign = petShareImage({ ...INPUT, room }, 1, true).data
    expect(withSign).not.toEqual(petShareImage({ ...INPUT, room }, 1).data)
    expect(withSign).toEqual(
      crop(composeScene({ ...INPUT, room, particles: null }, 0), VIEW_CARD).data
    )
  })

  it('lists the streak, the days together and the hats on the card', () => {
    const streak = { kind: 'plans', count: 12 } as ServiceStreak
    const base = {
      adoptedOn: '2026-10-01',
      today: '2026-10-20',
      streak,
      showStreaks: true,
      unlocked: new Set(['hat:none', 'hat:bow', 'hat:cap', 'bed:hay']),
    }
    expect(petShareStats(base)).toEqual({
      streak: { kind: 'plans', count: 12 },
      daysTogether: 20,
      hats: 2,
    })

    expect(
      petShareStats({ ...base, adoptedOn: '2026-10-20' }).daysTogether
    ).toBe(1)

    expect(petShareStats({ ...base, showStreaks: false }).streak).toBeNull()
    expect(
      petShareStats({ ...base, streak: { ...streak, count: 0 } }).streak
    ).toBeNull()
    expect(
      petShareStats({ ...base, streak: { ...streak, count: 1 } }).streak
    ).toEqual({ kind: 'plans', count: 1 })
  })
})
