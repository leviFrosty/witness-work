import {
  createBuffer,
  createLru,
  fillRect,
  mix,
  rasterize,
  rgb,
  rgbPalette,
  type FeaturePixel,
  type Paint,
  type PixelBuffer,
  type Rgb,
  type Shape,
  type ShapeSpec,
} from '@/lib/pixelArt'
import { LAMP_IDS, type LampId } from '@/types/pet'
import { SCENE_H, SCENE_W } from '../layout'

export { LAMP_IDS }
export type { LampId }

export type LampLevel = 0 | 1 | 2 | 3 | 4 | 5

export const FLAME_HEIGHT: readonly number[] = [0, 2.4, 3.6, 4.8, 6.2, 7.8]
const FLAME_RADIUS: readonly number[] = [0, 1.2, 1.6, 2, 2.5, 3]

export interface LampDefinition {
  readonly width: number
  readonly height: number

  readonly ox: number
  readonly oy: number

  readonly fx: number
  readonly fy: number

  readonly k: number

  readonly stool: boolean

  readonly frames?: number

  readonly frameTicks?: number

  spec(level: number, tick: number, fl: number): ShapeSpec
}

const FLAME = rgbPalette({ outer: '#ff8f2a', mid: '#ffd04a', core: '#fff6cf' })
const SMOKE = rgbPalette({ a: '#9a9aa6', b: '#b4b4c0', c: '#c8c8d2' })

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

type Pt = [number, number]

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]

function arc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a0: number,
  a1: number,
  n = 12
): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)])
  }
  return pts
}

const byLevel = (off: Rgb, on: Rgb, L: number): Rgb => mix(off, on, L / 5)

const GLOW = rgbPalette({
  warm: '#ffd889',
  bright: '#ffe9a8',
  core: '#fff2c2',
})

const LIGHTHOUSE = rgbPalette({
  white: '#f1ede3',
  whiteS: '#c9c2b4',
  whiteH: '#ffffff',
  red: '#c8453b',
  redS: '#97302a',
  redH: '#e2685c',
  iron: '#434a57',
  ironS: '#2e333d',
  stone: '#8f8a84',
  stoneS: '#6b6762',
  stoneH: '#aba59d',
  door: '#4a3226',
  window: '#3b4250',
  glassOff: '#3f4a5c',
})

const lighthouse: LampDefinition = {
  width: 20,
  height: 46,
  ox: 117,
  oy: 48,
  fx: 10,
  fy: 11,
  k: 0,
  stool: false,
  frames: 8,
  frameTicks: 2,
  spec(L, frame) {
    const C = LIGHTHOUSE

    const hw = (y: number): number => 4 + ((y - 17) / 24) * 2.5
    const band = (y0: number, y1: number, red: boolean): Shape[] => {
      const [c, sh, hi] = red
        ? [C.red, C.redS, C.redH]
        : [C.white, C.whiteS, C.whiteH]
      const l0 = 10 - hw(y0)
      const l1 = 10 - hw(y1)
      const r0 = 10 + hw(y0)
      const r1 = 10 + hw(y1)
      return [
        {
          t: 'p',
          pts: [
            [l0, y0],
            [r0, y0],
            [r1, y1],
            [l1, y1],
          ],
          c,
          g: 'tower',
        },
        {
          t: 'p',
          pts: [
            [r0 - 2.2, y0],
            [r0, y0],
            [r1, y1],
            [r1 - 2.6, y1],
          ],
          c: sh,
          g: 'tower',
        },
        {
          t: 'p',
          pts: [
            [l0 + 1, y0],
            [l0 + 2, y0],
            [l1 + 2, y1],
            [l1 + 1, y1],
          ],
          c: hi,
          g: 'tower',
        },
      ]
    }
    const glass = byLevel(C.glassOff, GLOW.warm, L)
    const shapes: Shape[] = [
      { t: 'e', x: 3, y: 43, rx: 2.4, ry: 1.5, c: C.stone, s: C.stoneS },
      { t: 'e', x: 17.2, y: 43.4, rx: 2, ry: 1.2, c: C.stone, s: C.stoneS },
      {
        t: 'e',
        x: 10,
        y: 42.4,
        rx: 8,
        ry: 2.6,
        c: C.stone,
        s: C.stoneS,
        h: C.stoneH,
        edge: true,
      },
      ...band(17, 23, false),
      ...band(23, 29, true),
      ...band(29, 35, false),
      ...band(35, 41, true),

      { t: 'p', pts: rect(6, 7, 14, 15), c: glass },
    ]
    if (L) {
      shapes.push(
        {
          t: 'e',
          x: 10,
          y: 11,
          rx: 0.9 + L * 0.5,
          ry: 1.2 + L * 0.5,
          c: byLevel(glass, GLOW.bright, 0.5 + L * 0.5),
          no: true,
        },
        {
          t: 'e',
          x: 10,
          y: 11,
          rx: 0.4 + L * 0.25,
          ry: 0.6 + L * 0.3,
          c: GLOW.core,
          no: true,
        }
      )
    }
    if (L >= 2) {
      const x = 6 + frame
      shapes.push({
        t: 'p',
        pts: rect(x, 7, x + 1, 15),
        c: mix(GLOW.bright, WHITE, 0.6),
        no: true,
      })
    }
    shapes.push(
      { t: 'p', pts: rect(3, 15, 17, 17.4), c: C.iron, s: C.ironS, edge: true },
      {
        t: 'p',
        pts: [
          [4.6, 7.6],
          [10, 2.6],
          [15.4, 7.6],
        ],
        c: C.red,
        s: C.redS,
        h: C.redH,
        edge: true,
      },
      { t: 'e', x: 10, y: 2.2, rx: 1.2, ry: 1.2, c: C.iron }
    )
    const rail = C.iron
    const lit = L >= 2 ? byLevel(C.window, GLOW.warm, L) : C.window
    const feats: FeaturePixel[] = [
      [10, 0, rail],
      ...[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(
        (x): FeaturePixel => [x, 12, rail]
      ),
      ...[4, 7, 12, 15].flatMap((x): FeaturePixel[] => [
        [x, 13, rail],
        [x, 14, rail],
      ]),
      [9, 19, lit],
      [10, 19, lit],
      [9, 31, lit],
      [10, 31, lit],
      [9, 38, C.door],
      [10, 38, C.door],
      [9, 39, C.door],
      [10, 39, C.door],
      [9, 40, C.door],
      [10, 40, C.door],
    ]
    return { shapes, feats }
  },
}

const PIERCED = rgbPalette({
  c: '#a67b34',
  s: '#765422',
  h: '#cfa452',
  band: '#7a5a24',
  hole: '#2a1a0c',
  holeLit: '#ffcf6a',
  inside: '#3a2614',
  insideLit: '#ffbf5a',
  wax: '#f4ecd6',
})

const PIERCED_BODY: readonly Pt[] = [
  [5.6, 11],
  [16.4, 11],
  [17.4, 14],
  [17.6, 19],
  [16.6, 24],
  [14, 28.4],
  [8, 28.4],
  [5.4, 24],
  [4.4, 19],
  [4.6, 14],
]

function inside(pts: readonly Pt[], x: number, y: number): boolean {
  let hit = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      hit = !hit
    }
  }
  return hit
}

