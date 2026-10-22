/**
 * Secret playful hats: things that would never be hats outside the game. Drawn
 * in the full hat canvas (`hatShapes.ts`): {@link HAT_W} × {@link HAT_H}, centred
 * on {@link HAT_CX}, lowest brim pixels on {@link HAT_BRIM_ROW}.
 */
import {
  rgbPalette,
  type FeaturePixel,
  type Rgb,
  type ShapeSpec,
} from '@/lib/pixelArt'

import { dome, HAT_BRIM_ROW, HAT_CX, rect } from './hatShapes'

export type WhimsyHatId =
  | 'duck'
  | 'teapot'
  | 'sailboat'
  | 'pancakes'
  | 'camel'
  | 'pineapple'

const C = HAT_CX
/** The brim row, for feature pixels. */
const R = HAT_BRIM_ROW
/** The shapes' bottom edge, so their lowest pixels land on the brim row. */
const B = R + 0.9

const P = rgbPalette({
  duck: '#f7d23e',
  duckShade: '#d9a92a',
  duckLight: '#fff6b8',
  duckBeak: '#f08a24',
  eye: '#1a1a1a',
  teapot: '#2d7f87',
  teapotShade: '#1d5a60',
  teapotLight: '#7fc4c8',
  gold: '#d9a93c',
  goldLight: '#f2cf6e',
  steam: '#e4ecef',
  hull: '#1f4e79',
  hullShade: '#163a5c',
  hullStripe: '#c8402f',
  sail: '#f5f5f0',
  sailShade: '#c9d3dd',
  mast: '#7a5434',
  pancake: '#eebd6a',
  pancakeShade: '#c98d3e',
  pancakeLight: '#f8d898',
  plate: '#f3f5f7',
  plateShade: '#c9d2da',
  plateRim: '#6f9fc8',
  butter: '#ffe27a',
  butterShade: '#e8c454',
  butterLight: '#fff6c8',
  syrup: '#b4561a',
  syrupLight: '#e08a32',
  camel: '#dcb173',
  camelShade: '#ad7f45',
  camelLight: '#efd29c',
  blanket: '#a33b2a',
  blanketShade: '#7e2b1f',
  blanketTrim: '#e0b04a',
  blanketStripe: '#2f7f9a',
  pineapple: '#f2b630',
  pineappleShade: '#d99a1e',
  pineappleLight: '#ffd35e',
  crosshatch: '#c98a16',
  glint: '#fffbe8',
  leaf: '#3e8e3e',
  leafShade: '#2d6b2e',
  leafLight: '#5fb85a',
})

/** Pixels x0..x1 (inclusive) on row y. */
const run = (y: number, x0: number, x1: number, c: Rgb): FeaturePixel[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y, c] as const)

/** The pineapple's diamond crosshatch, inside an ellipse. */
function crosshatch(
  cx: number,
  cy: number,
  rx: number,
  ry: number
): FeaturePixel[] {
  const out: FeaturePixel[] = []
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      if (nx * nx + ny * ny > 1) continue
      if ((x + y) % 4 === 0 || (x - y + 40) % 4 === 0)
        out.push([x, y, P.crosshatch])
    }
  }
  return out
}

/** A pointed leaf of the pineapple's crown, from its base to its tip. */
function leaf(
  x0: number,
  x1: number,
  tipX: number,
  tipY: number,
  front = false
) {
  return {
    t: 'p',
    pts: [
      [x0, B - 8.6],
      [tipX, tipY],
      [x1, B - 8.6],
    ],
    c: P.leaf,
    s: P.leafShade,
    h: P.leafLight,
    g: front ? 'front' : 'back',
    edge: front,
  } as const
}

