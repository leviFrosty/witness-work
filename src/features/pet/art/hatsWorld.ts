/**
 * Secret hats from around the world: everyday work, weather and regional hats,
 * none tied to a religion, a ceremony or an office. Drawn in the full hat
 * canvas (`hatShapes.ts`): {@link HAT_W} × {@link HAT_H}, centred on
 * {@link HAT_CX}, lowest brim pixels on {@link HAT_BRIM_ROW}.
 */
import {
  rgbPalette,
  type FeaturePixel,
  type Rgb,
  type ShapeSpec,
} from '@/lib/pixelArt'

import { dome, HAT_BRIM_ROW, HAT_CX, HAT_H, HAT_W, rect } from './hatShapes'

export type WorldHatId =
  | 'nonla'
  | 'chullo'
  | 'salakot'
  | 'bowler'
  | 'straw'
  | 'fisherman'
  | 'bush'
  | 'tam'

const C = HAT_CX
/** The bottom edge of the brim: its lowest pixels are on {@link HAT_BRIM_ROW}. */
const B = HAT_BRIM_ROW + 1

const P = rgbPalette({
  nonla: '#d4a24c',
  nonlaShade: '#b07b30',
  nonlaLight: '#f2d58a',
  nonlaRing: '#c9963b',
  nonlaRingDark: '#b8843a',
  nonlaRim: '#a8742a',
  chullo: '#c8553d',
  chulloShade: '#a5402d',
  chulloLight: '#de7a5f',
  chulloCream: '#f2e8d5',
  chulloCreamShade: '#dccdb2',
  chulloNavy: '#2e4a6b',
  chulloFlap: '#e0a526',
  chulloFlapShade: '#b8841a',
  salakot: '#c8a165',
  salakotShade: '#8e6a3c',
  salakotLight: '#dcbc85',
  salakotWeave: '#a9834e',
  salakotRim: '#6b4c2a',
  salakotCord: '#3a2a1a',
  bowler: '#2e2624',
  bowlerShade: '#221c1a',
  bowlerLight: '#5a4b44',
  bowlerRibbon: '#9e2b25',
  bowlerKnot: '#c2423a',
  straw: '#e3cd8f',
  strawShade: '#cdb276',
  strawLight: '#f1e2b4',
  strawWeave: '#b39a5c',
  strawBand: '#7a2f2b',
  fisher: '#36547f',
  fisherShade: '#273f63',
  fisherLight: '#5274a3',
  fisherPeak: '#1a2232',
  fisherPeakLight: '#3a4862',
  fisherBrass: '#c9a24a',
  bush: '#6e4f33',
  bushShade: '#4a3523',
  bushLight: '#8f6c4a',
  bushBand: '#2a1d14',
  bushBandLight: '#5a4030',
  tam: '#3e5a8a',
  tamFold: '#26395a',
  tamLight: '#5c7ab0',
  tamPom: '#5c7ab0',
  tamPomLight: '#7f9bcb',
})

/** Whether (x, y) is inside the polygon `pts` (even-odd). */
function inside(
  pts: readonly (readonly [number, number])[],
  x: number,
  y: number
) {
  let hit = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      hit = !hit
  }
  return hit
}

/** Feature pixels of `c` on every canvas pixel `on` picks. */
function pattern(
  on: (x: number, y: number) => boolean,
  c: Rgb
): FeaturePixel[] {
  const out: FeaturePixel[] = []
  for (let y = 0; y < HAT_H; y++)
    for (let x = 0; x < HAT_W; x++) if (on(x, y)) out.push([x, y, c])
  return out
}

const NONLA_APEX = 5.4
const NONLA_RIM = B - 1.4
const NONLA_W = 10.6
const nonlaW = (y: number) =>
  (NONLA_W * (y - NONLA_APEX)) / (NONLA_RIM - NONLA_APEX)
const NONLA = [
  [C, NONLA_APEX],
  [C + NONLA_W, NONLA_RIM],
  [C - NONLA_W, NONLA_RIM],
] as [number, number][]

