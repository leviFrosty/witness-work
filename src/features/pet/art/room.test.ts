import { describe, expect, it } from 'vitest'

import { createBuffer, hashBuffer, pixelAt, textWidth } from '@/lib/pixelArt'
import {
  SECRET_BED_IDS,
  SECRET_FLOOR_IDS,
  SECRET_LAMP_IDS,
  SECRET_ROOM_ITEMS,
  SECRET_SHELF_IDS,
  SECRET_WALL_COLORS,
  SECRET_WALL_PATTERNS,
} from '@/types/pet'

import {
  DEFAULT_ROOM_CONFIG,
  DEMO_SIGN_DATA,
  drawRoomBase,
  GIFT_KINDS,
  isRoomOption,
  lampFlicker,
  lampLightOrigin,
  lampSprite,
  lampTick,
  LAMP_IDS,
  LAMPS,
  paintRoomBase,
  resolveRoom,
  roomBaseKey,
  ROOM_PARTS,
  SEASONS,
  fitSignNumber,
  SIGN_BOUNDS,
  SIGN_IDS,
  SIGN_TEXT_WIDTH,
  signNumber,
  SILL_SLOTS,
  sillSlot,
  VIEW_CARD,
  STARTER_ITEMS,
  TIMES_OF_DAY,
  UNLOCK_ORDER,
  type ResolvedRoom,
  type RoomPartId,
} from '.'

const ROOM: ResolvedRoom = {
  ...resolveRoom(DEFAULT_ROOM_CONFIG, { time: 'night', season: 'summer' }),
  sign: 'none',
}

function opaque(buf: { data: Uint8ClampedArray }): boolean {
  for (let i = 3; i < buf.data.length; i += 4)
    if (buf.data[i] !== 255) return false
  return true
}

describe('room registry', () => {
  it('matches the contract table', () => {
    expect(ROOM_PARTS.windowTime.options).toEqual([
      'live',
      'dawn',
      'day',
      'dusk',
      'night',
    ])
    expect(ROOM_PARTS.windowSeason.options).toEqual([
      'live',
      'spring',
      'summer',
      'autumn',
      'winter',
    ])
    // Each part's regular options, then its secret ones.
    expect(ROOM_PARTS.wallColor.options).toEqual([
      'sand',
      'sage',
      'sky',
      'rose',
      'cream',
      ...SECRET_WALL_COLORS,
    ])
    expect(ROOM_PARTS.wallPattern.options).toEqual([
      'plain',
      'dots',
      'stripes',
      'trellis',
      ...SECRET_WALL_PATTERNS,
    ])
    expect(ROOM_PARTS.floor.options).toEqual([
      'wood',
      'stone',
      'brick',
      'tile',
      ...SECRET_FLOOR_IDS,
    ])
    expect(ROOM_PARTS.bed.options).toEqual([
      'rug',
      'hay',
      'basket',
      'cushion',
      ...SECRET_BED_IDS,
    ])
    expect(ROOM_PARTS.shelf.options).toEqual([
      'scrolls',
      'books',
      'pottery',
      'fruit',
      ...SECRET_SHELF_IDS,
    ])
    expect(ROOM_PARTS.lamp.options).toEqual([
      'clay',
      'lantern',
      'candle',
      'stand',
      ...SECRET_LAMP_IDS,
    ])
    expect(ROOM_PARTS.sign.options).toEqual([
      'none',
      'month',
      'year',
      'shared',
      'plan',
      'convos',
    ])
    expect(STARTER_ITEMS).toContain('wallColor:cream')
    expect(STARTER_ITEMS).toContain('wallPattern:dots')
    expect(STARTER_ITEMS).toContain('lamp:clay')
    expect(STARTER_ITEMS).not.toContain('lamp:stand')
    expect(ROOM_PARTS.wallColor.starter).toEqual(['sand', 'cream'])
    expect(ROOM_PARTS.floor.starter).toEqual(['wood'])
    expect(ROOM_PARTS.windowTime.starter).toEqual(ROOM_PARTS.windowTime.options)
    expect(ROOM_PARTS.sign.starter).toEqual(ROOM_PARTS.sign.options)
  })

  it('unlocks every non-starter, non-secret item exactly once', () => {
    const unlockable: RoomPartId[] = [
      'wallColor',
      'wallPattern',
      'floor',
      'bed',
      'shelf',
      'lamp',
    ]
    const all = unlockable.flatMap((part) =>
      (ROOM_PARTS[part].options as readonly string[]).map((o) => `${part}:${o}`)
    )
    const locked = all.filter(
      (id) =>
        !(STARTER_ITEMS as readonly string[]).includes(id) &&
        !(SECRET_ROOM_ITEMS as readonly string[]).includes(id)
    )
    expect([...UNLOCK_ORDER].sort()).toEqual([...locked].sort())
    expect(new Set(UNLOCK_ORDER).size).toBe(UNLOCK_ORDER.length)
  })

  it('checks options and resolves the live window', () => {
    expect(isRoomOption('floor', 'tile')).toBe(true)
    expect(isRoomOption('floor', 'carpet')).toBe(false)
    const live = resolveRoom(DEFAULT_ROOM_CONFIG, {
      time: 'dusk',
      season: 'winter',
    })
    expect(live).toMatchObject({ time: 'dusk', season: 'winter', lamp: 'clay' })
    const fixed = resolveRoom(
      { ...DEFAULT_ROOM_CONFIG, window: { time: 'dawn', season: 'spring' } },
      { time: 'dusk', season: 'winter' }
    )
    expect(fixed).toMatchObject({ time: 'dawn', season: 'spring' })
  })
})