export const WHIMSY_HAT_SPECS: Readonly<Record<WhimsyHatId, ShapeSpec>> = {
  duck: {
    shapes: [
      {
        t: 'p',
        pts: [
          [C + 3.6, B - 3.4],
          [C + 8, B - 7.2],
          [C + 7.4, B - 2],
        ],
        c: P.duck,
        s: P.duckShade,
        g: 'duck',
      },
      {
        t: 'e',
        x: C + 1,
        y: B - 3.3,
        rx: 6.6,
        ry: 3.3,
        c: P.duck,
        s: P.duckShade,
        h: P.duckLight,
        g: 'duck',
      },
      {
        t: 'e',
        x: C + 2.4,
        y: B - 3.6,
        rx: 2.8,
        ry: 1.4,
        a: -14,
        c: P.duckShade,
        edge: true,
      },
      { t: 'e', x: C - 6.4, y: B - 8.3, rx: 2.2, ry: 1.1, c: P.duckBeak },
      {
        t: 'e',
        x: C - 2.6,
        y: B - 8.6,
        rx: 3.4,
        ry: 3.3,
        c: P.duck,
        s: P.duckShade,
        h: P.duckLight,
        edge: true,
      },
    ],
    feats: [
      [C - 4, R - 9, P.eye],
      [C - 3, R - 10, P.duckLight],
      [C - 2, R - 11, P.duckLight],
      [C - 4, R - 5, P.duckLight],
      [C - 3, R - 5, P.duckLight],
    ],
  },
  teapot: {
    shapes: [
      {
        t: 'p',
        pts: [
          [C + 3.6, B - 8],
          [C + 7.6, B - 8],
          [C + 9.4, B - 6.4],
          [C + 9.4, B - 4.2],
          [C + 7.2, B - 1.8],
          [C + 3.6, B - 1.8],
          [C + 3.6, B - 3.2],
          [C + 6.6, B - 3.2],
          [C + 7.8, B - 4.6],
          [C + 7.8, B - 6],
          [C + 7, B - 6.6],
          [C + 3.6, B - 6.6],
        ],
        c: P.teapot,
        s: P.teapotShade,
      },
      {
        t: 'p',
        pts: [
          [C - 3.8, B - 5.6],
          [C - 7.4, B - 8.4],
          [C - 9.2, B - 9.4],
          [C - 9.2, B - 8],
          [C - 7.6, B - 6],
          [C - 4.4, B - 2],
        ],
        c: P.teapot,
        s: P.teapotShade,
      },
      { t: 'p', pts: rect(C - 3.4, B - 1.4, C + 3.4, B), c: P.teapotShade },
      {
        t: 'e',
        x: C,
        y: B - 4.9,
        rx: 5.2,
        ry: 4.2,
        c: P.teapot,
        s: P.teapotShade,
        h: P.teapotLight,
        edge: true,
      },
      {
        t: 'p',
        pts: dome(C, B - 8.6, 3.2, 1.6),
        c: P.teapot,
        h: P.teapotLight,
        edge: true,
      },
      { t: 'e', x: C, y: B - 11, rx: 1.2, ry: 1.1, c: P.gold, h: P.goldLight },
    ],
    feats: [
      ...run(R - 4, C - 5, C + 4, P.gold),
      [C - 3, R - 6, P.teapotLight],
      [C - 3, R - 7, P.teapotLight],
      [C - 10, R - 10, P.steam],
      [C - 11, R - 11, P.steam],
      [C - 10, R - 12, P.steam],
    ],
  },
  sailboat: {
    shapes: [
      { t: 'p', pts: rect(C - 3.4, B - 17.2, C - 2.4, B - 3), c: P.mast },
      {
        t: 'p',
        pts: [
          [C - 2.4, B - 17.2],
          [C + 1.8, B - 16.4],
          [C - 2.4, B - 15.6],
        ],
        c: P.hullStripe,
      },
      {
        t: 'p',
        pts: [
          [C - 2.2, B - 15.4],
          [C + 2.6, B - 12.6],
          [C + 5.4, B - 10.2],
          [C + 6.8, B - 8],
          [C - 2.2, B - 8],
        ],
        c: P.sail,
        s: P.sailShade,
      },
      {
        t: 'p',
        pts: [
          [C - 9.6, B - 6.6],
          [C - 7, B - 3.6],
          [C + 6.8, B - 3.6],
          [C + 8.8, B - 5.4],
          [C + 6.2, B],
          [C - 5.2, B],
        ],
        c: P.hull,
        s: P.hullShade,
        g: 'hull',
        edge: true,
      },
      {
        t: 'p',
        pts: [
          [C - 7.6, B - 3.1],
          [C + 7.6, B - 3.1],
          [C + 7.2, B - 2.1],
          [C - 6.8, B - 2.1],
        ],
        c: P.hullStripe,
        g: 'hull',
      },
    ],
    feats: [
      ...run(R - 10, C - 2, C + 1, P.sailShade),
      [C - 4, R - 3, P.hullShade],
    ],
  },
  // Three pancakes on a plate, amber syrup running down, a pat of butter.
  pancakes: {
    shapes: [
      {
        t: 'e',
        x: C,
        y: B - 1,
        rx: 9.4,
        ry: 1.1,
        c: P.plate,
        s: P.plateShade,
        g: 'plate',
      },
      ...[
        [C - 0.4, B - 3.1, 7],
        [C + 0.6, B - 5.3, 6.6],
        [C - 0.2, B - 7.5, 6.2],
      ].map(
        ([x, y, rx]) =>
          ({
            t: 'e',
            x,
            y,
            rx,
            ry: 1.3,
            c: P.pancake,
            s: P.pancakeShade,
            h: P.pancakeLight,
            edge: true,
          }) as const
      ),
      {
        t: 'e',
        x: C,
        y: B - 8.2,
        rx: 4,
        ry: 1,
        c: P.syrup,
        g: 'top',
        no: true,
      },
      {
        t: 'p',
        pts: rect(C - 1.6, B - 10.8, C + 1.6, B - 8.6),
        c: P.butter,
        s: P.butterShade,
        g: 'top',
        edge: true,
      },
    ],
    feats: [
      [C - 1, R - 10, P.butterLight],
      [C - 3, R - 8, P.syrupLight],
      // Syrup running down the front of the stack.
      [C - 4, R - 7, P.syrup],
      [C - 4, R - 6, P.syrupLight],
      [C, R - 7, P.syrup],
      ...[R - 7, R - 6, R - 5, R - 4].map((y) => [C + 4, y, P.syrup] as const),
      [C + 4, R - 3, P.syrupLight],
      ...run(R, C - 7, C + 6, P.plateRim),
    ],
  },
  // A dromedary resting on its folded legs, facing left: one tall hump, the
  // neck dipping and rising to a long head, a striped blanket on its flank.
  camel: {
    shapes: [
      // The neck, dipping forward from the chest and rising to the head.
      {
        t: 'p',
        pts: [
          [C - 3.4, B - 3.4],
          [C - 6.4, B - 6.4],
          [C - 8, B - 9.6],
          [C - 6.2, B - 10.6],
          [C - 4.8, B - 8],
          [C - 1.8, B - 5.8],
        ],
        c: P.camel,
        s: P.camelShade,
        h: P.camelLight,
        g: 'camel',
      },
      {
        t: 'e',
        x: C + 2.2,
        y: B - 7.4,
        rx: 3.8,
        ry: 4.6,
        c: P.camel,
        s: P.camelShade,
        h: P.camelLight,
        g: 'camel',
      },
      {
        t: 'e',
        x: C + 1.6,
        y: B - 4,
        rx: 7.6,
        ry: 2.4,
        c: P.camel,
        s: P.camelShade,
        h: P.camelLight,
        g: 'camel',
      },
      // Folded legs.
      {
        t: 'e',
        x: C - 3.2,
        y: B - 1.1,
        rx: 2.2,
        ry: 1,
        c: P.camelShade,
        g: 'camel',
      },
      {
        t: 'e',
        x: C + 6.2,
        y: B - 1.1,
        rx: 2.2,
        ry: 1,
        c: P.camelShade,
        g: 'camel',
      },
      {
        t: 'p',
        pts: [
          [C - 0.6, B - 6.2],
          [C + 5, B - 6.2],
          [C + 5.8, B - 2.2],
          [C - 1.4, B - 2.2],
        ],
        c: P.blanket,
        s: P.blanketShade,
        edge: true,
      },
      {
        t: 'e',
        x: C - 8.2,
        y: B - 10.4,
        rx: 3,
        ry: 1.4,
        a: 16,
        c: P.camel,
        s: P.camelShade,
        h: P.camelLight,
        g: 'head',
        edge: true,
      },
    ],
    feats: [
      ...run(R - 5, C, C + 4, P.blanketStripe),
      ...run(R - 3, C - 1, C + 5, P.blanketTrim),
      [C, R - 2, P.blanketTrim],
      [C + 2, R - 2, P.blanketTrim],
      [C + 4, R - 2, P.blanketTrim],
      [C - 9, R - 11, P.eye],
      [C - 7, R - 12, P.camelShade],
      [C - 11, R - 9, P.camelShade],
      [C + 9, R - 4, P.camelShade],
      [C + 10, R - 3, P.camelShade],
    ],
  },
  pineapple: {
    shapes: [
      leaf(C - 3.8, C - 1.2, C - 7, B - 12.2),
      leaf(C + 1.2, C + 3.8, C + 7, B - 12.2),
      leaf(C - 1.6, C + 1.6, C, B - 17.8),
      leaf(C - 2.8, C, C - 4, B - 15.6, true),
      leaf(C, C + 2.8, C + 4, B - 15.6, true),
      {
        t: 'e',
        x: C,
        y: B - 4.6,
        rx: 4.4,
        ry: 4.6,
        c: P.pineapple,
        s: P.pineappleShade,
        h: P.pineappleLight,
        edge: true,
      },
    ],
    feats: [
      ...crosshatch(C, B - 4.6, 3.6, 3.9),
      // A soft gloss up left, a short curve rather than a sparkle.
      [C - 2, R - 7, P.glint],
      [C - 3, R - 6, P.glint],
      [C - 3, R - 5, P.pineappleLight],
    ],
  },
}