/** Whether a cone pixel is in its shadow, as the rasterizer shades it. */
const nonlaInShade = (x: number, y: number) =>
  ((x + 0.5 - C) / NONLA_W) * 0.45 +
    ((y + 0.5 - (NONLA_APEX + NONLA_RIM) / 2) /
      ((NONLA_RIM - NONLA_APEX) / 2)) *
      0.85 >
  0.52

/** A woven ring round the cone, dipping a pixel at the front. */
const nonlaRing = (ring: number): FeaturePixel[] =>
  pattern((x, y) => {
    const dx = x + 0.5 - C
    const w = nonlaW(ring) - 1
    if (Math.abs(dx) > w) return false
    return y === ring + (Math.abs(dx) < w * 0.5 ? 1 : 0)
  }, P.nonlaRing).map(([x, y]) => [
    x,
    y,
    nonlaInShade(x, y) ? P.nonlaRing : P.nonlaRingDark,
  ])

const CHULLO = dome(C, B, 6.6, 10, 12)
CHULLO.splice(6, 1, [C, B - 11.8])

/** An ear flap hanging below the cap, with its tassel. */
const chulloFlap = (side: 1 | -1) =>
  ({
    t: 'p',
    pts: [
      [C + side * 5, B - 4.4],
      [C + side * 7.6, B - 4.4],
      [C + side * 7.8, B - 1],
      [C + side * 6.5, B + 1.2],
      [C + side * 5.2, B - 1],
    ],
    c: P.chulloFlap,
    s: P.chulloFlapShade,
    edge: true,
    g: 'flap',
  }) as const

/** A dome that peaks a little and flares out into the brim, as a bell does. */
const SALAKOT = Array.from({ length: 19 }, (_, i): [number, number] => {
  const a = (i / 18) * Math.PI
  return [C - 11 * Math.cos(a), B - 0.8 - 8.6 * Math.sin(a) ** 0.75]
})

const STRAW_BRIM = { x: C, y: B - 1.5, rx: 10.8, ry: 1.5 }

/**
 * An outback felt hat's brim: flat across the front, curling down at both ends.
 * Neither side is pinned up.
 */
const BUSH_BRIM: [number, number][] = [
  [C - 11.2, B],
  [C - 11.4, B - 1],
  [C - 10, B - 2.4],
  [C - 7, B - 3.3],
  [C + 7, B - 3.3],
  [C + 10, B - 2.4],
  [C + 11.4, B - 1],
  [C + 11.2, B],
  [C + 9.6, B - 0.4],
  [C + 7, B - 1],
  [C - 7, B - 1],
  [C - 9.6, B - 0.4],
]

/** The crown, tapering up to a teardrop pinch with a crease down the middle. */
const BUSH_CROWN: [number, number][] = [
  [C - 5.4, B - 2.4],
  [C - 5, B - 6.4],
  [C - 4.4, B - 8.4],
  [C - 3.4, B - 9.6],
  [C - 0.8, B - 9.6],
  [C, B - 9],
  [C + 0.8, B - 9.6],
  [C + 3.4, B - 9.6],
  [C + 4.4, B - 8.4],
  [C + 5, B - 6.4],
  [C + 5.4, B - 2.4],
]