const PIERCED_HOLES: readonly (readonly [number, number, boolean])[] = (() => {
  const holes: [number, number, boolean][] = []
  const inBody = (x: number, y: number): boolean =>
    inside(PIERCED_BODY, x + 0.5, y + 0.5)
  for (let y = 8; y < 28; y++) {
    for (let x = 4; x < 18; x++) {
      if (y === 13 || y === 24) continue
      if (x >= 8 && x <= 13 && y >= 9 && y <= 24) continue
      if (
        ![
          [0, 0],
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].every(([dx, dy]) => inBody(x + dx, y + dy))
      )
        continue
      const u = (((x + y) % 4) + 4) % 4
      const v = (((x - y) % 4) + 4) % 4
      if (u === 0 || v === 0) continue
      holes.push([x, y, u === 2 && v === 2])
    }
  }
  return holes
})()

const pierced: LampDefinition = {
  width: 22,
  height: 34,
  ox: 116,
  oy: 43,
  fx: 11,
  fy: 20,
  k: 0.55,
  stool: true,
  spec(L, tick, fl) {
    const C = PIERCED
    const hole = L ? mix(C.hole, C.holeLit, 0.35 + L * 0.13) : C.hole
    const holeMid = L >= 3 ? byLevel(C.holeLit, GLOW.core, L) : hole
    const inside = byLevel(C.inside, C.insideLit, L)
    const brass = { c: C.c, s: C.s, h: C.h }
    const shapes: Shape[] = [
      {
        t: 'p',
        pts: [
          [7, 29],
          [15, 29],
          [16.4, 33],
          [5.6, 33],
        ],
        ...brass,
        edge: true,
      },
      { t: 'p', pts: PIERCED_BODY, ...brass, k: 'body', edge: true },

      { t: 'p', pts: rect(9, 12, 13, 24), c: inside, g: 'win' },
      { t: 'p', pts: rect(10, 20, 12, 24), c: C.wax },
      ...flameShapes(11, 20, L, 0.55, fl),

      { t: 'p', pts: rect(4, 9.4, 18, 11.4), ...brass, edge: true },
      {
        t: 'p',
        pts: [
          [8, 5.8],
          [14, 5.8],
          [16.4, 9.4],
          [5.6, 9.4],
        ],
        ...brass,
        edge: true,
      },
      { t: 'p', pts: rect(9, 4.2, 13, 5.8), ...brass, edge: true },
    ]
    const paints = [
      { t: 'p', pts: rect(0, 13, 22, 14), c: C.band, on: ['body'] },
      { t: 'p', pts: rect(0, 24.4, 22, 25.4), c: C.band, on: ['body'] },
    ] as const satisfies readonly Paint[]
    const feats: FeaturePixel[] = PIERCED_HOLES.map(
      ([x, y, mid]): FeaturePixel => [x, y, mid ? holeMid : hole]
    )

    feats.push(
      [10, 0, C.c],
      [11, 0, C.s],
      [9, 1, C.c],
      [12, 1, C.s],
      [9, 2, C.s],
      [12, 2, C.s],
      [10, 3, C.s],
      [11, 3, C.s],
      [11, 20, rgb('#3b2a14')]
    )
    if (!L) feats.push(...smokePixels(11, 5, tick))
    return { shapes, paints, feats }
  },
}

const JAR = rgbPalette({
  glass: '#5d7680',
  glassS: '#475e68',
  glassH: '#7d98a0',
  glow: '#c9e58a',
  shine: '#d8e8ec',
  cloth: '#4f74a8',
  clothMid: '#93abcf',
  clothLight: '#e8eef5',
  twine: '#e6d3a4',
  fly: '#f6ff9a',
  flyHalo: '#b9dc62',
  flyOff: '#3f4a38',
})

const JAR_CLOTH: readonly Pt[] = [
  [2.4, 9.4],
  [3.4, 8.4],
  [4.6, 9.4],
  [6, 8.6],
  [7.4, 9.4],
  [9, 8.6],
  [10.6, 9.4],
  [12, 8.6],
  [13.4, 9.4],
  [14.6, 8.4],
  [15.6, 9.4],
  [15.6, 6.4],
  [13, 3.6],
  [9, 2.8],
  [5, 3.6],
  [2.4, 6.4],
]

