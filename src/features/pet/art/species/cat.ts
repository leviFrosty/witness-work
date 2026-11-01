import {
  dim,
  rgb,
  rgbPalette,
  type FeaturePixel,
  type Paint,
  type Rgb,
  type Shape,
} from '@/lib/pixelArt'

import { facePixels } from '../face'
import { defineSpecies } from './define'

interface CatCoat {
  readonly f: Rgb
  readonly fs: Rgb
  readonly fh: Rgb

  readonly l: Rgb

  readonly in: Rgb

  readonly n: Rgb

  readonly wh: Rgb

  readonly st?: Rgb

  readonly tl?: Rgb
  readonly tt?: Rgb

  readonly pt?: Rgb
  readonly iris?: Rgb
  readonly ec?: Rgb
  readonly mc?: Rgb

  readonly paints?: (bob: number) => Paint[]
}

const BIB = rgb('#f6f4f0')
const BIB_SHADE = rgb('#dcd6ce')
const PATCH_ORANGE = rgb('#ef9a4a')
const PATCH_ORANGE_SHADE = rgb('#cf7a30')
const PATCH_ORANGE_LIGHT = rgb('#ffbe7a')
const PATCH_BLACK = rgb('#3a353d')
const PATCH_BLACK_SHADE = rgb('#27232a')
const MASK = rgb('#73553f')
const MASK_SHADE = rgb('#5d4335')
const TORTIE_RUST = rgb('#8a4f2e')
const TORTIE_RUST_SHADE = rgb('#6c3b22')
const TORTIE_RUST_LIGHT = rgb('#a8673e')
const TORTIE_GINGER = rgb('#c7864a')
const TORTIE_GINGER_SHADE = rgb('#a56a36')

