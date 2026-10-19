/**
 * The lamp is the Service Streak: its flame grows with the streak level 0–5 and
 * an unlit lamp smokes. Each lamp is rasterized in its own small box and placed
 * at (ox, oy) in the scene; (fx, fy) is the wick in box pixels. Lamps with
 * `stool` stand on a stool that is part of the room base.
 */
import {
  createLru,
  fillRect,
  mix,
  rasterize,
  rgb,
  rgbPalette,
  type FeaturePixel,
  type PixelBuffer,
  type Shape,
  type ShapeSpec,
} from '@/lib/pixelArt'
import { LAMP_IDS, type LampId } from '@/types/pet'

export { LAMP_IDS }
export type { LampId }

/** Streak level: 0 (unlit) to 5 (radiant). */
export type LampLevel = 0 | 1 | 2 | 3 | 4 | 5

/** Highest lamp level. */
export const MAX_LAMP_LEVEL = 5

/** Flame height and radius by level. */
export const FLAME_HEIGHT: readonly number[] = [0, 2.4, 3.6, 4.8, 6.2, 7.8]
const FLAME_RADIUS: readonly number[] = [0, 1.2, 1.6, 2, 2.5, 3]

/** One lamp design. */
export interface LampDefinition {
  /** Box size in pixels. */
  readonly width: number
  readonly height: number
  /** Box top-left in the scene. */
  readonly ox: number
  readonly oy: number
  /** Wick position in box pixels (the light's origin). */
  readonly fx: number
  readonly fy: number
  /** Flame scale. */
  readonly k: number
  /** Stands on the stool. */
  readonly stool: boolean
  /** The lamp at `level` on animation tick `tick` with flame flicker `fl`. */
  spec(level: number, tick: number, fl: number): ShapeSpec
}

const FLAME = rgbPalette({ outer: '#ff8f2a', mid: '#ffd04a', core: '#fff6cf' })
const SMOKE = rgbPalette({ a: '#9a9aa6', b: '#b4b4c0', c: '#c8c8d2' })

/** Three nested flame ellipses on a wick at (cx, by). Flames never get outlines. */
export function flameShapes(
  cx: number,
  by: number,
  level: number,
  k: number,
  fl: number
): Shape[] {
  if (!level) return []
  const H = FLAME_HEIGHT[level] * k + fl
  const R = FLAME_RADIUS[level] * k + fl * 0.4
  return [
    { t: 'e', x: cx, y: by - H, rx: R, ry: H, c: FLAME.outer, no: true },
    {
      t: 'e',
      x: cx,
      y: by - H * 0.78,
      rx: R * 0.62,
      ry: H * 0.7,
      c: FLAME.mid,
      no: true,
    },
    {
      t: 'e',
      x: cx,
      y: by - H * 0.42,
      rx: R * 0.32,
      ry: H * 0.36,
      c: FLAME.core,
      no: true,
    },
  ]
}

/** A three-pixel wisp of smoke rising from (cx, by). */
export function smokePixels(
  cx: number,
  by: number,
  tick: number
): FeaturePixel[] {
  const s = Math.floor(tick * 3) % 4
  return [
    [cx, by - 2 - (s % 2), SMOKE.a],
    [cx + 1, by - 4 - (s % 2), SMOKE.b],
    [cx, by - 6 - (s % 2), SMOKE.c],
  ]
}

const CLAY = rgbPalette({ c: '#c97440', s: '#9c5228', h: '#e8a06a' })
const BRASS = rgbPalette({ c: '#c99a3e', s: '#97702a', h: '#e6bd62' })
const BRONZE = rgbPalette({ c: '#b0823d', s: '#7f5a24', h: '#dcae5e' })
const GLASS_DARK = rgb('#58606c')
const GLASS_LIT = rgb('#ffe7a0')
const WHITE = rgb('#ffffff')