const JAR_GINGHAM: readonly FeaturePixel[] = (() => {
  const px: FeaturePixel[] = []
  for (let y = 2; y < 10; y++) {
    for (let x = 2; x < 16; x++) {
      if (!inside(JAR_CLOTH, x + 0.5, y + 0.5)) continue
      const stripes = (x % 2 ? 0 : 1) + (y % 2 ? 0 : 1)
      if (stripes)
        px.push([x, y, stripes === 2 ? JAR.clothLight : JAR.clothMid])
    }
  }
  return px
})()

const FIREFLIES: readonly Pt[] = [
  [8, 18],
  [12, 14],
  [5, 14],
  [11, 21],
  [6, 22],
  [13, 18],
  [9, 12],
]
const FIREFLIES_LIT: readonly number[] = [0, 2, 3, 4, 5, 7]

const firefly: LampDefinition = {
  width: 18,
  height: 26,
  ox: 118,
  oy: 51,
  fx: 9,
  fy: 17,
  k: 0,
  stool: true,
  frames: 16,
  frameTicks: 2,
  spec(L, frame) {
    const C = JAR
    const shapes: Shape[] = [
      {
        t: 'p',
        pts: [
          [3, 10],
          [15, 10],
          [16, 12],
          [16, 23.4],
          [14.6, 25],
          [3.4, 25],
          [2, 23.4],
          [2, 12],
        ],
        c: C.glass,
        s: C.glassS,
        h: C.glassH,
        k: 'jar',
      },
      { t: 'p', pts: rect(4, 7, 14, 10.4), c: C.glassS, edge: true },
      { t: 'p', pts: JAR_CLOTH, c: C.cloth, edge: true },
    ]
    const paints: Paint[] = []
    if (L) {
      const g = mix(C.glass, C.glow, 0.18 + L * 0.06)
      paints.push({
        t: 'e',
        x: 9,
        y: 17.5,
        rx: 2.5 + L * 1.1,
        ry: 3 + L * 1.2,
        c: g,
        on: ['jar'],
      })
      if (L >= 3) {
        paints.push({
          t: 'e',
          x: 9,
          y: 17.5,
          rx: L - 0.5,
          ry: L,
          c: mix(g, C.glow, 0.3),
          on: ['jar'],
        })
      }
    }
    const feats: FeaturePixel[] = [
      ...JAR_GINGHAM,

      ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(
        (x): FeaturePixel => [x, 9, C.twine]
      ),
      [16, 8, C.twine],
      [16, 10, C.twine],
      [17, 11, C.twine],

      [4, 12, C.shine],
      [3, 13, C.shine],
      [3, 14, C.shine],
      [3, 15, C.shine],
      [14, 23, C.shine],
    ]
    const lit = FIREFLIES_LIT[L]
    FIREFLIES.forEach(([x0, y0], i) => {
      const x = x0 + Math.round(Math.sin((frame + i * 5) * 0.39))
      const y = y0 + Math.round(Math.cos((frame + i * 3) * 0.39) * 0.8)
      if (i >= lit) {
        if (i < 3) feats.push([x0, y0, C.flyOff])
        return
      }
      if ((frame + i * 5) % 16 === 0) {
        feats.push([x, y, mix(C.flyOff, C.flyHalo, 0.5)])
        return
      }
      feats.push([x, y, C.fly])
      if (L >= 3) {
        paints.push({
          t: 'e',
          x: x + 0.5,
          y: y + 0.5,
          rx: 1.5,
          ry: 1.5,
          c: mix(C.glass, C.flyHalo, 0.3 + L * 0.1),
          on: ['jar'],
        })
      }
    })
    return { shapes, paints, feats }
  },
}

const MUSHROOM = rgbPalette({
  cap: '#9a6440',
  capS: '#74462a',
  capH: '#c08458',
  freckle: '#b88560',
  stem: '#efe2c6',
  stemS: '#cdbb98',
  gillOff: '#5a4030',
  gillLine: '#c99a62',
  moss: '#6f8f4a',
  mossS: '#557236',
  mossH: '#8fae5e',
})

function mushroomShapes(
  cx: number,
  capY: number,
  rx: number,
  ry: number,
  stemW: number,
  baseY: number,
  L: number,
  glow: number,
  k: string
): Shape[] {
  const C = MUSHROOM
  const gill = byLevel(C.gillOff, GLOW.warm, L * glow)
  const stemTop = byLevel(C.stem, mix(C.stem, GLOW.bright, 0.8), L * glow)
  const stem: Pt[] = [
    [cx - stemW * 0.55, baseY],
    [cx + stemW * 0.55, baseY],
    [cx + stemW * 0.42, capY + 1],
    [cx - stemW * 0.42, capY + 1],
  ]
  return [
    { t: 'p', pts: stem, c: C.stem, g: k },
    {
      t: 'p',
      pts: [
        [cx + stemW * 0.55 - 1.2, baseY],
        stem[1],
        stem[2],
        [cx + stemW * 0.42 - 1, capY + 1],
      ],
      c: C.stemS,
      g: k,
    },
    {
      t: 'p',
      pts: rect(cx - 0.5, capY + 1, cx + 0.5, capY + 4),
      c: stemTop,
      g: k,
    },
    {
      t: 'p',
      pts: [
        ...arc(cx, capY, rx, ry, 180, 360, 20),
        [cx + rx - 0.6, capY + 0.8],
      ],
      c: C.cap,
      s: C.capS,
      h: C.capH,
      k,
      edge: true,
    },
    {
      t: 'e',
      x: cx,
      y: capY + 0.8,
      rx: rx - 2,
      ry: Math.max(1, ry * 0.3),
      c: gill,
      no: true,
    },
  ]
}

