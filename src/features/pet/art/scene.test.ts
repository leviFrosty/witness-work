import { describe, expect, it } from 'vitest'

import { createBuffer, hashBuffer, pixelAt } from '@/lib/pixelArt'

import { ENTRANCES, TRICKS } from '../motion'
import {
  composeScene,
  cropScene,
  DEMO_SIGN_DATA,
  LIGHT_PHASES,
  lightPhase,
  PET_SPECIES_IDS,
  petBox,
  petFrame,
  particles as P,
  VIEW_CARD,
  VIEW_PET_SQUARE,
  VIEW_SIGN,
  VIEW_WIDGET_LARGE,
  type ResolvedRoom,
  type SceneInput,
} from '.'
import { SCENE_HASHES } from './testing/hashes'
import { SCENES } from './testing/scenes'

const ROOM: ResolvedRoom = {
  time: 'night',
  season: 'summer',
  wallColor: 'sand',
  wallPattern: 'dots',
  floor: 'wood',
  bed: 'rug',
  shelf: 'scrolls',
  lamp: 'clay',
  sign: 'month',
}

const INPUT: SceneInput = {
  room: ROOM,
  sign: DEMO_SIGN_DATA,
  lampLevel: 4,
  pet: { species: 'lion', coat: 'default', mood: 'happy', seed: 1000 },
}