const clayLamp: LampDefinition = {
  width: 28,
  height: 28,
  ox: 112,
  oy: 50,
  fx: 22.2,
  fy: 18.8,
  k: 1,
  stool: true,
  spec(L, tick, fl) {
    const Y = 3
    const body: Shape[] = [
      { t: 'e', x: 3.4, y: 17.6 + Y, rx: 2.1, ry: 1.9, c: CLAY.c, s: CLAY.s },
      { t: 'e', x: 11, y: 21.6 + Y, rx: 3.4, ry: 1.1, c: CLAY.s },
      {
        t: 'e',
        x: 11,
        y: 17.6 + Y,
        rx: 7,
        ry: 4.3,
        c: CLAY.c,
        s: CLAY.s,
        h: CLAY.h,
      },
      {
        t: 'p',
        pts: [
          [15.5, 15.6 + Y],
          [22.4, 16.4 + Y],
          [22.8, 18.2 + Y],
          [15.5, 20.4 + Y],
        ],
        c: CLAY.c,
        s: CLAY.s,
        edge: true,
      },
      {
        t: 'e',
        x: 11,
        y: 14 + Y,
        rx: 3,
        ry: 1.3,
        c: rgb('#b5652f'),
        edge: true,
      },
    ]
    const feats: FeaturePixel[] = [
      [10, 17, rgb('#4a2414')],
      [11, 17, rgb('#4a2414')],
      [7, 21, rgb('#f2bf8f')],
      [11, 22, rgb('#f2bf8f')],
      [15, 21, rgb('#f2bf8f')],
      [22, 19, rgb('#3b2416')],
    ]
    return {
      shapes: [...body, ...flameShapes(22.2, 18.8, L, 1, fl)],
      feats: L ? feats : [...feats, ...smokePixels(22, 19, tick)],
    }
  },
}

const lantern: LampDefinition = {
  width: 28,
  height: 28,
  ox: 112,
  oy: 50,
  fx: 14,
  fy: 19,
  k: 0.75,
  stool: true,
  spec(L, tick, fl) {
    const g = mix(GLASS_DARK, GLASS_LIT, L / 5)
    const rect = (
      x0: number,
      y0: number,
      x1: number,
      y1: number
    ): [number, number][] => [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ]
    return {
      shapes: [
        {
          t: 'p',
          pts: rect(7, 23, 21, 25.6),
          c: BRASS.c,
          s: BRASS.s,
          edge: true,
        },
        { t: 'p', pts: rect(9, 10, 19, 23), c: g, h: mix(g, WHITE, 0.3) },
        ...flameShapes(14, 20.5, L, 0.75, fl),
        { t: 'p', pts: rect(8, 10, 9.6, 23), c: BRASS.c, s: BRASS.s },
        { t: 'p', pts: rect(18.4, 10, 20, 23), c: BRASS.c, s: BRASS.s },
        { t: 'p', pts: rect(13.4, 10, 14.6, 14), c: BRASS.c },
        {
          t: 'p',
          pts: [
            [6.5, 10.6],
            [14, 5.2],
            [21.5, 10.6],
          ],
          c: BRASS.c,
          s: BRASS.s,
          h: BRASS.h,
          edge: true,
        },
        { t: 'e', x: 14, y: 4, rx: 2, ry: 2, c: BRASS.c, s: BRASS.s },
      ],
      feats: [[14, 4, rgb('#3b2a14')], ...(L ? [] : smokePixels(14, 9, tick))],
    }
  },
}

const candle: LampDefinition = {
  width: 28,
  height: 28,
  ox: 112,
  oy: 50,
  fx: 14,
  fy: 12.5,
  k: 0.75,
  stool: true,
  spec(L, tick, fl) {
    const wax = rgb('#f4ecd6')
    const waxLight = rgb('#fffaf0')
    const drip = rgb('#e8dfc6')
    return {
      shapes: [
        {
          t: 'e',
          x: 14,
          y: 24,
          rx: 7,
          ry: 1.8,
          c: BRASS.c,
          s: BRASS.s,
          h: BRASS.h,
        },
        { t: 'e', x: 22, y: 23.4, rx: 2, ry: 1.4, c: BRASS.c, s: BRASS.s },
        {
          t: 'p',
          pts: [
            [11, 13],
            [17, 13],
            [17, 23.4],
            [11, 23.4],
          ],
          c: wax,
          s: rgb('#d8ccae'),
          h: waxLight,
        },
        { t: 'e', x: 14, y: 13, rx: 3, ry: 0.9, c: waxLight },
        ...flameShapes(14, 12.4, L, 0.8, fl),
      ],
      feats: [
        [14, 12, rgb('#3b2a14')],
        [11, 14, waxLight],
        [11, 15, waxLight],
        [16, 14, drip],
        [16, 15, drip],
        [16, 16, drip],
        ...(L ? [] : smokePixels(14, 12, tick)),
      ],
    }
  },
}