export const WORLD_HAT_SPECS: Readonly<Record<WorldHatId, ShapeSpec>> = {
  nonla: {
    shapes: [
      {
        t: 'p',
        pts: NONLA,
        c: P.nonla,
        s: P.nonlaShade,
        h: P.nonlaLight,
      },
      {
        t: 'e',
        x: C,
        y: B - 1.1,
        rx: NONLA_W + 0.3,
        ry: 1.1,
        c: P.nonlaRim,
        edge: true,
      },
    ],
    feats: [...nonlaRing(8), ...nonlaRing(11), ...nonlaRing(14)],
  },
  chullo: {
    shapes: [
      {
        t: 'p',
        pts: CHULLO,
        c: P.chullo,
        s: P.chulloShade,
        h: P.chulloLight,
        k: 'knit',
      },
      chulloFlap(-1),
      chulloFlap(1),
      // The tassel at the tip, flopped over to one side.
      {
        t: 'e',
        x: C + 4,
        y: B - 11.2,
        rx: 1.4,
        ry: 1.4,
        c: P.chulloFlap,
        s: P.chulloFlapShade,
        edge: true,
        g: 'tassel',
      },
    ],
    paints: [
      {
        t: 'p',
        pts: rect(0, B - 6, HAT_W, B - 1),
        c: P.chulloCream,
        s: P.chulloCreamShade,
        on: ['knit'],
      },
      {
        t: 'p',
        pts: rect(0, B - 1, HAT_W, B),
        c: P.chulloShade,
        on: ['knit'],
      },
    ],
    feats: [
      // A navy zigzag round the cream band.
      ...pattern(
        (x, y) =>
          inside(CHULLO, x + 0.5, y + 0.5) &&
          y - (B - 5) === [0, 1, 2, 1][(x + 2) % 4],
        P.chulloNavy
      ),
      ...[-4, -2, 1, 3].map((dx) => [C + dx, B - 8, P.chulloCream] as const),
      [C - 1, B - 13, P.chulloFlap],
      [C, B - 13, P.chulloFlap],
      [C, B - 14, P.chulloFlapShade],
      [C + 1, B - 14, P.chulloFlapShade],
      [C + 2, B - 14, P.chulloFlapShade],
      [C + 3, B - 13, P.chulloFlapShade],
      [C - 7, B + 1, P.chulloCream],
      [C + 6, B + 1, P.chulloCream],
      [C - 7, B - 3, P.chulloNavy],
      [C + 6, B - 3, P.chulloNavy],
    ],
  },
  salakot: {
    shapes: [
      {
        t: 'p',
        pts: SALAKOT,
        c: P.salakot,
        s: P.salakotShade,
        h: P.salakotLight,
      },
      {
        t: 'p',
        pts: [
          [C - 11.2, B - 1.4],
          [C + 11.2, B - 1.4],
          [C + 10.6, B],
          [C - 10.6, B],
        ],
        c: P.salakotRim,
        edge: true,
      },
      {
        t: 'p',
        pts: [
          [C - 1, B - 9.4],
          [C + 1, B - 9.4],
          [C + 1, B - 11.8],
          [C, B - 13.6],
          [C - 1, B - 11.8],
        ],
        c: P.salakotShade,
        h: P.salakotLight,
        g: 'finial',
      },
      {
        t: 'e',
        x: C,
        y: B - 9.6,
        rx: 1.9,
        ry: 0.7,
        c: P.salakotCord,
        g: 'finial',
      },
    ],
    feats: pattern(
      (x, y) =>
        inside(SALAKOT, x + 0.5, y + 0.5) && y < B - 3 && (x + y) % 3 === 0,
      P.salakotWeave
    ),
  },
  bowler: {
    shapes: [
      {
        t: 'p',
        pts: [
          [C - 3.8, B - 1],
          [C - 3.9, B - 5],
          ...dome(C, B - 5, 3.9, 5, 10).slice(1, -1),
          [C + 3.9, B - 5],
          [C + 3.8, B - 1],
        ],
        c: P.bowler,
        s: P.bowlerShade,
        h: P.bowlerLight,
      },
      {
        t: 'p',
        pts: rect(C - 3.8, B - 3.4, C + 3.8, B - 1.6),
        c: P.bowlerRibbon,
      },
      {
        t: 'p',
        pts: [
          [C - 6, B - 2.2],
          [C - 4.6, B - 1.6],
          [C + 4.6, B - 1.6],
          [C + 6, B - 2.2],
          [C + 5.4, B - 0.2],
          [C - 5.4, B - 0.2],
        ],
        c: P.bowler,
        s: P.bowlerShade,
        h: P.bowlerLight,
        edge: true,
      },
    ],
    feats: [
      [C + 2, B - 3, P.bowlerKnot],
      [C + 2, B - 2, P.bowlerKnot],
      [C + 3, B - 2, P.bowlerRibbon],
      [C - 2, B - 9, P.bowlerLight],
    ],
  },
  straw: {
    shapes: [
      {
        t: 'p',
        // A tall crown with a flat top, as Malagasy straw hats have.
        pts: [
          [C - 4.8, B - 2],
          [C - 4.5, B - 6.6],
          [C - 3.6, B - 7.6],
          [C + 3.6, B - 7.6],
          [C + 4.5, B - 6.6],
          [C + 4.8, B - 2],
        ],
        c: P.straw,
        s: P.strawShade,
        h: P.strawLight,
      },
      { t: 'p', pts: rect(C - 4.8, B - 4, C + 4.8, B - 2.2), c: P.strawBand },
      {
        t: 'e',
        ...STRAW_BRIM,
        c: P.straw,
        s: P.strawShade,
        h: P.strawLight,
        edge: true,
      },
    ],
    feats: pattern((x, y) => {
      const nx = (x + 0.5 - STRAW_BRIM.x) / (STRAW_BRIM.rx - 1)
      const ny = (y + 0.5 - STRAW_BRIM.y) / STRAW_BRIM.ry
      return nx * nx + ny * ny <= 1 && y >= B - 2 && (x + y) % 2 === 0
    }, P.strawWeave),
  },
  fisherman: {
    shapes: [
      {
        t: 'p',
        pts: rect(C - 5.8, B - 5, C + 5.8, B - 1.2),
        c: P.fisher,
        s: P.fisherShade,
      },
      // The soft crown, slouched forward over the band.
      {
        t: 'p',
        pts: [
          [C - 6.2, B - 4.4],
          [C - 7.2, B - 6.6],
          [C - 6.2, B - 8.6],
          [C + 1, B - 9.4],
          [C + 6.8, B - 8.4],
          [C + 7.8, B - 6.4],
          [C + 6.6, B - 4.4],
        ],
        c: P.fisher,
        s: P.fisherShade,
        h: P.fisherLight,
        edge: true,
      },
      {
        t: 'p',
        pts: [
          [C - 5.6, B - 1.6],
          [C + 5.6, B - 1.6],
          [C + 4.6, B],
          [C - 4.6, B],
        ],
        c: P.fisherPeak,
        h: P.fisherPeakLight,
        edge: true,
      },
    ],
    feats: [
      ...pattern(
        (x, y) => y === B - 4 && x >= C - 4 && x < C + 4,
        P.fisherPeak
      ),
      [C - 5, B - 4, P.fisherBrass],
      [C + 4, B - 4, P.fisherBrass],
      [C - 4, B - 8, P.fisherLight],
    ],
  },
  bush: {
    shapes: [
      {
        t: 'p',
        pts: BUSH_CROWN,
        c: P.bush,
        s: P.bushShade,
        h: P.bushLight,
      },
      { t: 'p', pts: rect(C - 5.2, B - 4.6, C + 5.2, B - 2.8), c: P.bushBand },
      {
        t: 'p',
        pts: BUSH_BRIM,
        c: P.bush,
        s: P.bushShade,
        h: P.bushLight,
        edge: true,
      },
    ],
    feats: [
      // The pinch: a dent each side of the front, and the crease on top.
      [C - 2, B - 8, P.bushShade],
      [C - 3, B - 7, P.bushShade],
      [C + 1, B - 8, P.bushShade],
      [C + 2, B - 7, P.bushShade],
      // The brim's ends curl down: their undersides show.
      [C - 11, B - 1, P.bushShade],
      [C + 10, B - 1, P.bushShade],
      // The band's knot, at the left.
      [C - 4, B - 4, P.bushBandLight],
      [C - 3, B - 4, P.bushBandLight],
    ],
  },
  tam: {
    shapes: [
      { t: 'p', pts: rect(C - 5.6, B - 3, C + 5.6, B - 0.2), c: P.tamFold },
      {
        t: 'e',
        x: C + 1,
        y: B - 4.6,
        rx: 9.8,
        ry: 2.8,
        a: -10,
        c: P.tamFold,
      },
      {
        t: 'e',
        x: C + 1.2,
        y: B - 6,
        rx: 9.6,
        ry: 2.9,
        a: -10,
        c: P.tam,
        s: P.tamFold,
        h: P.tamLight,
        g: 'top',
      },
      {
        t: 'e',
        x: C + 1.6,
        y: B - 10,
        rx: 2.2,
        ry: 1.9,
        c: P.tamPom,
        s: P.tam,
        h: P.tamPomLight,
        edge: true,
      },
    ],
    feats: pattern(
      (x, y) => y >= B - 2 && y < B && x >= C - 5 && x < C + 5 && x % 2 === 0,
      P.tam
    ),
  },
}