describe('composeScene', () => {
  it('matches the sample scene snapshots', () => {
    const got: Record<string, string> = {}
    for (const [name, [input, t]] of Object.entries(SCENES)) {
      got[name] = hashBuffer(composeScene(input, t)).toString(16)
    }
    expect(got).toEqual(SCENE_HASHES)
  })

  it('draws the same frame from a pet frame the caller already resolved', () => {
    for (const [input, t] of Object.values(SCENES)) {
      if (!input.pet) continue
      const frame = petFrame(input.pet, t, input.reduceMotion)
      expect(hashBuffer(composeScene(input, t, undefined, frame))).toBe(
        hashBuffer(composeScene(input, t))
      )
    }
  })

  it('always returns an opaque 180 × 100 frame, even with the pet far off-stage', () => {
    for (const dx of [-400, -100, 0, 150, 400]) {
      for (const dy of [-300, 0, 90]) {
        const out = createBuffer(180, 100)
        const frame = composeScene(
          {
            ...INPUT,
            pet: {
              ...INPUT.pet!,
              motion: {
                table: {
                  durationMs: 1000,
                  sayAtMs: 500,
                  sayMoment: 'hi',
                  pose: () => ({ dx, dy }),
                },
                startMs: 0,
              },
            },
            visitors: [{ species: 'dog', coat: 'black' }],
            particles: P.emitDust(
              P.emitHeartBurst(P.createParticles(2), 0),
              0,
              dx,
              true,
              true
            ),
            moments: {
              gift: 'olive',
              sill: ['fig'],
              paradise: true,
              star: true,
              gold: true,
            },
          },
          100,
          out
        )
        expect(frame).toBe(out)
        expect(frame.data.length).toBe(180 * 100 * 4)
        for (let i = 3; i < frame.data.length; i += 4)
          expect(frame.data[i]).toBe(255)
      }
    }
  })

  it('clamps the lamp level and renders every level and time', () => {
    for (const time of ['dawn', 'day', 'dusk', 'night'] as const) {
      for (const lampLevel of [-1, 0, 1, 2, 3, 4, 5, 9]) {
        expect(() =>
          composeScene({ ...INPUT, room: { ...ROOM, time }, lampLevel }, 0)
        ).not.toThrow()
      }
    }
  })

  it('never darkens the window panes, but darkens the frame and cross bars', () => {
    const dark = composeScene({ ...INPUT, lampLevel: 0 }, 0)
    const bright = composeScene({ ...INPUT, lampLevel: 5 }, 0)
    expect(pixelAt(dark, 20, 13)).toBe(pixelAt(bright, 20, 13))
    // At night with the lamp out, the bars are as dark as the outer frame.
    const night = composeScene(
      { ...INPUT, room: { ...ROOM, time: 'night' }, lampLevel: 0 },
      0
    )
    const frame = pixelAt(night, 15, 20)
    expect(pixelAt(night, 36, 20)).toBe(frame)
    expect(pixelAt(night, 37, 14)).toBe(frame)
    expect(pixelAt(night, 30, 26)).toBe(frame)
    expect(pixelAt(night, 50, 27)).toBe(frame)
    expect(pixelAt(night, 37, 26)).toBe(frame)
    // The floor far from the lamp is darker with the lamp out.
    expect(pixelAt(dark, 4, 96)! & 0xff0000).toBeLessThan(
      pixelAt(bright, 4, 96)! & 0xff0000
    )
  })

  it('greys and lays down a pet that died; wakes it with a colour sweep from the feet', () => {
    const dead = petFrame({ ...INPUT.pet!, mood: 'dead' }, 0)
    expect(dead.sprite).toMatchObject({ lie: true, grey: 'full', face: 'dead' })
    const weak = petFrame({ ...INPUT.pet!, mood: 'weak' }, 0)
    expect(weak.sprite.grey).toBe('weak')
    const early = petFrame({ ...INPUT.pet!, mood: 'dead', wakeStartMs: 0 }, 100)
    expect(early.colorFromRow).toBe(27)
    expect(early.sprite.lie).toBe(true)
    const late = petFrame({ ...INPUT.pet!, mood: 'dead', wakeStartMs: 0 }, 1500)
    expect(late).toMatchObject({ colorFromRow: null, mood: 'joy' })
    // Awake at one heart: the faded look it keeps once the wake ends.
    expect(late.sprite.grey).toBe('weak')
    expect(early.sprite.grey).toBe('weak')
  })

  it('draws the hat on the pet, never on one lying down', () => {
    const bare = hashBuffer(composeScene(INPUT, 0))
    const none = { ...INPUT, room: { ...ROOM, hat: 'none' as const } }
    expect(hashBuffer(composeScene(none, 0))).toBe(bare)
    // A hat from a newer build draws nothing.
    const unknown = {
      ...INPUT,
      room: { ...ROOM, hat: 'crown' },
    } as unknown as SceneInput
    expect(hashBuffer(composeScene(unknown, 0))).toBe(bare)
    const topHat = { ...INPUT, room: { ...ROOM, hat: 'tophat' as const } }
    expect(hashBuffer(composeScene(topHat, 0))).not.toBe(bare)
    const dead = { ...INPUT, pet: { ...INPUT.pet!, mood: 'dead' as const } }
    expect(hashBuffer(composeScene({ ...dead, room: topHat.room }, 0))).toBe(
      hashBuffer(composeScene(dead, 0))
    )
  })

  it('boxes the pet, taller in a hat', () => {
    const frame = petFrame(INPUT.pet!, 0)
    const bare = petBox(INPUT.pet!, frame)!
    // The lion's sprite sits at (52, 52) and fills most of its 32 × 32.
    expect(bare[0]).toBeGreaterThanOrEqual(52)
    expect(bare[1]).toBeGreaterThanOrEqual(52)
    expect(bare[0] + bare[2]).toBeLessThanOrEqual(84)
    expect(bare[1] + bare[3]).toBeLessThanOrEqual(84)
    const hatted = petBox(INPUT.pet!, frame, 'tophat')!
    expect(hatted[1]).toBeLessThan(bare[1])
    expect(hatted[1] + hatted[3]).toBe(bare[1] + bare[3])
    // A pat squishes the head down a pixel; the hat follows it.
    const squished = petFrame({ ...INPUT.pet!, squishUntilMs: 100 }, 50)
    expect(petBox(INPUT.pet!, squished, 'tophat')![1]).toBe(hatted[1] + 1)
  })

  it('shows joy while patted, and motions override the mood', () => {
    expect(petFrame({ ...INPUT.pet!, patUntilMs: 500 }, 100).mood).toBe('joy')
    expect(petFrame({ ...INPUT.pet!, patUntilMs: 500 }, 600).mood).toBe('happy')
    const f = petFrame(
      { ...INPUT.pet!, motion: { table: ENTRANCES.cat, startMs: 0 } },
      100
    )
    expect(f.mood).toBe('wide')
    expect(f.origin[1]).toBeLessThan(52)
  })

  it('holds the pet still with Reduce Motion', () => {
    const pet = { ...INPUT.pet!, motion: { table: TRICKS.cat, startMs: 0 } }
    const a = petFrame(pet, 300, true)
    const b = petFrame(pet, 900, true)
    expect(a.origin).toEqual([52, 52])
    expect(a.sprite).toEqual(b.sprite)
  })

  it('crops the named viewports', () => {
    const frame = composeScene(INPUT, 0)
    for (const view of [
      VIEW_CARD,
      VIEW_PET_SQUARE,
      VIEW_WIDGET_LARGE,
      VIEW_SIGN,
    ]) {
      const c = cropScene(frame, view)
      expect([c.width, c.height]).toEqual([view[2], view[3]])
      expect(pixelAt(c, 0, 0)).toBe(pixelAt(frame, view[0], view[1]))
    }
    expect(cropScene(frame, 'full').width).toBe(180)
  })

  it('cycles through the cached light phases', () => {
    const phases = new Set<number>()
    for (let t = 0; t < 2000; t += 50) phases.add(lightPhase(t))
    expect(phases.size).toBe(LIGHT_PHASES)
  })

  it('darkens the pet less than the room around it at night', () => {
    const dark: SceneInput = {
      ...INPUT,
      room: { ...ROOM, time: 'night' },
      lampLevel: 0,
      pet: { ...INPUT.pet!, species: 'dog', coat: 'black' },
    }
    const lit = composeScene(dark, 0)
    const unlit = composeScene({ ...dark, room: { ...ROOM, time: 'day' } }, 0)
    const lum = (c: number | null) =>
      c === null ? 0 : ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255)
    // The pet's chest and the wall beside it.
    const ratio = (x: number, y: number) =>
      lum(pixelAt(lit, x, y)) / lum(pixelAt(unlit, x, y))
    expect(ratio(68, 72)).toBeGreaterThan(ratio(30, 60) + 0.15)
  })

  it('outlines a long-pressed visitor in front of the others, behind the pet', () => {
    const visitors = [
      { species: 'cat', coat: 'grey' },
      { species: 'lamb', coat: 'default' },
      { species: 'donkey', coat: 'default' },
    ] as const
    const plain = composeScene({ ...INPUT, visitors: [...visitors] }, 0)
    const outlined = composeScene(
      {
        ...INPUT,
        visitors: visitors.map((v, i) => ({ ...v, outlined: i === 2 })),
      },
      0
    )
    expect(hashBuffer(outlined)).not.toBe(hashBuffer(plain))
    // The pet's chest is the pet's in both.
    expect(pixelAt(outlined, 68, 72)).toEqual(pixelAt(plain, 68, 72))
  })

  it("keeps the lamp's stool in front of a visitor sitting behind it", () => {
    // The 13th seat sits on the stool's top.
    const crowd = Array.from({ length: 13 }, () => ({
      species: 'dog' as const,
      coat: 'black',
    }))
    const alone = composeScene({ ...INPUT, visitors: [] }, 0)
    const visited = composeScene({ ...INPUT, visitors: crowd }, 0)
    // The visitor shows above the stool and between its legs…
    expect(pixelAt(visited, 128, 74)).not.toEqual(pixelAt(alone, 128, 74))
    expect(pixelAt(visited, 124, 80)).not.toEqual(pixelAt(alone, 124, 80))
    // …and the stool's top and leg are drawn over it.
    for (const [x, y] of [
      [116, 77],
      [126, 78],
      [120, 80],
    ] as const)
      expect(pixelAt(visited, x, y)).toEqual(pixelAt(alone, x, y))
  })

  it('averages under 6 ms per steady frame', () => {
    const input: SceneInput = {
      ...INPUT,
      room: { ...ROOM, bed: 'basket', lamp: 'lantern' },
      // A full day: five buddies' pets visiting.
      visitors: [
        { species: 'dog', coat: 'gold' },
        { species: 'cat', coat: 'calico' },
        { species: 'lamb', coat: 'default' },
        { species: 'donkey', coat: 'default' },
        { species: 'lion', coat: 'default' },
      ],
      moments: { gold: true, gift: 'lily', sill: ['olive'] },
    }
    let particles = P.createParticles(1)
    const out = createBuffer(180, 100)
    const frame = (t: number) => {
      particles = P.step(particles, t, 'happy', { gold: true })
      composeScene({ ...input, particles }, t, out)
    }
    for (let t = 0; t < 2000; t += 100) frame(t) // warm the caches
    const start = performance.now()
    for (let i = 0; i < 50; i++) frame(2000 + i * 100)
    const avg = (performance.now() - start) / 50
    expect(avg).toBeLessThan(6)
  })

  it('renders every species entrance and trick frame', () => {
    for (const species of PET_SPECIES_IDS) {
      for (const table of [ENTRANCES[species], TRICKS[species]]) {
        for (let t = 0; t <= table.durationMs + 100; t += 100) {
          const f = composeScene(
            {
              ...INPUT,
              pet: { ...INPUT.pet!, species, motion: { table, startMs: 0 } },
            },
            t
          )
          expect(f.width).toBe(180)
        }
      }
    }
  })
})