describe('room art', () => {
  it('renders every part option for every time × season without throwing', () => {
    const parts = [
      'wallColor',
      'wallPattern',
      'floor',
      'bed',
      'shelf',
      'lamp',
      'sign',
    ] as const
    for (const time of TIMES_OF_DAY) {
      for (const season of SEASONS) {
        for (const part of parts) {
          for (const option of ROOM_PARTS[part].options) {
            const buf = createBuffer(180, 100)
            paintRoomBase(
              buf,
              { ...ROOM, time, season, [part]: option },
              DEMO_SIGN_DATA,
              {
                rainbow: time !== 'night',
                sill: [...GIFT_KINDS],
                gift: 'fig',
              }
            )
            expect(opaque(buf)).toBe(true)
          }
        }
      }
    }
  })

  it('keeps all five sill keepsakes on the sill, in the Home card and off the cross bar', () => {
    const [viewX] = VIEW_CARD
    const slots = Array.from({ length: SILL_SLOTS }, (_, i) => sillSlot(i))
    for (const [x, y] of slots) {
      expect(x).toBeGreaterThanOrEqual(Math.max(24, viewX))
      expect(x + 4).toBeLessThanOrEqual(58)
      // The window's vertical cross bar is x 36–37.
      expect(x + 4 < 36 || x > 37).toBe(true)
      expect(y).toBe(39)
    }
    for (let i = 1; i < slots.length; i++)
      expect(slots[i][0] - slots[i - 1][0]).toBeGreaterThanOrEqual(6)
    // Every keepsake actually lands in its slot.
    const bare = createBuffer(180, 100)
    paintRoomBase(bare, { ...ROOM, time: 'day' }, DEMO_SIGN_DATA)
    const full = createBuffer(180, 100)
    paintRoomBase(full, { ...ROOM, time: 'day' }, DEMO_SIGN_DATA, {
      sill: [...GIFT_KINDS],
    })
    for (const [x, y] of slots) {
      let changed = 0
      for (let j = 0; j < 5; j++)
        for (let i = 0; i < 5; i++)
          if (
            JSON.stringify(pixelAt(full, x + i, y + j)) !==
            JSON.stringify(pixelAt(bare, x + i, y + j))
          )
            changed++
      expect(changed).toBeGreaterThan(0)
    }
  })

  it('caches the base by a stable key', () => {
    const a = drawRoomBase(ROOM, DEMO_SIGN_DATA)
    expect(drawRoomBase({ ...ROOM }, { ...DEMO_SIGN_DATA })).toBe(a)
    // Sign values don't matter while no sign is shown...
    expect(drawRoomBase(ROOM, { ...DEMO_SIGN_DATA, monthMinutes: 5940 })).toBe(
      a
    )
    // ...and do once it is.
    // Same objects or equal copies give the same key.
    const room = { ...ROOM, sign: 'month' as const }
    const decor = { sill: ['olive', 'fig'] as const, gift: 'lily' as const }
    expect(roomBaseKey(room, DEMO_SIGN_DATA, decor)).toBe(
      roomBaseKey({ ...room }, { ...DEMO_SIGN_DATA }, { ...decor })
    )
    expect(roomBaseKey(room, DEMO_SIGN_DATA, decor)).not.toBe(
      roomBaseKey(room, DEMO_SIGN_DATA, { ...decor, rainbow: true })
    )
    expect(roomBaseKey(room, DEMO_SIGN_DATA)).not.toBe(
      roomBaseKey(room, { ...DEMO_SIGN_DATA, monthMinutes: 5940 })
    )
    const month = { ...ROOM, sign: 'month' as const }
    expect(hashBuffer(drawRoomBase(month, DEMO_SIGN_DATA))).not.toBe(
      hashBuffer(drawRoomBase(month, { ...DEMO_SIGN_DATA, monthMinutes: 5940 }))
    )
  })

  it('draws each sign inside its frame, in both digit systems', () => {
    const blank = drawRoomBase(ROOM, DEMO_SIGN_DATA)
    for (const sign of SIGN_IDS) {
      for (const digits of ['latn', 'arab'] as const) {
        const buf = drawRoomBase(
          { ...ROOM, sign },
          { ...DEMO_SIGN_DATA, digits }
        )
        let changedOutside = 0
        let changedInside = 0
        for (let y = 0; y < 100; y++) {
          for (let x = 0; x < 180; x++) {
            if (pixelAt(buf, x, y) === pixelAt(blank, x, y)) continue
            if (x >= 137 && x <= 157 && y >= 8 && y < 38) changedInside++
            else if (!(x >= 134 && x < 160 && y >= 8 && y < 38))
              changedOutside++
          }
        }
        expect(changedOutside).toBe(0)
        if (sign !== 'none') expect(changedInside).toBeGreaterThan(20)
      }
    }
    const latn = drawRoomBase({ ...ROOM, sign: 'month' }, DEMO_SIGN_DATA)
    const arab = drawRoomBase(
      { ...ROOM, sign: 'month' },
      { ...DEMO_SIGN_DATA, digits: 'arab' }
    )
    expect(hashBuffer(latn)).not.toBe(hashBuffer(arab))
  })

  it('formats sign numbers', () => {
    expect(signNumber(14.5, 'latn')).toBe('14.5')
    expect(signNumber(14.25, 'latn')).toBe('14.3')
    expect(signNumber(14.5, 'arab')).toBe('١٤٫٥')
    expect(signNumber(null, 'latn')).toBe('-')
  })

  it('fits large sign numbers: decimals go first, then a cap', () => {
    const W = SIGN_TEXT_WIDTH
    expect(W).toBe(22)
    expect(fitSignNumber(1333.5, 'latn', W)).toBe('1333.5')
    // ١٣٣٣٫٥ is 28 pixels wide: the decimal goes.
    expect(fitSignNumber(1333.5, 'arab', W)).toBe('١٣٣٤')
    expect(fitSignNumber(123456, 'latn', W)).toBe('9999+')
    expect(fitSignNumber(33333, 'arab', W)).toBe('+٩٩٩٩')
    expect(fitSignNumber(1e21, 'latn', W)).toBe('9999+')
    expect(fitSignNumber(-123456, 'latn', W)).toBe('-')
    expect(fitSignNumber(Number.NaN, 'latn', W)).toBe('-')
    expect(fitSignNumber(null, 'arab', W)).toBe('-')
    // The convos slot is 12 pixels wide.
    expect(fitSignNumber(8, 'latn', 12)).toBe('8')
    expect(fitSignNumber(999, 'latn', 12)).toBe('999')
    expect(fitSignNumber(1000, 'latn', 12)).toBe('99+')
    expect(fitSignNumber(33, 'arab', 12)).toBe('٣٣')
    expect(fitSignNumber(133, 'arab', 12)).toBe('+٩٩')
    for (const digits of ['latn', 'arab'] as const) {
      for (const value of [0, 9.5, 99, 100, 133.5, 1333.5, 33333, 1e9]) {
        for (const max of [9, 12, W]) {
          const text = fitSignNumber(value, digits, max)
          expect(textWidth(text)).toBeLessThanOrEqual(max)
        }
      }
    }
  })

  it('keeps large values inside the sign, in both digit systems', () => {
    const big = {
      ...DEMO_SIGN_DATA,
      monthMinutes: 80010,
      monthGoal: 50,
      yearMinutes: 800010,
      planDay: 23,
      planMinutes: 8010,
      conversations: 1333,
      returnVisits: 133,
    }
    const { x0, y0, x1, y1 } = SIGN_BOUNDS
    for (const sign of SIGN_IDS) {
      for (const digits of ['latn', 'arab'] as const) {
        const room = { ...ROOM, sign }
        const demo = drawRoomBase(room, { ...DEMO_SIGN_DATA, digits })
        const buf = drawRoomBase(room, { ...big, digits })
        for (let y = 0; y < 100; y++) {
          for (let x = 0; x < 180; x++) {
            // Text only ever lands inside the paper's one-pixel margin.
            const text = x > x0 + 1 && x < x1 - 2 && y > y0 + 1 && y < y1 - 2
            if (!text) expect(pixelAt(buf, x, y)).toEqual(pixelAt(demo, x, y))
          }
        }
      }
    }
  })

  it('handles sign data edge cases', () => {
    const empty = {
      ...DEMO_SIGN_DATA,
      monthGoal: 0,
      yearBars: [],
      sharedMonths: [],
      planDay: null,
      planMinutes: null,
    }
    for (const sign of SIGN_IDS) {
      expect(() => drawRoomBase({ ...ROOM, sign }, empty)).not.toThrow()
    }
  })

  it('draws every lamp at every level, lit or smoking', () => {
    for (const lamp of LAMP_IDS) {
      for (let level = 0; level <= 5; level++) {
        const s = lampSprite(lamp, level, 300)
        expect(s.width).toBe(LAMPS[lamp].width)
        expect(s.height).toBe(LAMPS[lamp].height)
        const [x, y] = lampLightOrigin(lamp, level)
        expect(x).toBeGreaterThan(100)
        expect(y).toBeLessThan(80)
      }
      expect(hashBuffer(lampSprite(lamp, 5, 300))).not.toBe(
        hashBuffer(lampSprite(lamp, 0, 300))
      )
    }
    // A burning lamp reuses a handful of sprites (flicker in 0.1 px steps).
    const frames = new Set<unknown>()
    for (let t = 0; t < 60_000; t += 100) frames.add(lampSprite('clay', 5, t))
    expect(frames.size).toBeLessThanOrEqual(9)
    expect(frames.size).toBeGreaterThan(3)
    for (let level = 1; level <= 5; level++) {
      for (let t = 0; t < 5_000; t += 37) {
        const fl = lampFlicker(level, lampTick(t))
        expect(Math.abs(fl)).toBeLessThanOrEqual(0.4)
        expect(Math.round(fl * 10)).toBeCloseTo(fl * 10, 9)
      }
    }
    expect(LAMPS.stand.stool).toBe(false)
    expect(LAMPS.clay.stool).toBe(true)
  })
})
