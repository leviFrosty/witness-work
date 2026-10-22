/**
 * Hats: small pixel hats the pet can wear, drawn with the same shape rasterizer
 * as the pets so they get the same shading and outlines. The first twelve are
 * here; the secret ones are in `hatsWorld.ts` (folk hats from around the world)
 * and `hatsWhimsy.ts` (the playful ones).
 *
 * A hat is drawn in its own {@link HAT_W} × {@link HAT_H} canvas, centred on x
 * {@link HAT_CX}; its lowest brim row is {@link HAT_BRIM_ROW}. The scene puts
 * that row on the species' {@link HAT_ANCHOR_Y} row of the sprite (moved down
 * with the head's bob), centred on the sprite, so a hat can rise above the
 * sprite's 32 × 32 box. The first twelve are drawn {@link HAT_LIFT} rows lower
 * in a {@link HAT_SHORT_H}-row canvas and moved up into it, so their numbers
 * stay as they were drawn. A pet lying down (rolling over, or one that died)
 * has no hat.
 */
import {
  blit,
  createBuffer,
  createLru,
  flipH,
  rasterize,
  rgbPalette,
  type PixelBuffer,
  type Rgb,
  type Shape,
  type ShapeSpec,
} from '@/lib/pixelArt'
import type { HatId } from '@/types/pet'

import {
  dome,
  HAT_BRIM_ROW,
  HAT_CX,
  HAT_H,
  HAT_LIFT,
  HAT_SHORT_H,
  HAT_W,
  rect,
} from './hatShapes'
import { WHIMSY_HAT_SPECS } from './hatsWhimsy'
import { WORLD_HAT_SPECS } from './hatsWorld'
import { SPRITE_SIZE } from './layout'
import { greyed } from './sprite'
import type { GreyMode, PetSpeciesId } from './types'

export {
  HAT_BRIM_ROW,
  HAT_CX,
  HAT_H,
  HAT_LIFT,
  HAT_SHORT_H,
  HAT_W,
} from './hatShapes'

/**
 * The sprite row each species' hat brim sits on with no bob: just below the top
 * of the head, between the ears. The lamb's sits over its tuft of wool, so the
 * hat doesn't float on top of it.
 */
export const HAT_ANCHOR_Y: Readonly<Record<PetSpeciesId, number>> = {
  lion: 5,
  dog: 7,
  cat: 7,
  donkey: 7,
  lamb: 9,
}

/**
 * Species whose ears stand up through the hat, as through holes in it: the
 * sprite's pixels left of the first column and right of the second, above the
 * brim, are drawn again over the hat. Otherwise only the ear tips poke out
 * beside the crown.
 */
export const HAT_EARS_THROUGH: Readonly<
  Partial<Record<PetSpeciesId, readonly [left: number, right: number]>>
> = {
  donkey: [12, 19],
}

const C = HAT_CX

