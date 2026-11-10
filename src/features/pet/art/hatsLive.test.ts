import { describe, expect, it } from 'vitest'

import { hashBuffer, opaqueBounds, pixelAt } from '@/lib/pixelArt'
import { hatReactions } from '@/features/pet/lib/hatReactions'
import { BIG_HAT_IDS, RARE_HAT_IDS, UNCOMMON_HAT_IDS } from '@/types/pet'

import { BIG_HAT_BRIM_ROW, BIG_HAT_CX, BIG_HAT_W } from './hatCanvas'
import { COIN_TOSS_MS } from './hatRoomFx'
import { trainAngle, trainSpot } from './hatsLive'
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

  it('lets new coins take the mailbox over from a pat still playing', () => {
    const patted = drawn('mailbox', 1000, { hatPatMs: 500 })
    expect(drawn('mailbox', 1000, { hatPatMs: 500, hatCoinsMs: 900 })).not.toBe(
      patted
    )
    expect(drawn('mailbox', 3000, { hatPatMs: 2900, hatCoinsMs: 500 })).toBe(
      drawn('mailbox', 3000, { hatPatMs: 2900 })
    )
  })

  it('tosses gold coins over every hat that reacts to new coins', () => {
    const gold = (hat: ResolvedRoom['hat'], over: Partial<SceneInput>) => {
      const { data } = composeScene(input(hat, over), 20_300)
      let count = 0
      for (let i = 0; i < data.length; i += 4)
        if (data[i] === 0xff && data[i + 1] === 0xf0 && data[i + 2] === 0xa8)
          count++
      return count
    }
    for (const hat of BIG_HAT_IDS) {
      const reacts = hatReactions(`hat:${hat}`).includes('coins')
      expect(gold(hat, { hatCoinsMs: 20_000 }) > 0).toBe(reacts)
      expect(gold(hat, { hatCoinsMs: 20_000 - COIN_TOSS_MS })).toBe(0)
      expect(gold(hat, { hatCoinsMs: 20_000, reduceMotion: true })).toBe(0)
    }
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

  it('shows the whole train out in front in a still picture', () => {
    const at = trainAngle(0, -Infinity)
    for (const behind of [0, 0.92, 1.62])
      expect(trainSpot(at - behind).near).toBeGreaterThan(0.3)
  })

  it('rests the snail on the middle of the head', () => {
    const [x, , width] = opaqueBounds(hatSprite('snail')!)!
    expect(Math.abs(x + width / 2 - BIG_HAT_CX)).toBeLessThanOrEqual(1)
  })

  it('perches the bird on the fig tree, not above it', () => {
    for (const growth of [4, 5]) {
      const tree = hatSprite('fig', { growth })!
      const top = opaqueBounds(tree)![1]
      for (let y = top; y <= BIG_HAT_BRIM_ROW; y++) {
        let any = false
        for (let x = 0; x < BIG_HAT_W; x++) any ||= pixelAt(tree, x, y) !== null
        expect(any).toBe(true)
      }
    }
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

  describe('what the Shop previews', () => {
    const pixelsChanged = (hat: ResolvedRoom['hat'], event: string) => {
      const start = 30_000
      let most = 0
      for (const after of [80, 300, 800, 1500, 1900, 3000]) {
        const a = composeScene(input(hat), start + after).data
        const b = composeScene(
          input(hat, { [event]: start }),
          start + after
        ).data
        let changed = 0
        for (let i = 0; i < a.length; i += 4)
          if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2])
            changed++
        most = Math.max(most, changed)
      }
      return most
    }

    it.each(BIG_HAT_IDS)('lists exactly what %s reacts to', (hat) => {
      const listed = hatReactions(`hat:${hat}`)
      expect(pixelsChanged(hat, 'hatPatMs') > 0).toBe(listed.includes('pat'))
      expect(pixelsChanged(hat, 'hatCoinsMs') > 0).toBe(
        listed.includes('coins')
      )
    })

    it('leads with the pat, and gives every rare hat both reactions', () => {
      for (const hat of [...UNCOMMON_HAT_IDS, ...RARE_HAT_IDS]) {
        const listed = hatReactions(`hat:${hat}`)
        if (listed.length > 0) expect(listed[0]).toBe('pat')
      }
      for (const hat of RARE_HAT_IDS) {
        expect(hatReactions(`hat:${hat}`)).toEqual(['pat', 'coins'])
        expect(pixelsChanged(hat, 'hatPatMs')).toBeGreaterThan(5)
        expect(pixelsChanged(hat, 'hatCoinsMs')).toBeGreaterThan(5)
      }
    })

    it('dims the room for a moment on new coins, so stars show by day', () => {
      expect(pixelsChanged('dome', 'hatCoinsMs')).toBeGreaterThan(1000)
      expect(pixelsChanged('lighthouse', 'hatCoinsMs')).toBeGreaterThan(1000)
      const after = 40_000
      expect(drawn('dome', after, { hatCoinsMs: 30_000 })).toBe(
        drawn('dome', after)
      )
    })

    it('fills the wagon only after new coins, and in a still picture', () => {
      const wagonEmpty = drawn('train', 5000)
      expect(drawn('train', 5000, { hatCoinsMs: 4000 })).not.toBe(wagonEmpty)
      expect(drawn('train', 0)).not.toBe(drawn('none', 0))
      expect(drawn('train', 40_000, { hatCoinsMs: 4000 })).toBe(
        drawn('train', 40_000)
      )
    })
  })
})
