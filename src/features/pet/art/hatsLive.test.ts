import { describe, expect, it } from 'vitest'

import { hashBuffer, opaqueBounds, pixelAt } from '@/lib/pixelArt'
import { BIG_HAT_IDS } from '@/types/pet'

import {
  composeScene,
  DEMO_SIGN_DATA,
  hatSprite,
  PET_SPECIES_IDS,
  type ResolvedRoom,
  type SceneInput,
} from '.'

const ROOM: ResolvedRoom = {
  time: 'day',
  season: 'summer',
  wallColor: 'sand',
  wallPattern: 'plain',
  floor: 'wood',
  bed: 'rug',
  shelf: 'scrolls',
  lamp: 'clay',
  sign: 'none',
}

const input = (
  hat: ResolvedRoom['hat'],
  over: Partial<SceneInput> = {},
  room: Partial<ResolvedRoom> = {}
): SceneInput => ({
  room: { ...ROOM, ...room, hat },
  sign: DEMO_SIGN_DATA,
  lampLevel: 5,
  pet: { species: 'lion', coat: 'default', mood: 'happy', seed: 1 },
  ...over,
})

const MOVING = [
  'propeller',
  'nest',
  'frog',
  'hive',
  'cottage',
  'cloud',
  'mini',
  'balloon',
  'bowl',
  'lighthouse',
  'train',
  'fig',
] as const

const drawn = (hat: ResolvedRoom['hat'], at: number, over = {}, room = {}) =>
  hashBuffer(composeScene(input(hat, over, room), at))

describe('the big hats', () => {
  it('draws every one, on every pet', () => {
    const bare = drawn('none', 0)
    for (const hat of BIG_HAT_IDS) {
      expect(opaqueBounds(hatSprite(hat)!)).not.toBeNull()
      expect(drawn(hat, 0)).not.toBe(bare)
      for (const species of PET_SPECIES_IDS)
        composeScene(
          input(hat, {
            pet: { species, coat: 'default', mood: 'happy', seed: 1 },
          }),
          500
        )
    }
  })

  it('moves the ones that move, but not under Reduce Motion', () => {
    for (const hat of MOVING) {
      const frames = [0, 700, 1400, 2300, 3100].map((t) => drawn(hat, t))
      expect(new Set(frames).size).toBeGreaterThan(1)
      const still = [0, 700, 1400].map((t) =>
        drawn(hat, t, { reduceMotion: true, lampLevel: 0 })
      )
      const bare = [0, 700, 1400].map((t) =>
        drawn('none', t, { reduceMotion: true, lampLevel: 0 })
      )
      expect(new Set(still).size).toBe(new Set(bare).size)
    }
  })

  it('reacts to a pat and to new coins', () => {
    for (const hat of ['propeller', 'bowl', 'train', 'lighthouse'] as const) {
      expect(drawn(hat, 1000, { hatPatMs: 900 })).not.toBe(drawn(hat, 1000))
    }
    for (const hat of ['bowl', 'lighthouse', 'fig'] as const) {
      expect(drawn(hat, 1000, { hatCoinsMs: 900 })).not.toBe(drawn(hat, 1000))
    }
  })

  it('never reads the hearts for its show', () => {
    const lit = (level: number) =>
      drawn('dome', 2000, { lampLevel: level, hatPatMs: 0 })
    expect(lit(5)).not.toBe(drawn('dome', 2000, { lampLevel: 5 }))
    expect(lit(1)).not.toBe(drawn('dome', 2000, { lampLevel: 1 }))
  })

  const wall = (over: Partial<SceneInput>, room = {}) =>
    pixelAt(composeScene(input('dome', over, room), 2000), 150, 12)

  it('dims the room for the night shows, by themselves after dusk', () => {
    const day = wall({})
    expect(day).toEqual(pixelAt(composeScene(input('none'), 2000), 150, 12))
    expect(wall({ hatPatMs: 0 })).not.toEqual(day)
    expect(wall({ hatPatMs: -20_000 })).toEqual(day)
    expect(wall({}, { time: 'night' })).not.toEqual(
      pixelAt(composeScene(input('none', {}, { time: 'night' }), 2000), 150, 12)
    )
  })

  it('grows the fig tree and follows the season', () => {
    const size = (growth: number) =>
      opaqueBounds(hatSprite('fig', { growth })!)![3]
    expect(size(0)).toBeLessThan(size(2))
    expect(size(2)).toBeLessThan(size(5))
    const seasons = ['spring', 'summer', 'autumn', 'winter'].map((season) =>
      drawn('fig', 0, { reduceMotion: true }, { season })
    )
    expect(new Set(seasons).size).toBe(4)
  })

  it('puts the flag up only on a day out', () => {
    expect(drawn('mailbox', 0, { hatLife: { wentOut: true } })).not.toBe(
      drawn('mailbox', 0, { hatLife: { wentOut: false } })
    )
  })

  it('shows the real time on the cuckoo clock', () => {
    const at = (h: number, m: number) =>
      drawn('cuckoo', 0, { clockMs: new Date(2026, 0, 1, h, m, 30).getTime() })
    expect(at(3, 15)).not.toBe(at(9, 40))
  })

  it('rains from the little cloud', () => {
    expect(drawn('cloud', 1000)).not.toBe(drawn('cloud', 1300))
    const below = (t: number) => {
      const scene = composeScene(input('cloud'), t)
      let blue = 0
      for (let y = 40; y < 90; y++)
        for (let x = 55; x < 82; x++) {
          const c = pixelAt(scene, x, y)
          if (c !== null && (c & 255) > ((c >> 16) & 255) + 30) blue++
        }
      return blue
    }
    expect(below(1000)).toBeGreaterThan(0)
  })

  it('puts hats on visiting pets', () => {
    const visitor = { species: 'dog', coat: 'gold' } as const
    const plain = drawn('none', 0, { visitors: [visitor] })
    expect(
      drawn('none', 0, { visitors: [{ ...visitor, hat: 'cap' }] })
    ).not.toBe(plain)
    expect(
      drawn('none', 0, { visitors: [{ ...visitor, hat: 'lighthouse' }] })
    ).not.toBe(plain)
    expect(
      drawn('none', 0, {
        visitors: [{ ...visitor, hat: 'from-a-newer-build' }],
      })
    ).toBe(plain)
  })
})