const stand: LampDefinition = {
  width: 28,
  height: 46,
  ox: 114,
  oy: 48,
  fx: 20.5,
  fy: 7.2,
  k: 0.85,
  stool: false,
  spec(L, tick, fl) {
    const wick: FeaturePixel = [20, 7, rgb('#3b2416')]
    return {
      shapes: [
        {
          t: 'e',
          x: 14,
          y: 43.4,
          rx: 7,
          ry: 2,
          c: BRONZE.c,
          s: BRONZE.s,
          h: BRONZE.h,
          edge: true,
        },
        {
          t: 'p',
          pts: [
            [13, 11],
            [15, 11],
            [15, 43],
            [13, 43],
          ],
          c: BRONZE.c,
          s: BRONZE.s,
          h: BRONZE.h,
        },
        { t: 'e', x: 14, y: 22, rx: 2.2, ry: 1.2, c: BRONZE.c, s: BRONZE.s },
        { t: 'e', x: 14, y: 33, rx: 2.4, ry: 1.3, c: BRONZE.c, s: BRONZE.s },
        {
          t: 'e',
          x: 14,
          y: 11,
          rx: 6,
          ry: 1.8,
          c: BRONZE.c,
          s: BRONZE.s,
          h: BRONZE.h,
          edge: true,
        },
        {
          t: 'e',
          x: 13.4,
          y: 8,
          rx: 4.4,
          ry: 2.6,
          c: CLAY.c,
          s: CLAY.s,
          h: CLAY.h,
          edge: true,
        },
        {
          t: 'p',
          pts: [
            [16, 6.8],
            [21, 7],
            [21.2, 8.6],
            [16, 9.6],
          ],
          c: CLAY.c,
          s: CLAY.s,
          edge: true,
        },
        ...flameShapes(20.5, 7.2, L, 0.85, fl),
      ],
      feats: L ? [wick] : [wick, ...smokePixels(20, 7, tick)],
    }
  },
}

/** Every lamp design. */
export const LAMPS: Readonly<Record<LampId, LampDefinition>> = {
  clay: clayLamp,
  lantern,
  candle,
  stand,
}

/** Lamp animation tick (6 per second) at `tMs`. */
export function lampTick(tMs: number): number {
  return (tMs / 1000) * 6
}

/** Flicker steps per pixel: finer steps barely move a flame pixel. */
const FLICKER_STEPS = 10

/**
 * Flame flicker offset at `tick` (0 when unlit), rounded to a tenth of a pixel
 * so a lit lamp has at most nine distinct sprites (−0.4 … 0.4) and the sprite
 * cache hits instead of rasterizing every frame.
 */
export function lampFlicker(level: number, tick: number): number {
  if (!level) return 0
  const fl = Math.sin(tick * 1.7) * 0.25 + Math.sin(tick * 3.1) * 0.15
  // `+ 0` turns −0 into 0, so both share one cache key.
  return Math.round(fl * FLICKER_STEPS) / FLICKER_STEPS + 0
}

/** Scene position of the light's origin: the middle of the flame. */
export function lampLightOrigin(
  lamp: LampId,
  level: number
): readonly [number, number] {
  const L = LAMPS[lamp]
  return [L.ox + L.fx, L.oy + L.fy - FLAME_HEIGHT[level] * L.k * 0.5]
}

const sprites = createLru<PixelBuffer>(48)

/**
 * The lamp's own box (width × height) at `tMs`: flame flickering, or smoke when
 * unlit. Memoized per flicker step (or smoke frame), so a burning lamp reuses a
 * handful of sprites instead of rasterizing every frame.
 */
export function lampSprite(
  lamp: LampId,
  level: number,
  tMs: number
): PixelBuffer {
  const tick = lampTick(tMs)
  const fl = lampFlicker(level, tick)
  const smoke = level ? 0 : Math.floor(tick * 3) % 4
  const key = `${lamp}|${level}|${level ? fl : smoke}`
  return sprites.getOrCreate(key, () => {
    const L = LAMPS[lamp]
    return rasterize(L.spec(level, tick, fl), L.width, L.height)
  })
}

const STOOL = rgbPalette({ top: '#8a5a3a', edge: '#6e4529', leg: '#7a4f30' })

/** Paints the stool the small lamps stand on. */
export function drawStool(buf: PixelBuffer): void {
  fillRect(buf, 116, 76, 152, 79, STOOL.top)
  fillRect(buf, 116, 79, 152, 80, STOOL.edge)
  fillRect(buf, 119, 80, 122, 92, STOOL.leg)
  fillRect(buf, 146, 80, 149, 92, STOOL.leg)
}