const mushroom: LampDefinition = {
  width: 24,
  height: 26,
  ox: 114,
  oy: 51,
  fx: 10,
  fy: 13,
  k: 0,
  stool: true,
  frames: 1,
  spec(L) {
    const C = MUSHROOM
    const shapes: Shape[] = [
      {
        t: 'e',
        x: 12,
        y: 23.4,
        rx: 9,
        ry: 1.8,
        c: C.moss,
        s: C.mossS,
        h: C.mossH,
      },
      ...mushroomShapes(18.6, 17.4, 3.8, 2.8, 2.2, 23.4, L, 0.7, 'small'),
      ...mushroomShapes(10, 12, 8.8, 6.4, 4, 23.6, L, 1, 'big'),
    ]

    const paints: Paint[] = L
      ? [
          {
            t: 'p',
            pts: rect(0, 10.6, 24, 13),
            c: byLevel(C.cap, mix(C.capH, GLOW.warm, 0.5), L),
            on: ['big'],
          },
          {
            t: 'p',
            pts: rect(0, 16.4, 24, 18),
            c: byLevel(C.cap, mix(C.capH, GLOW.warm, 0.4), L * 0.7),
            on: ['small'],
          },
        ]
      : []
    const gillLine = byLevel(C.gillOff, C.gillLine, L)
    const feats: FeaturePixel[] = [
      [6, 7, C.freckle],
      [9, 5, C.freckle],
      [13, 7, C.freckle],
      [7, 9, C.freckle],
      [15, 9, C.freckle],
      [11, 8, C.freckle],
      [17, 16, C.freckle],
      [19, 15, C.freckle],
      ...[3, 5, 7, 13, 15, 17].map((x): FeaturePixel => [x, 13, gillLine]),

      [4, 22, C.mossH],
      [5, 21, C.moss],
      [15, 22, C.mossH],
      [21, 22, C.mossH],
    ]
    if (L >= 3) {
      feats.push(
        ...[8, 9, 10, 11].map((x): FeaturePixel => [x, 12, GLOW.core]),
        ...(L === 5
          ? [7, 12].map((x): FeaturePixel => [x, 12, GLOW.bright])
          : [])
      )
    }
    return { shapes, paints, feats }
  },
}

const PEARL = rgbPalette({
  shell: '#e8a898',
  shellS: '#c27e70',
  shellH: '#f5c8bb',
  rib: '#cf8c7e',
  nacre: '#c8b6d8',
  nacreS: '#a995c0',
  nacreH: '#e2d6ec',
  halo: '#efc6de',
  haloCore: '#f8e2ee',
  dull: '#a69aa6',
  dullS: '#857986',
  dullH: '#c2b7c1',
  lustre: '#fff7fa',
  lustreS: '#dcbad0',
  lustreH: '#fff4f6',
  blush: '#f2c6da',
})

const PEARL_AT = { x: 13, y: 14.5, r: 3.7 }

function pearlFan(r: number): Pt[] {
  const pts: Pt[] = [[13, 17.5]]
  for (let i = 0; i <= 30; i++) {
    const a = ((196 + (148 * i) / 30) * Math.PI) / 180
    const lobe = 0.8 * Math.abs(Math.cos((i * Math.PI) / 5))
    pts.push([
      13 + (r + lobe) * Math.cos(a),
      17.5 + (r + lobe) * 1.02 * Math.sin(a),
    ])
  }
  return pts
}

const PEARL_BOWL: readonly Pt[] = [
  [1.4, 16.8],
  [3.6, 17.8],
  [5.8, 17],
  [8, 17.9],
  [10.4, 17.1],
  [13, 18],
  [15.6, 17.1],
  [18, 17.9],
  [20.2, 17],
  [22.4, 17.8],
  [24.6, 16.8],
  [23.2, 19.8],
  [19.4, 22.2],
  [13, 23.1],
  [6.6, 22.2],
  [2.8, 19.8],
]

const PEARL_RIBS: readonly Pt[] = (() => {
  const ribs = new Map<string, Pt>()
  for (const deg of [222, 242, 260, 280, 298, 318]) {
    const a = (deg * Math.PI) / 180
    for (let r = 3; r <= 12; r += 0.5) {
      const x = Math.floor(13 + r * 1.6 * Math.cos(a))
      const y = Math.floor(27 + r * Math.sin(a))
      if (
        inside(PEARL_BOWL, x + 0.5, y - 0.5) &&
        inside(PEARL_BOWL, x + 0.5, y + 1.5)
      )
        ribs.set(`${x},${y}`, [x, y])
    }
  }
  return [...ribs.values()]
})()

const PEARL_GLINTS: readonly Pt[] = [
  [5, 9],
  [19, 8],
  [3, 15],
  [22, 13],
]

