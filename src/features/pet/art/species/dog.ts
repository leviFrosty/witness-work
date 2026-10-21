/** Pup: floppy ears, wagging tail, four coats. */
import { dim, mix, rgb, rgbPalette, type Rgb, type Shape } from '@/lib/pixelArt'

import { facePixels } from '../face'
import { defineSpecies, sidePoints, type Points } from './define'

interface DogCoat {
  /** Fur, shadow, highlight. */
  readonly f: Rgb
  readonly fs: Rgb
  readonly fh: Rgb
  /** Ears and their shadow. */
  readonly e: Rgb
  readonly es: Rgb
  /** Light fur (muzzle, chest, tail tip). */
  readonly l: Rgb
  /** Nose. */
  readonly n: Rgb
  /** Eyelid and closed-eye colour, for dark coats. */
  readonly ec?: Rgb
  /** Mouth colour, for dark coats. */
  readonly mc?: Rgb
}

const WHITE = rgb('#ffffff')

/** The left front leg, rounded at the paw (the right one is mirrored). */
const LEG: Points = [
  [12.8, 23],
  [15.6, 23],
  [15.6, 29.6],
  [15, 30.8],
  [12.4, 30.8],
  [11.8, 29.6],
]

/**
 * The left ear (the right one is mirrored): narrow where it hangs from the side
 * of the head, rounded at the bottom.
 */
const EAR: Points = [
  [9.4, 7.6],
  [6.8, 8.6],
  [5, 11.4],
  [4.8, 14.6],
  [5.2, 17],
  [6.8, 18],
  [8.6, 17],
  [9.4, 13.8],
  [10.2, 10],
]

export const dog = defineSpecies<'dog', DogCoat>({
  id: 'dog',
  coats: {
    gold: {
      ...rgbPalette({
        f: '#e0a548',
        fs: '#b8792c',
        fh: '#f5c978',
        e: '#c98b38',
        es: '#a46a24',
        l: '#f6d79e',
        n: '#3a2620',
      }),
      swatch: ['#e0a548'],
    },
    white: {
      ...rgbPalette({
        f: '#f1e5cb',
        fs: '#d2bf99',
        fh: '#fffaf0',
        e: '#e2cda3',
        es: '#c0a97f',
        l: '#fffaf2',
        n: '#3a2620',
      }),
      swatch: ['#f1e5cb'],
    },
    liver: {
      ...rgbPalette({
        f: '#8c4b2b',
        fs: '#693520',
        fh: '#a8643c',
        e: '#7a3e22',
        es: '#5a2c18',
        l: '#b07148',
        n: '#3d1d12',
        ec: '#2a1410',
      }),
      swatch: ['#8c4b2b'],
    },
    black: {
      ...rgbPalette({
        f: '#3a3434',
        fs: '#242020',
        fh: '#554d4c',
        e: '#2d2828',
        es: '#1c1919',
        l: '#5e5655',
        n: '#0e0b0b',
        ec: '#e2d6be',
        mc: '#c4b8b5',
      }),
      swatch: ['#3a3434'],
    },
  },
  build(st, C) {
    const b = st.bob
    const t = st.tail
    const chest = dim(C.l, 0.93)
    // A sitting golden puppy: broad head with a short muzzle, soft ears hung
    // from the sides of the head, a fluffy chest between straight front legs,
    // haunches folded at the sides and a plumed tail.
    const ear = (side: -1 | 1): Shape => ({
      t: 'p',
      pts: sidePoints(EAR, side, b),
      c: C.e,
      s: C.es,
      g: 'ears',
      edge: true,
    })
    const leg = (side: -1 | 1): Shape => ({
      t: 'p',
      pts: sidePoints(LEG, side),
      c: C.f,
      s: C.fs,
      h: C.fh,
      g: `leg${side}`,
      edge: true,
    })
    const haunch = (x: number): Shape => ({
      t: 'e',
      x,
      y: 27,
      rx: 3.3,
      ry: 3,
      c: C.f,
      s: C.fs,
      h: C.fh,
    })
    return {
      shapes: [
        {
          t: 'e',
          x: t ? 25.8 : 25.2,
          y: t ? 22 : 22.4,
          rx: 1.7,
          ry: 4,
          a: t ? 48 : 28,
          c: C.f,
          s: C.fs,
          h: C.fh,
        },
        haunch(10.2),
        haunch(21.8),
        { t: 'e', x: 16, y: 23.4, rx: 5.6, ry: 6, c: C.f, s: C.fs, h: C.fh },
        leg(-1),
        leg(1),
        { t: 'e', x: 16, y: 22.2, rx: 3.4, ry: 3.4, c: C.l },
        {
          t: 'e',
          x: 16,
          y: 12.4 + b,
          rx: 8.6,
          ry: 6.8,
          c: C.f,
          s: C.fs,
          h: C.fh,
          edge: true,
        },
        { t: 'e', x: 16, y: 16 + b, rx: 4.2, ry: 2.5, c: C.l },
        ear(-1),
        ear(1),
      ],
      feats: [
        ...facePixels(st, {
          lx: 11,
          rx: 19,
          ey: 10 + b,
          blush: true,
          mx: 14,
          my: 17 + b,
          ec: C.ec,
          mc: C.mc,
        }),
        [14, 14 + b, C.n],
        [15, 14 + b, mix(C.n, WHITE, 0.4)],
        [16, 14 + b, C.n],
        [17, 14 + b, C.n],
        [15, 15 + b, C.n],
        [16, 15 + b, C.n],
        [13, 30, C.fs],
        [18, 30, C.fs],
        [14, 22, chest],
        [17, 21, chest],
        [15, 24, chest],
      ],
    }
  },
})