export const cat = defineSpecies<'cat', CatCoat>({
  id: 'cat',
  coats: {
    orange: {
      ...rgbPalette({
        f: '#f2a55c',
        fs: '#d27f3a',
        fh: '#ffc685',
        st: '#c0662b',
        l: '#fff3e3',
        in: '#f7aaa1',
        n: '#e9767f',
        wh: '#7a4a2c',
      }),
      swatch: ['#f2a55c'],
    },
    grey: {
      ...rgbPalette({
        f: '#a7acb4',
        fs: '#81868f',
        fh: '#c7cbd2',
        st: '#62666f',
        l: '#eef0f2',
        in: '#f0a6a6',
        n: '#d68892',
        wh: '#4f535c',
      }),
      swatch: ['#a7acb4'],
    },
    black: {
      ...rgbPalette({
        f: '#36323a',
        fs: '#242128',
        fh: '#4d4852',
        l: '#433e48',
        in: '#b67b86',
        n: '#5b4850',
        wh: '#bdb5c4',
        iris: '#cddc4c',
        ec: '#cfc6d6',
        mc: '#a69dae',
      }),
      swatch: ['#36323a'],
    },
    white: {
      ...rgbPalette({
        f: '#f7f5f1',
        fs: '#d9d3ca',
        fh: '#ffffff',
        l: '#ffffff',
        in: '#f6b1ad',
        n: '#ef8b97',
        wh: '#b5ada4',
        iris: '#6fb0ea',
      }),
      swatch: ['#f7f5f1'],
    },
    tuxedo: {
      ...rgbPalette({
        f: '#36323a',
        fs: '#242128',
        fh: '#4d4852',
        l: '#f6f4f0',
        in: '#b67b86',
        n: '#e58b98',
        wh: '#bdb5c4',
        iris: '#cddc4c',
        ec: '#cfc6d6',
      }),
      paints: (b) => [
        {
          t: 'p',
          pts: [
            [16, 9.5 + b],
            [10.5, 21 + b],
            [21.5, 21 + b],
          ],
          c: BIB,
          s: BIB_SHADE,
          on: ['head'],
        },
      ],
      swatch: ['#36323a', '#f6f4f0'],
    },
    calico: {
      ...rgbPalette({
        f: '#f7f3eb',
        fs: '#dcd3c4',
        fh: '#ffffff',
        l: '#ffffff',
        in: '#f6b1ad',
        n: '#ef8b97',
        wh: '#a59b90',
        tl: '#ef9a4a',
        tt: '#36323a',
        iris: '#e0a43a',
      }),
      paints: (b) => [
        {
          t: 'e',
          x: 10,
          y: 8.6 + b,
          rx: 4.6,
          ry: 4.2,
          c: PATCH_ORANGE,
          s: PATCH_ORANGE_SHADE,
          h: PATCH_ORANGE_LIGHT,
          on: ['head', 'ear'],
        },
        {
          t: 'e',
          x: 22.4,
          y: 7 + b,
          rx: 4.2,
          ry: 3.6,
          c: PATCH_BLACK,
          s: PATCH_BLACK_SHADE,
          on: ['head', 'ear'],
        },
        {
          t: 'e',
          x: 21.5,
          y: 23,
          rx: 4,
          ry: 3,
          c: PATCH_ORANGE,
          s: PATCH_ORANGE_SHADE,
          on: ['body'],
        },
        {
          t: 'e',
          x: 10.5,
          y: 25.5,
          rx: 3,
          ry: 2.6,
          c: PATCH_BLACK,
          s: PATCH_BLACK_SHADE,
          on: ['body'],
        },
      ],
      swatch: ['#f7f3eb', '#ef9a4a', '#3a353d'],
    },
    siamese: {
      ...rgbPalette({
        f: '#efe3cf',
        fs: '#d4c3a6',
        fh: '#fbf4e8',
        l: '#f6eedf',
        in: '#7a5a4a',
        n: '#4a3028',
        wh: '#8a7262',
        pt: '#5d4335',
        tl: '#e2d2b6',
        tt: '#5d4335',
        iris: '#6fb4ea',
      }),
      paints: (b) => [
        {
          t: 'e',
          x: 16,
          y: 16 + b,
          rx: 4.8,
          ry: 4,
          c: MASK,
          s: MASK_SHADE,
          on: ['head', 'muzzle'],
        },
      ],
      swatch: ['#efe3cf', '#5d4335'],
    },
    tortoiseshell: {
      ...rgbPalette({
        f: '#3a2f2c',
        fs: '#28201f',
        fh: '#52423b',
        l: '#5a4134',
        in: '#b07a74',
        n: '#4e3a36',
        wh: '#c9b8a8',
        tl: '#3a2f2c',
        tt: '#8a4f2e',
        iris: '#c9b04a',
        ec: '#cfc6d6',
        mc: '#a69dae',
      }),
      paints: (b) => [
        {
          t: 'p',
          pts: [
            [15.5, 6 + b],
            [16.5, 6 + b],
            [16.6, 12.5 + b],
            [15.4, 12.5 + b],
          ],
          c: TORTIE_RUST_LIGHT,
          s: TORTIE_RUST,
          on: ['head'],
        },
        {
          t: 'e',
          x: 9.6,
          y: 10 + b,
          rx: 2.6,
          ry: 2.2,
          c: TORTIE_RUST,
          s: TORTIE_RUST_SHADE,
          on: ['head', 'ear'],
        },
        {
          t: 'e',
          x: 22.8,
          y: 17 + b,
          rx: 2.2,
          ry: 1.8,
          c: TORTIE_GINGER,
          s: TORTIE_GINGER_SHADE,
          on: ['head'],
        },
        {
          t: 'e',
          x: 12.5,
          y: 22.5,
          rx: 4,
          ry: 2.6,
          c: TORTIE_RUST,
          s: TORTIE_RUST_SHADE,
          h: TORTIE_RUST_LIGHT,
          on: ['body'],
        },
        {
          t: 'e',
          x: 21,
          y: 26,
          rx: 2.4,
          ry: 2,
          c: TORTIE_GINGER,
          s: TORTIE_GINGER_SHADE,
          on: ['body'],
        },
      ],
      swatch: ['#3a2f2c', '#8a4f2e', '#c7864a'],
    },
  },
  build(st, C) {
    const b = st.bob
    const t = st.tail
    const tl = C.tl ?? C.f
    const tt = C.tt ?? C.st ?? C.f
    const ear = C.pt ?? C.f
    const paw = C.pt ?? C.l
    const tailPoints: readonly (readonly [number, number])[] = [
      [24, 26.5],
      [26, 25],
      [27, 22.5],
      [27.4, 20],
      [26.8 + t * 0.8, 17.6],
    ]
    const tail: Shape[] = tailPoints.map(([x, y], i) => ({
      t: 'e',
      x,
      y,
      rx: 1.7,
      ry: 1.7,
      c: i >= 3 ? tt : C.pt !== undefined && i >= 2 ? C.pt : tl,
      s: dim(i >= 3 ? tt : tl, 0.85),
      g: 'tail',
      k: 'tail',
    }))
    const feats: FeaturePixel[] = [
      ...facePixels(st, {
        lx: 11,
        rx: 19,
        ey: 11 + b,
        blush: true,
        mx: 14,
        my: 17 + b,
        ec: C.ec,
        mc: C.mc,
        iris: C.iris,
      }),
      [15, 15 + b, C.n],
      [16, 15 + b, C.n],
      [5, 15 + b, C.wh],
      [6, 15 + b, C.wh],
      [25, 15 + b, C.wh],
      [26, 15 + b, C.wh],
      [6, 17 + b, C.wh],
      [25, 17 + b, C.wh],
    ]
    const stripe = C.st
    if (stripe !== undefined) {
      const stripes: readonly (readonly [number, number])[] = [
        [15, 7 + b],
        [16, 7 + b],
        [12, 8 + b],
        [19, 8 + b],
        [15, 8 + b],
        [16, 8 + b],
        [8, 14 + b],
        [23, 14 + b],
        [11, 22],
        [21, 22],
        [10, 24],
        [22, 24],
      ]
      for (const [x, y] of stripes) feats.push([x, y, stripe])
    }
    return {
      paints: C.paints ? C.paints(b) : [],
      shapes: [
        ...tail,
        {
          t: 'e',
          x: 16,
          y: 24.5,
          rx: 7.5,
          ry: 5.5,
          c: C.f,
          s: C.fs,
          h: C.fh,
          k: 'body',
        },
        { t: 'e', x: 16, y: 26, rx: 3.6, ry: 3, c: C.l, k: 'chest' },
        {
          t: 'e',
          x: 12,
          y: 28.6,
          rx: 2.4,
          ry: 1.7,
          c: paw,
          edge: true,
          k: 'paw',
        },
        {
          t: 'e',
          x: 20,
          y: 28.6,
          rx: 2.4,
          ry: 1.7,
          c: paw,
          edge: true,
          k: 'paw',
        },
        {
          t: 'p',
          pts: [
            [7.2, 11 + b],
            [8.6, 1.6 + b],
            [14.8, 6.4 + b],
          ],
          c: ear,
          s: dim(ear, 0.85),
          k: 'ear',
        },
        {
          t: 'p',
          pts: [
            [17.2, 6.4 + b],
            [23.4, 1.6 + b],
            [24.8, 11 + b],
          ],
          c: ear,
          s: dim(ear, 0.85),
          k: 'ear',
        },
        {
          t: 'p',
          pts: [
            [9.2, 8 + b],
            [9.7, 4 + b],
            [12.8, 6.6 + b],
          ],
          c: C.in,
        },
        {
          t: 'p',
          pts: [
            [19.2, 6.6 + b],
            [22.3, 4 + b],
            [22.8, 8 + b],
          ],
          c: C.in,
        },
        {
          t: 'e',
          x: 16,
          y: 13 + b,
          rx: 8.8,
          ry: 7,
          c: C.f,
          s: C.fs,
          h: C.fh,
          edge: true,
          k: 'head',
        },
        { t: 'e', x: 14.2, y: 16.9 + b, rx: 2.4, ry: 1.9, c: C.l, k: 'muzzle' },
        { t: 'e', x: 17.8, y: 16.9 + b, rx: 2.4, ry: 1.9, c: C.l, k: 'muzzle' },
      ],
      feats,
    }
  },
})