const pearl: LampDefinition = {
  width: 26,
  height: 24,
  ox: 114,
  oy: 53,
  fx: 13,
  fy: 14.5,
  k: 0,
  stool: true,
  frames: 16,
  frameTicks: 2,
  spec(L, frame) {
    const C = PEARL
    const P = PEARL_AT

    const lustre = L ? Math.min(1, 0.4 + L * 0.15) : 0
    const shapes: Shape[] = [
      { t: 'p', pts: pearlFan(11.2), c: C.shell, s: C.shellS, h: C.shellH },
      {
        t: 'p',
        pts: pearlFan(9.6),
        c: C.nacre,
        s: C.nacreS,
        h: C.nacreH,
        k: 'nacre',
        g: 'nacre',
      },
    ]
    const paints: Paint[] = []
    if (L) {
      const halo = mix(C.nacre, C.halo, 0.3 + L * 0.1)
      paints.push({
        t: 'e',
        x: P.x,
        y: P.y,
        rx: 4.6 + L * 0.9,
        ry: 4.2 + L * 0.8,
        c: halo,
        on: ['nacre'],
      })
      if (L >= 3) {
        paints.push({
          t: 'e',
          x: P.x,
          y: P.y,
          rx: 3.6 + L * 0.6,
          ry: 3.4 + L * 0.5,
          c: mix(halo, C.haloCore, 0.5),
          on: ['nacre'],
        })
      }
    }
    shapes.push(
      {
        t: 'e',
        x: P.x,
        y: P.y,
        rx: P.r,
        ry: P.r,
        c: mix(C.dull, C.lustre, lustre),
        s: mix(C.dullS, C.lustreS, lustre),
        h: mix(C.dullH, C.lustreH, lustre),
        edge: true,
      },
      {
        t: 'p',
        pts: PEARL_BOWL,
        c: C.shell,
        s: C.shellS,
        h: C.shellH,
        edge: true,
      }
    )
    const feats: FeaturePixel[] = PEARL_RIBS.map(
      ([x, y]): FeaturePixel => [x, y, C.rib]
    )

    feats.push([11, 12, L ? C.lustreH : C.dullH])
    if (L) feats.push([12, 12, C.lustreH], [11, 13, C.lustreH])
    if (L >= 2) feats.push([16, 15, C.blush], [15, 16, C.blush])
    if (L >= 3 && frame % 4 < 2) {
      const [x, y] = PEARL_GLINTS[Math.floor(frame / 4)]
      feats.push([x, y, WHITE])
    }
    return { shapes, paints, feats }
  },
}

const CACTUS = rgbPalette({
  pot: '#c4683e',
  potS: '#94492a',
  potH: '#de8a5c',
  rim: '#cf7647',
  soil: '#5a3a26',
  green: '#5f9a4f',
  greenS: '#3f7238',
  greenH: '#86bf6c',
  rib: '#4b8040',
  spine: '#eef3cf',
  bud: '#9a5a6e',
  budS: '#7a4256',
  petal: '#e0709a',
  petalLit: '#ffb6d0',
  petalS: '#b9507a',
  centre: '#f2c84a',
  centreLit: '#fff3a8',
})

const BLOOM: readonly number[] = [0, 1.7, 2.2, 2.7, 3.2, 3.7]

const cactus: LampDefinition = {
  width: 20,
  height: 34,
  ox: 117,
  oy: 43,
  fx: 10,
  fy: 9.5,
  k: 0,
  stool: true,
  frames: 1,
  spec(L) {
    const C = CACTUS
    const green = { c: C.green, s: C.greenS, h: C.greenH }
    const shapes: Shape[] = [
      {
        t: 'p',
        pts: [
          [8, 21],
          [5, 21],
          [3.6, 19.6],
          [3.6, 14.4],
          [4.8, 13.2],
          [6, 14.4],
          [6, 18.6],
          [8, 18.6],
        ],
        ...green,
      },
      {
        t: 'p',
        pts: [
          [12, 19],
          [14.6, 19],
          [15.8, 17.8],
          [15.8, 13.4],
          [14.6, 12.2],
          [13.4, 13.4],
          [13.4, 16.8],
          [12, 16.8],
        ],
        ...green,
      },

      {
        t: 'p',
        pts: [
          [7, 24],
          [13, 24],
          [13, 13],
          [12.2, 11.2],
          [10, 10.4],
          [7.8, 11.2],
          [7, 13],
        ],
        ...green,
        edge: true,
      },

      { t: 'e', x: 10, y: 23.6, rx: 5, ry: 1, c: C.soil },
      {
        t: 'p',
        pts: [
          [5.4, 25.6],
          [14.6, 25.6],
          [13.6, 33],
          [6.4, 33],
        ],
        c: C.pot,
        s: C.potS,
        h: C.potH,
        edge: true,
      },
      {
        t: 'p',
        pts: rect(4.4, 23.6, 15.6, 26.4),
        c: C.rim,
        s: C.potS,
        edge: true,
      },
    ]
    if (L) {
      const R = BLOOM[L]
      const petal = byLevel(C.petal, C.petalLit, L)
      for (let i = 0; i < 5; i++) {
        const a = ((-90 + i * 72) * Math.PI) / 180
        shapes.push({
          t: 'e',
          x: 10 + Math.cos(a) * R * 0.55,
          y: 9.5 + Math.sin(a) * R * 0.45,
          rx: R * 0.55,
          ry: R * 0.48,
          c: petal,
          s: C.petalS,
          g: 'bloom',
        })
      }
      shapes.push({
        t: 'e',
        x: 10,
        y: 9.5,
        rx: 0.6 + R * 0.22,
        ry: 0.6 + R * 0.2,
        c: byLevel(C.centre, C.centreLit, L),
        g: 'bloom',
        no: true,
      })
    } else {
      shapes.push({
        t: 'e',
        x: 10,
        y: 9.6,
        rx: 1.3,
        ry: 1.8,
        c: C.bud,
        s: C.budS,
      })
    }
    const feats: FeaturePixel[] = [
      [9, 14, C.rib],
      [9, 16, C.rib],
      [9, 18, C.rib],
      [9, 20, C.rib],
      [9, 22, C.rib],
      [11, 13, C.rib],
      [11, 15, C.rib],
      [11, 17, C.rib],
      [11, 19, C.rib],
      [11, 21, C.rib],
      [8, 13, C.spine],
      [12, 15, C.spine],
      [8, 19, C.spine],
      [12, 21, C.spine],
      [10, 17, C.spine],
      [4, 15, C.spine],
      [15, 15, C.spine],
    ]
    if (L >= 3) feats.push([10, 9, GLOW.core])
    return { shapes, feats }
  },
}