const P = rgbPalette({
  bow: '#ef7b9b',
  bowShade: '#cf5a7c',
  bowLight: '#ffa6bf',
  bowKnot: '#d9577a',
  cap: '#3f7fd0',
  capShade: '#2c5fa3',
  capLight: '#6aa3e8',
  capBill: '#2f67b0',
  beanie: '#d9534f',
  beanieShade: '#b23a37',
  beanieLight: '#ef7a72',
  beanieCuff: '#b8403c',
  beanieRib: '#cc4a45',
  pom: '#f5efe6',
  pomShade: '#ddd3c4',
  vine: '#5f9e4f',
  vineShade: '#4a7f3d',
  petalPink: '#f39ab4',
  petalYellow: '#f6d55c',
  petalWhite: '#fbf7ef',
  heartPink: '#d9577a',
  heartYellow: '#e0a43a',
  bucket: '#a8a06a',
  bucketShade: '#878050',
  bucketLight: '#c4bc86',
  bucketBrim: '#978f5c',
  bucketBrimShade: '#7a7349',
  beret: '#b03a3a',
  beretShade: '#8a2a2e',
  beretLight: '#d05a55',
  straw: '#e8c872',
  strawShade: '#c9a64e',
  strawLight: '#f6df9a',
  strawBrim: '#e2bf63',
  strawBrimShade: '#c29f45',
  ribbon: '#6fa8dc',
  hardhat: '#f5c542',
  hardhatShade: '#d9a520',
  hardhatLight: '#ffe082',
  hardhatBrim: '#e6b532',
  hardhatBrimShade: '#c99a1e',
  fedora: '#6b5a4a',
  fedoraShade: '#54463a',
  fedoraLight: '#857262',
  fedoraBand: '#2f2a26',
  fedoraBrim: '#5e4f41',
  fedoraBrimShade: '#4a3e33',
  cowboy: '#c48b52',
  cowboyShade: '#a5703f',
  cowboyLight: '#dca56e',
  cowboyBrim: '#b9824a',
  cowboyBrimShade: '#9a6a3a',
  cowboyBand: '#5b3a24',
  safari: '#e3d3a8',
  safariShade: '#c4b282',
  safariLight: '#f2e8cc',
  safariBand: '#8a7550',
  safariBrim: '#d8c695',
  safariBrimShade: '#b8a675',
  tophat: '#2d2a32',
  tophatShade: '#1e1c22',
  tophatLight: '#4a4652',
  tophatBand: '#a8323a',
})

/** A flower of the flower crown: five petals round a centre pixel. */
function flower(x: number, y: number, petal: Rgb): Shape {
  return { t: 'e', x, y, rx: 1.7, ry: 1.6, c: petal, g: 'crown' }
}

