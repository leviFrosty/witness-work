import { describe, expect, it } from 'vitest'

import { hashBuffer, opaqueBounds, pixelAt } from '@/lib/pixelArt'
import { itemReactions } from '@/features/pet/lib/itemReactions'
import { BIG_HAT_IDS, RARE_HAT_IDS, UNCOMMON_HAT_IDS } from '@/types/pet'

import {
  BIG_HAT_BRIM_ROW,
  BIG_HAT_CX,
  BIG_HAT_W,
  bigHatPoint,
} from './hatCanvas'
import { COIN_TOSS_MS } from './hatRoomFx'
import {
  bigHatFrame,
  frogShot,
  NEST_VISIT,
  nestShot,
  telescopeAngle,
  trainAngle,
  trainSpot,
} from './hatsLive'
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
  'dome',
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

  it('turns the planetarium telescope, and swings it for a pat and new coins', () => {
    const moment = (tMs: number, over = {}) => ({
      tMs,
      species: 'lion' as const,
      coat: 'default' as const,
      season: 'summer' as const,
      time: 'day' as const,
      growth: 5,
      wentOut: true,
      patMs: -Infinity,
      coinsMs: -Infinity,
      clockMs: null,
      ...over,
    })
    const idle = [0, 2000, 4000, 6000, 8000].map((t) =>
      telescopeAngle(moment(t))
    )
    expect(Math.max(...idle) - Math.min(...idle)).toBeGreaterThan(0.8)
    const swing = [400, 1200].map((dt) =>
      telescopeAngle(moment(5000 + dt, { patMs: 5000 }))
    )
    expect(swing[0] - swing[1]).toBeGreaterThan(1.5)
    const start = telescopeAngle(moment(5200, { coinsMs: 5000 }))
    const end = telescopeAngle(moment(5900, { coinsMs: 5000 }))
    expect(start).toBeLessThan(Math.PI / 2 - 0.5)
    expect(end).toBeGreaterThan(Math.PI / 2 + 0.2)
    for (const t of [0, 1000, 5400, 5900, 7000]) {
      const a = telescopeAngle(moment(t, { patMs: 5000, coinsMs: 5200 }))
      expect(a).toBeGreaterThan(0.4)
      expect(a).toBeLessThan(Math.PI - 0.4)
    }
    expect(telescopeAngle(moment(9000, { patMs: 5000, coinsMs: 5000 }))).toBe(
      telescopeAngle(moment(9000))
    )
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
      const reacts = itemReactions(`hat:${hat}`).includes('coins')
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
      const listed = itemReactions(`hat:${hat}`)
      expect(pixelsChanged(hat, 'hatPatMs') > 0).toBe(listed.includes('pat'))
      expect(pixelsChanged(hat, 'hatCoinsMs') > 0).toBe(
        listed.includes('coins')
      )
    })

    it('leads with the pat, and gives every rare hat both reactions', () => {
      for (const hat of [...UNCOMMON_HAT_IDS, ...RARE_HAT_IDS]) {
        const listed = itemReactions(`hat:${hat}`)
        if (listed.length > 0) expect(listed[0]).toBe('pat')
      }
      for (const hat of RARE_HAT_IDS) {
        expect(itemReactions(`hat:${hat}`)).toEqual(['pat', 'coins'])
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

describe('the frog', () => {
  const at = (tMs: number, patMs = -Infinity) => ({
    tMs,
    species: 'lion' as const,
    coat: 'default' as const,
    season: 'summer' as const,
    time: 'day' as const,
    growth: 5,
    wentOut: true,
    patMs,
    coinsMs: -Infinity,
    clockMs: null,
  })
  const FLY = 0x26221e
  const flyShows = (tMs: number, patMs?: number) => {
    const fly = frogShot(at(tMs, patMs)).fly
    if (!fly) return false
    const [x, y] = bigHatPoint(fly.d, fly.u).map(Math.round)
    return pixelAt(bigHatFrame('frog', at(tMs, patMs)), x, y) === FLY
  }
  const reach = (tMs: number, patMs?: number) => {
    const { fly, tongue } = frogShot(at(tMs, patMs))
    return Math.hypot(fly!.d - tongue!.d, fly!.u - tongue!.u)
  }

  it('keeps the fly out in a still picture, with no tongue', () => {
    expect(frogShot(at(0)).tongue).toBeNull()
    expect(flyShows(0)).toBe(true)
  })

  it('snatches the fly on a pat, wherever it is', () => {
    for (const pat of [29_000, 30_000, 40_500]) {
      expect(flyShows(pat - 10)).toBe(true)
      expect(frogShot(at(pat - 10)).tongue).toBeNull()
      expect(frogShot(at(pat, pat)).tongue).not.toBeNull()
      expect(reach(pat + 110, pat)).toBeLessThan(0.5)
      expect(frogShot(at(pat + 200, pat)).fly?.caught).toBe(true)
      for (const after of [300, 1000, 1900]) {
        expect(frogShot(at(pat + after, pat)).fly).toBeNull()
        expect(frogShot(at(pat + after, pat)).tongue).toBeNull()
      }
      expect(flyShows(pat + 3500, pat)).toBe(true)
    }
  })

  it('lets a second pat hop without eating a fly that is not back yet', () => {
    const first = 30_000
    const again = first + 1000
    const run = { ...at(again + 50, again), patRunMs: first }
    expect(frogShot(run).fly).toBeNull()
    expect(frogShot(run).tongue).toBeNull()
    expect(
      frogShot({ ...at(first + 3500, again), patRunMs: first }).fly
    ).not.toBeNull()
  })

  it('brings a new fly out from behind the frog', () => {
    const pat = 30_000
    const start = frogShot(at(pat + 2010, pat)).fly!
    expect(Math.abs(start.d)).toBeLessThan(5)
    expect(flyShows(pat + 2010, pat)).toBe(false)
    expect(flyShows(pat + 3200, pat)).toBe(true)
    const out = [2000, 2300, 2600, 2900, 3200].map(
      (dt) => frogShot(at(pat + dt, pat)).fly!.d
    )
    expect(out).toEqual([...out].sort((a, b) => a - b))
  })

  it('eats and brings back the fly the same way when nobody pats', () => {
    for (const cycle of [0, 9000, 18_000]) {
      const snatch = cycle + 7600
      expect(flyShows(snatch - 10)).toBe(true)
      expect(reach(snatch + 110)).toBeLessThan(0.5)
      expect(frogShot(at(snatch + 1000)).fly).toBeNull()
      expect(flyShows(snatch + 2010)).toBe(false)
      expect(flyShows(snatch + 3300)).toBe(true)
    }
  })

  it('only hops on a pat while the fly is gone, and keeps a pat fly out', () => {
    expect(frogShot(at(8200, 8000)).tongue).toBeNull()
    expect(frogShot(at(8200, 8000))).toEqual(frogShot(at(8200)))
    expect(frogShot(at(34_650, 33_000)).tongue).toBeNull()
    expect(flyShows(34_650, 33_000)).toBe(false)
    expect(flyShows(36_300, 33_000)).toBe(true)
  })
})

describe('the nest', () => {
  const at = (
    tMs: number,
    patMs = -Infinity,
    over: { patRunMs?: number; time?: 'day' | 'night' } = {}
  ) => ({
    tMs,
    species: 'lion' as const,
    coat: 'default' as const,
    season: 'summer' as const,
    time: 'day' as const,
    growth: 5,
    wentOut: true,
    patMs,
    coinsMs: -Infinity,
    clockMs: null,
    ...over,
  })

  it('keeps the parent away and the chicks quiet in a still picture', () => {
    const still = nestShot(at(0))
    expect(still.parent).toBeNull()
    expect(still.chicks.some((c) => c.shut)).toBe(false)
  })

  it('brings a worm on a pat and feeds the chick nearest the parent', () => {
    const sides = new Set<number>()
    for (const pat of [
      30_000, 30_100, 30_200, 30_300, 30_400, 30_500, 41_000,
    ]) {
      expect(nestShot(at(pat - 10)).parent).toBeNull()
      const landed = nestShot(at(pat + NEST_VISIT.landMs + 200, pat))
      expect(landed.parent?.worm).toBe(true)
      expect(landed.chicks.every((c) => c.open && c.lift >= 1)).toBe(true)
      const side = Math.sign(landed.parent!.d)
      sides.add(side)
      expect(landed.chicks.every((c) => c.face === side)).toBe(true)
      const near = side < 0 ? 0 : 2
      const feeding = nestShot(at(pat + NEST_VISIT.feedMs + 100, pat))
      expect(feeding.parent?.key).toBe('feed')
      const others = feeding.chicks.filter((_, i) => i !== near)
      for (const other of others)
        expect(feeding.chicks[near].lift).toBeGreaterThan(other.lift)
      const fed = nestShot(at(pat + NEST_VISIT.gulpMs + 600, pat))
      expect(fed.parent?.worm).toBe(false)
      expect(fed.chicks[near].open).toBe(false)
      expect(nestShot(at(pat + NEST_VISIT.endMs, pat)).parent).toBeNull()
    }
    expect(sides).toEqual(new Set([-1, 1]))
  })

  it('has the parent drop by now and then when nobody pats', () => {
    const visits = (from: number, to: number) => {
      let n = 0
      for (let t = from; t < to; t += 100) if (nestShot(at(t)).parent) n++
      return n
    }
    expect(visits(0, 7000)).toBe(0)
    expect(visits(7000, 40_000)).toBeGreaterThan(0)
  })

  it('finishes a visit when the pet is patted again during it', () => {
    const first = 30_000
    const again = first + 1000
    const run = nestShot(at(again + 50, again, { patRunMs: first }))
    expect(run.parent).toEqual(nestShot(at(again + 50, first)).parent)
    expect(run.chicks.every((c) => c.lift >= 1)).toBe(true)
  })

  it('lets the chicks sleep at night, and wakes them for a pat', () => {
    for (const t of [0, 9000, 21_500]) {
      const night = nestShot(at(t, -Infinity, { time: 'night' }))
      expect(night.parent).toBeNull()
      expect(night.chicks.every((c) => c.shut && !c.open)).toBe(true)
    }
    const woken = nestShot(at(30_200, 30_000, { time: 'night' }))
    expect(woken.parent).toBeNull()
    expect(woken.chicks.every((c) => !c.shut && c.lift > 0)).toBe(true)
    expect(
      nestShot(at(32_500, 30_000, { time: 'night' })).chicks.every(
        (c) => c.shut
      )
    ).toBe(true)
  })
})