const ROCKET = rgbPalette({
  hull: '#f1e6cc',
  hullS: '#cdbf9f',
  hullH: '#fff6e2',
  red: '#cc4a3c',
  redS: '#97342a',
  redH: '#e8705f',
  frame: '#9aa3ad',
  frameS: '#6f7882',
  glassOff: '#2f3b4c',
  nozzle: '#4a4f5a',
  rivet: '#c2b591',
})

const rocket: LampDefinition = {
  width: 20,
  height: 42,
  ox: 117,
  oy: 52,
  fx: 10,
  fy: 17,
  k: 0,
  stool: false,
  frames: 6,
  frameTicks: 1,
  spec(L, frame) {
    const C = ROCKET
    const red = { c: C.red, s: C.redS, h: C.redH }
    const shapes: Shape[] = []

    if (L >= 3) {
      const H = [0, 0, 0, 1.4, 2, 2.6][L] + [0, 0.5, 0.2, 0.7, 0.1, 0.4][frame]
      shapes.push(
        {
          t: 'e',
          x: 10,
          y: 37.4 + H,
          rx: 1.9,
          ry: H + 0.4,
          c: rgb('#ff8f2a'),
          no: true,
        },
        {
          t: 'e',
          x: 10,
          y: 37.4 + H * 0.7,
          rx: 1.1,
          ry: H * 0.7,
          c: rgb('#ffd04a'),
          no: true,
        }
      )
    }
    shapes.push(
      {
        t: 'p',
        pts: [
          [6, 25],
          [2.4, 31],
          [1.6, 40],
          [6, 36],
        ],
        ...red,
      },
      {
        t: 'p',
        pts: [
          [14, 25],
          [17.6, 31],
          [18.4, 40],
          [14, 36],
        ],
        ...red,
      },
      { t: 'p', pts: rect(7.4, 35, 12.6, 38.4), c: C.nozzle, edge: true },

      {
        t: 'p',
        pts: [
          [10, 3],
          [12.6, 6],
          [14.2, 11],
          [14.8, 18],
          [14.8, 30],
          [13.6, 36],
          [6.4, 36],
          [5.2, 30],
          [5.2, 18],
          [5.8, 11],
          [7.4, 6],
        ],
        c: C.hull,
        s: C.hullS,
        h: C.hullH,
        k: 'hull',
        edge: true,
      },

      {
        t: 'e',
        x: 10,
        y: 17,
        rx: 3.3,
        ry: 3.3,
        c: C.frame,
        s: C.frameS,
        edge: true,
      },
      {
        t: 'e',
        x: 10,
        y: 17,
        rx: 2.3,
        ry: 2.3,
        c: byLevel(C.glassOff, GLOW.warm, L),
        no: true,
      }
    )
    if (L) {
      shapes.push({
        t: 'e',
        x: 10,
        y: 17,
        rx: 0.5 + L * 0.3,
        ry: 0.5 + L * 0.3,
        c: byLevel(GLOW.warm, GLOW.core, L),
        no: true,
      })
    }

    shapes.push({
      t: 'p',
      pts: [
        [9.2, 30],
        [10.8, 30],
        [10.8, 40],
        [9.2, 40],
      ],
      ...red,
      edge: true,
    })
    const paints = [
      { t: 'p', pts: rect(0, 0, 20, 9.4), ...red, on: ['hull'] },
      { t: 'p', pts: rect(0, 27, 20, 28.4), c: C.red, on: ['hull'] },
    ] as const satisfies readonly Paint[]
    const feats: FeaturePixel[] = [
      [7, 12, C.rivet],
      [12, 12, C.rivet],
      [7, 23, C.rivet],
      [12, 23, C.rivet],
      [9, 16, L ? WHITE : rgb('#5d6a7c')],
    ]
    return { shapes, paints, feats }
  },
}

const HURRICANE = rgbPalette({
  c: '#a9b0b6',
  s: '#7d858d',
  h: '#d4d9dd',
  wire: '#5e656d',
})

const hurricane: LampDefinition = {
  width: 22,
  height: 36,
  ox: 116,
  oy: 41,
  fx: 11,
  fy: 25.6,
  k: 0.55,
  stool: true,
  spec(L, tick, fl) {
    const C = HURRICANE
    const metal = { c: C.c, s: C.s, h: C.h }
    const g = mix(GLASS_DARK, GLASS_LIT, L / 5)
    const shapes: Shape[] = [
      { t: 'p', pts: rect(2.6, 13, 4.2, 31), ...metal, g: 'frame' },
      { t: 'p', pts: rect(17.8, 13, 19.4, 31), ...metal, g: 'frame' },
      { t: 'p', pts: rect(2.6, 13, 19.4, 14.6), ...metal, g: 'frame' },
      {
        t: 'p',
        pts: [
          [3.4, 34.6],
          [18.6, 34.6],
          [19.2, 31.6],
          [17, 28.6],
          [5, 28.6],
          [2.8, 31.6],
        ],
        ...metal,
        edge: true,
      },

      {
        t: 'e',
        x: 11,
        y: 21.6,
        rx: 5.8,
        ry: 6.6,
        c: g,
        h: mix(g, WHITE, 0.3),
        edge: true,
      },
      ...flameShapes(11, 25.6, L, 0.55, fl),
      { t: 'p', pts: rect(7.6, 26.4, 14.4, 29), ...metal, edge: true },
      { t: 'e', x: 16.6, y: 28, rx: 1.1, ry: 1.1, c: C.s },

      {
        t: 'p',
        pts: [
          [6.4, 13.6],
          [15.6, 13.6],
          [13.6, 10.6],
          [8.4, 10.6],
        ],
        ...metal,
        edge: true,
      },
      { t: 'e', x: 11, y: 10.4, rx: 2.6, ry: 1, ...metal, edge: true },
    ]
    const feats: FeaturePixel[] = [
      ...[17, 18, 19, 20, 21, 22, 23, 24, 25].flatMap((y): FeaturePixel[] => [
        [7, y, C.wire],
        [14, y, C.wire],
      ]),
      [11, 25, rgb('#3b2a14')],
    ]

    for (let i = 0; i <= 24; i++) {
      const a = Math.PI + (Math.PI * i) / 24
      feats.push([
        Math.round(11 + 7.8 * Math.cos(a) - 0.5),
        Math.round(13 + 5 * Math.sin(a)),
        C.wire,
      ])
    }
    if (!L) feats.push(...smokePixels(11, 10, tick))
    return { shapes, feats }
  },
}