/** The first twelve hats, in {@link HAT_SHORT_H}-row coordinates. */
const SHORT_SPECS = {
  bow: {
    shapes: [
      {
        t: 'p',
        pts: [
          [C - 0.5, 9.2],
          [C - 6.5, 5.6],
          [C - 6.5, 12],
        ],
        c: P.bow,
        s: P.bowShade,
        h: P.bowLight,
        g: 'bow',
      },
      {
        t: 'p',
        pts: [
          [C + 0.5, 9.2],
          [C + 6.5, 5.6],
          [C + 6.5, 12],
        ],
        c: P.bow,
        s: P.bowShade,
        h: P.bowLight,
        g: 'bow',
      },
      { t: 'e', x: C, y: 9, rx: 1.9, ry: 1.9, c: P.bowKnot, g: 'bow' },
    ],
  },
  cap: {
    shapes: [
      {
        t: 'p',
        pts: dome(C, 12, 6.5, 7),
        c: P.cap,
        s: P.capShade,
        h: P.capLight,
      },
      { t: 'e', x: C, y: 11.7, rx: 7.8, ry: 1.3, c: P.capBill, edge: true },
    ],
    feats: [
      [C - 1, 5, P.capShade],
      [C, 5, P.capShade],
    ],
  },
  beanie: {
    shapes: [
      {
        t: 'p',
        pts: dome(C, 12, 6.6, 7.4),
        c: P.beanie,
        s: P.beanieShade,
        h: P.beanieLight,
      },
      { t: 'p', pts: rect(C - 6.8, 9, C + 6.8, 12), c: P.beanieCuff },
      { t: 'e', x: C, y: 3.6, rx: 2.2, ry: 2, c: P.pom, s: P.pomShade },
    ],
    feats: [-5, -3, -1, 1, 3, 5].flatMap((dx) =>
      [9, 10, 11].map((y) => [C + dx, y, P.beanieRib] as const)
    ),
  },
  flowers: {
    shapes: [
      {
        t: 'e',
        x: C,
        y: 11.4,
        rx: 7.6,
        ry: 1.2,
        c: P.vine,
        s: P.vineShade,
        g: 'crown',
      },
      flower(C - 5.6, 10, P.petalPink),
      flower(C + 5.6, 10, P.petalYellow),
      flower(C - 2.8, 9.2, P.petalWhite),
      flower(C + 2.8, 9.2, P.petalWhite),
      flower(C, 8.8, P.petalPink),
    ],
    feats: [
      [C - 6, 10, P.heartPink],
      [C + 5, 10, P.heartYellow],
      [C - 3, 9, P.heartYellow],
      [C + 2, 9, P.heartYellow],
      [C - 1, 9, P.heartPink],
    ],
  },
  bucket: {
    shapes: [
      {
        t: 'p',
        pts: [
          [C - 4, 5],
          [C + 4, 5],
          [C + 5.4, 10.4],
          [C - 5.4, 10.4],
        ],
        c: P.bucket,
        s: P.bucketShade,
        h: P.bucketLight,
      },
      {
        t: 'p',
        pts: [
          [C - 7.6, 10],
          [C + 7.6, 10],
          [C + 9, 12],
          [C - 9, 12],
        ],
        c: P.bucketBrim,
        s: P.bucketBrimShade,
        edge: true,
      },
    ],
  },
  beret: {
    shapes: [
      { t: 'e', x: C + 0.5, y: 5.6, rx: 0.9, ry: 1.1, c: P.beretShade },
      {
        t: 'e',
        x: C + 0.5,
        y: 9.2,
        rx: 8,
        ry: 3,
        a: -6,
        c: P.beret,
        s: P.beretShade,
        h: P.beretLight,
      },
    ],
  },
  sunhat: {
    shapes: [
      {
        t: 'p',
        pts: dome(C, 10.4, 5, 5.6),
        c: P.straw,
        s: P.strawShade,
        h: P.strawLight,
      },
      { t: 'p', pts: rect(C - 5, 8.4, C + 5, 10.4), c: P.ribbon },
      {
        t: 'e',
        x: C,
        y: 10.9,
        rx: 10.6,
        ry: 1.6,
        c: P.strawBrim,
        s: P.strawBrimShade,
        h: P.strawLight,
        edge: true,
      },
    ],
    feats: [
      [C + 3, 8, P.petalPink],
      [C + 4, 8, P.petalWhite],
      [C + 3, 9, P.petalWhite],
    ],
  },
  hardhat: {
    shapes: [
      {
        t: 'p',
        pts: dome(C, 11, 6.4, 6.4),
        c: P.hardhat,
        s: P.hardhatShade,
        h: P.hardhatLight,
      },
      { t: 'p', pts: rect(C - 1, 4.8, C + 1, 10.4), c: P.hardhatLight },
      {
        t: 'p',
        pts: rect(C - 8.6, 10, C + 8.6, 12),
        c: P.hardhatBrim,
        s: P.hardhatBrimShade,
        edge: true,
      },
    ],
  },
  fedora: {
    shapes: [
      {
        t: 'p',
        pts: [
          [C - 5, 10.4],
          [C - 4.6, 5],
          [C - 2, 3.8],
          [C, 4.9],
          [C + 2, 3.8],
          [C + 4.6, 5],
          [C + 5, 10.4],
        ],
        c: P.fedora,
        s: P.fedoraShade,
        h: P.fedoraLight,
      },
      { t: 'p', pts: rect(C - 5, 8, C + 5, 10.2), c: P.fedoraBand },
      {
        t: 'e',
        x: C,
        y: 10.9,
        rx: 9.2,
        ry: 1.5,
        c: P.fedoraBrim,
        s: P.fedoraBrimShade,
        edge: true,
      },
    ],
  },
  cowboy: {
    shapes: [
      {
        t: 'p',
        pts: [
          [C - 5, 10.4],
          [C - 4.6, 4.6],
          [C - 2, 3.4],
          [C, 4.6],
          [C + 2, 3.4],
          [C + 4.6, 4.6],
          [C + 5, 10.4],
        ],
        c: P.cowboy,
        s: P.cowboyShade,
        h: P.cowboyLight,
      },
      { t: 'p', pts: rect(C - 5, 8.4, C + 5, 10), c: P.cowboyBand },
      {
        t: 'p',
        pts: [
          [C - 11, 7.4],
          [C - 8, 10],
          [C + 8, 10],
          [C + 11, 7.4],
          [C + 10.4, 11],
          [C + 7.4, 12],
          [C - 7.4, 12],
          [C - 10.4, 11],
        ],
        c: P.cowboyBrim,
        s: P.cowboyBrimShade,
        h: P.cowboyLight,
        edge: true,
      },
    ],
  },
  safari: {
    shapes: [
      {
        t: 'p',
        pts: dome(C, 10.6, 6.4, 6.6),
        c: P.safari,
        s: P.safariShade,
        h: P.safariLight,
      },
      { t: 'p', pts: rect(C - 6.3, 8.6, C + 6.3, 10.4), c: P.safariBand },
      {
        t: 'e',
        x: C,
        y: 10.9,
        rx: 9.2,
        ry: 1.6,
        c: P.safariBrim,
        s: P.safariBrimShade,
        edge: true,
      },
    ],
    feats: [
      [C - 1, 3, P.safariShade],
      [C, 3, P.safariShade],
    ],
  },
  tophat: {
    shapes: [
      {
        t: 'p',
        pts: rect(C - 4.5, 1, C + 4.5, 10.4),
        c: P.tophat,
        s: P.tophatShade,
        h: P.tophatLight,
      },
      { t: 'p', pts: rect(C - 4.5, 7.6, C + 4.5, 9.6), c: P.tophatBand },
      {
        t: 'e',
        x: C,
        y: 10.9,
        rx: 8,
        ry: 1.5,
        c: P.tophat,
        s: P.tophatShade,
        edge: true,
      },
    ],
  },
} satisfies Readonly<Record<string, ShapeSpec>>