const TANK = rgbPalette({
  wood: '#3a3440',
  woodS: '#28242c',
  woodH: '#56505e',
  water: '#1f2b4a',
  waterLit: '#344c8c',
  waterS: '#172038',
  edge: '#8ea3c4',
  halo: '#7a7cd0',
  bell: '#5a4c88',
  bellLit: '#cfb2ff',
  bellS: '#3e3466',
  bellSLit: '#a486e8',
  arm: '#4a4078',
  armLit: '#bf9cff',
  pebble: '#56607a',
  pebbleB: '#414a62',
  bubble: '#a8bce8',
})

const jellyfish: LampDefinition = {
  width: 24,
  height: 28,
  ox: 115,
  oy: 49,
  fx: 12,
  fy: 11,
  k: 0,
  stool: true,
  frames: 16,
  frameTicks: 2,
  spec(L, frame) {
    const C = TANK
    const wood = { c: C.wood, s: C.woodS, h: C.woodH }
    const water = byLevel(C.water, C.waterLit, L)
    const bob = Math.round(Math.sin((frame / 16) * 2 * Math.PI) * 1.2)
    const by = 11 + bob
    const bell = byLevel(C.bell, C.bellLit, L)
    const shapes: Shape[] = [
      {
        t: 'p',
        pts: rect(3, 6, 21, 23),
        c: water,
        s: mix(water, C.waterS, 0.6),
        k: 'water',
      },
      { t: 'p', pts: rect(2, 22.6, 22, 27), ...wood, edge: true },
      { t: 'p', pts: rect(2, 4, 22, 6.6), ...wood, edge: true },

      {
        t: 'p',
        pts: [
          ...arc(12, by + 0.8, 4.2, 4, 180, 360, 14),
          [16.2, by + 1.6],
          [7.8, by + 1.6],
        ],
        c: bell,
        s: byLevel(C.bellS, C.bellSLit, L),
        no: true,
      },
    ]
    if (L >= 2) {
      shapes.push({
        t: 'e',
        x: 12,
        y: by,
        rx: 1.2 + L * 0.3,
        ry: 0.8 + L * 0.2,
        c: mix(bell, WHITE, 0.1 + L * 0.05),
        no: true,
      })
    }
    const paints: Paint[] = []
    if (L) {
      const halo = mix(water, C.halo, 0.2 + L * 0.05)
      paints.push({
        t: 'e',
        x: 12,
        y: by + 2,
        rx: 3.4 + L * 1.2,
        ry: 3.6 + L * 1.1,
        c: halo,
        on: ['water'],
      })
      if (L >= 3) {
        paints.push({
          t: 'e',
          x: 12,
          y: by + 2,
          rx: 2.4 + L * 0.7,
          ry: 2.6 + L * 0.7,
          c: mix(halo, C.halo, 0.4),
          on: ['water'],
        })
      }
    }
    const arm = byLevel(C.arm, C.armLit, L)
    const armTip = mix(arm, water, 0.5)
    const frill = mix(bell, WHITE, 0.2)
    const feats: FeaturePixel[] = [
      ...[4, 6, 8, 10, 12, 14, 16, 18].map(
        (x, i): FeaturePixel => [x, 21, i % 2 ? C.pebbleB : C.pebble]
      ),
      ...[5, 9, 13, 17, 19].map((x): FeaturePixel => [x, 21, C.pebbleB]),
      ...[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map(
        (x): FeaturePixel => [x, 7, mix(water, C.edge, 0.45)]
      ),
      ...[8, 9, 10, 11, 12, 13, 14, 15, 16].map(
        (y): FeaturePixel => [3, y, mix(water, C.edge, 0.5)]
      ),
      [20, 18, mix(water, C.edge, 0.5)],
      [20, 19, mix(water, C.edge, 0.5)],

      ...[8, 9, 10, 11, 12, 13, 14, 15].map(
        (x): FeaturePixel => [x, by + 1, x % 2 ? frill : bell]
      ),
      [10, by - 2, mix(bell, WHITE, 0.6)],
      [9, by - 1, mix(bell, WHITE, 0.45)],
    ]

    const sway = (j: number, i: number): number =>
      Math.round(Math.sin((j + frame * 0.8 + i * 2) * 0.7) * 0.7)
    for (let j = 2; j <= 8; j++) {
      const c = j > 6 ? armTip : arm
      feats.push([11 + sway(j, 0), by + j, c], [12 + sway(j, 1), by + j, c])
    }
    for (let j = 2; j <= 9; j++) {
      const c = j > 6 ? armTip : mix(arm, water, 0.2)
      feats.push([8 + sway(j, 2), by + j, c], [15 + sway(j, 3), by + j, c])
    }

    feats.push(
      [5, 20 - ((frame * 2) % 13), C.bubble],
      [18, 20 - ((frame * 2 + 7) % 13), C.bubble]
    )
    return { shapes, paints, feats }
  },
}

const LAVA = rgbPalette({
  c: '#b8bec6',
  s: '#868d97',
  h: '#e4e8ec',
  liquid: '#4a2c3a',
  liquidLit: '#ffb347',
  liquidS: '#3a2230',
  liquidSLit: '#e8892c',
  wax: '#8c3a34',
  waxLit: '#ff5a3a',
  waxH: '#ffa070',
})

const LAVA_BLOBS: readonly (readonly [number, number, number])[] = [
  [0, 0, 1.6],
  [-0.6, 0.45, 1.2],
  [0.7, 0.7, 1.35],
  [-0.2, 0.2, 1],
]

const lava: LampDefinition = {
  width: 16,
  height: 30,
  ox: 119,
  oy: 47,
  fx: 8,
  fy: 13,
  k: 0,
  stool: true,
  frames: 24,
  frameTicks: 2,
  spec(L, frame) {
    const C = LAVA
    const metal = { c: C.c, s: C.s, h: C.h }
    const wax = byLevel(C.wax, C.waxLit, L)
    const liquid = byLevel(C.liquid, C.liquidLit, L)
    const shapes: Shape[] = [
      {
        t: 'p',
        pts: [
          [5.4, 20.4],
          [10.6, 20.4],
          [11.6, 15],
          [10.6, 8],
          [9.6, 5],
          [6.4, 5],
          [5.4, 8],
          [4.4, 15],
        ],
        c: liquid,
        s: byLevel(C.liquidS, C.liquidSLit, L),
        h: mix(liquid, WHITE, 0.25),
        k: 'glass',
      },

      {
        t: 'p',
        pts: [
          [5, 20],
          [11, 20],
          [13.6, 29],
          [2.4, 29],
        ],
        ...metal,
        edge: true,
      },
      {
        t: 'p',
        pts: [
          [6.2, 5.4],
          [9.8, 5.4],
          [9, 1.4],
          [7, 1.4],
        ],
        ...metal,
        edge: true,
      },
    ]

    const paints: Paint[] = [
      {
        t: 'e',
        x: 8,
        y: 20.6,
        rx: 4.4,
        ry: L ? 1.6 : 2.2,
        c: wax,
        on: ['glass'],
      },
    ]
    LAVA_BLOBS.slice(0, Math.min(L, 4)).forEach(([dx, phase, r]) => {
      const t = (frame / 24 + phase) * 2 * Math.PI
      const x = 8 + dx + Math.sin(t * 2) * 0.4
      const y = 13 - Math.sin(t) * 5.4
      paints.push({ t: 'e', x, y, rx: r, ry: r * 1.25, c: wax, on: ['glass'] })
      if (L >= 3) {
        paints.push({
          t: 'e',
          x: x - r * 0.3,
          y: y - r * 0.4,
          rx: r * 0.5,
          ry: r * 0.6,
          c: mix(wax, C.waxH, 0.6),
          on: ['glass'],
        })
      }
    })
    return { shapes, paints }
  },
}

export const LAMPS: Readonly<Record<LampId, LampDefinition>> = {
  clay: clayLamp,
  lantern,
  candle,
  stand,
  lighthouse,
  pierced,
  firefly,
  mushroom,
  pearl,
  cactus,
  rocket,
  hurricane,
  jellyfish,
  lava,
}

export function lampTick(tMs: number): number {
  return (tMs / 1000) * 6
}

const FLICKER_STEPS = 10

export function lampFlicker(level: number, tick: number): number {
  if (!level) return 0
  const fl = Math.sin(tick * 1.7) * 0.25 + Math.sin(tick * 3.1) * 0.15

  return Math.round(fl * FLICKER_STEPS) / FLICKER_STEPS + 0
}

export function lampLightOrigin(
  lamp: LampId,
  level: number
): readonly [number, number] {
  const L = LAMPS[lamp]
  return [L.ox + L.fx, L.oy + L.fy - FLAME_HEIGHT[level] * L.k * 0.5]
}

const sprites = createLru<PixelBuffer>(48)

export function lampSprite(
  lamp: LampId,
  level: number,
  tMs: number
): PixelBuffer {
  const tick = lampTick(tMs)
  const def = LAMPS[lamp]
  if (def.frames) {
    const n = def.frames
    const frame = ((Math.floor(tick / (def.frameTicks ?? 1)) % n) + n) % n
    return sprites.getOrCreate(`${lamp}|${level}|f${frame}`, () =>
      rasterize(def.spec(level, frame, 0), def.width, def.height)
    )
  }
  const fl = lampFlicker(level, tick)
  const smoke = level ? 0 : Math.floor(tick * 3) % 4
  const key = `${lamp}|${level}|${level ? fl : smoke}`
  return sprites.getOrCreate(key, () => {
    const L = LAMPS[lamp]
    return rasterize(L.spec(level, tick, fl), L.width, L.height)
  })
}

const STOOL = rgbPalette({ top: '#8a5a3a', edge: '#6e4529', leg: '#7a4f30' })

export function drawStool(buf: PixelBuffer): void {
  fillRect(buf, 116, 76, 152, 79, STOOL.top)
  fillRect(buf, 116, 79, 152, 80, STOOL.edge)
  fillRect(buf, 119, 80, 122, 92, STOOL.leg)
  fillRect(buf, 146, 80, 149, 92, STOOL.leg)
}

let stoolOnly: PixelBuffer | null = null

export function stoolLayer(): PixelBuffer {
  if (!stoolOnly) {
    stoolOnly = createBuffer(SCENE_W, SCENE_H)
    drawStool(stoolOnly)
  }
  return stoolOnly
}