type ShortHatId = keyof typeof SHORT_SPECS

/**
 * Every hat but `none`. Secret hats are drawn in the full {@link HAT_W} ×
 * {@link HAT_H} canvas with the brim on {@link HAT_BRIM_ROW}.
 */
const TALL_SPECS: Readonly<
  Record<Exclude<HatId, 'none' | ShortHatId>, ShapeSpec>
> = { ...WORLD_HAT_SPECS, ...WHIMSY_HAT_SPECS }

const isShortHat = (hat: string): hat is ShortHatId =>
  Object.hasOwn(SHORT_SPECS, hat)

/** Rasterizes a hat into the full canvas. */
function drawHat(hat: Exclude<HatId, 'none'>): PixelBuffer {
  if (!isShortHat(hat))
    return rasterize(TALL_SPECS[hat as keyof typeof TALL_SPECS], HAT_W, HAT_H)
  const out = createBuffer(HAT_W, HAT_H)
  blit(out, rasterize(SHORT_SPECS[hat], HAT_W, HAT_SHORT_H), 0, HAT_LIFT)
  return out
}

const cache = createLru<PixelBuffer>(64)

/**
 * The hat's {@link HAT_W} × {@link HAT_H} picture, mirrored and greyed as asked;
 * memoized, so callers must not change it. Null for `none` or an id this build
 * doesn't know.
 */
export function hatSprite(
  hat: string,
  opts: { readonly flip?: boolean; readonly grey?: GreyMode } = {}
): PixelBuffer | null {
  if (!isShortHat(hat) && !Object.hasOwn(TALL_SPECS, hat)) return null
  const grey = opts.grey ?? 'none'
  return cache.getOrCreate(`${hat}|${opts.flip ? 1 : 0}|${grey}`, () => {
    let px = drawHat(hat as Exclude<HatId, 'none'>)
    if (opts.flip) px = flipH(px)
    return greyed(px, grey)
  })
}

/**
 * Where the hat canvas' top-left goes for a pet sprite at `origin` with its
 * head bobbed down `bob` pixels.
 */
export function hatOrigin(
  species: PetSpeciesId,
  origin: readonly [number, number],
  bob: number
): [number, number] {
  return [
    origin[0] + SPRITE_SIZE / 2 - HAT_CX,
    origin[1] + HAT_ANCHOR_Y[species] + bob - HAT_BRIM_ROW,
  ]
}
