import { rgb, rgbPalette, type Rgb } from '@/lib/pixelArt'

import { facePixels } from '../face'
import { defineSpecies } from './define'

interface DonkeyCoat {
  readonly g: Rgb
  readonly gs: Rgb
  readonly gh: Rgb

  readonly l: Rgb
  readonly ls: Rgb

  readonly m: Rgb

  readonly in: Rgb
}

const NOSTRIL = rgb('#7a6f63')

export const donkey = defineSpecies<'donkey', DonkeyCoat>({
  id: 'donkey',
  coats: {
    default: {
      ...rgbPalette({
        g: '#a3a8b2',
        gs: '#7d828e',
        gh: '#c6cad2',
        l: '#ece6da',
        ls: '#d5cdbd',
        m: '#4d505a',
        in: '#e7a6a6',
      }),
      swatch: ['#a3a8b2'],
    },
  },
  build(st, C) {
    const b = st.bob
    const t = st.tail
    return {
      shapes: [
        {
          t: 'e',
          x: 25 + t,
          y: 23,
          rx: 1,
          ry: 3.8,
          a: 25 + t * 10,
          c: C.g,
          s: C.gs,
        },
        { t: 'e', x: 26.6 + t * 1.6, y: 26.4, rx: 1.6, ry: 1.9, c: C.m },
        { t: 'e', x: 16, y: 24.5, rx: 8, ry: 5.5, c: C.g, s: C.gs, h: C.gh },
        { t: 'e', x: 16, y: 26, rx: 4, ry: 3, c: C.l },
        { t: 'e', x: 11.5, y: 28.7, rx: 2.4, ry: 1.5, c: C.m, edge: true },
        { t: 'e', x: 20.5, y: 28.7, rx: 2.4, ry: 1.5, c: C.m, edge: true },
        {
          t: 'e',
          x: 11,
          y: 6.2 + b,
          rx: 2.2,
          ry: 5.8,
          a: -14,
          c: C.g,
          s: C.gs,
          h: C.gh,
        },
        {
          t: 'e',
          x: 21,
          y: 6.2 + b,
          rx: 2.2,
          ry: 5.8,
          a: 14,
          c: C.g,
          s: C.gs,
          h: C.gh,
        },
        { t: 'e', x: 11.2, y: 6.6 + b, rx: 0.9, ry: 3.8, a: -14, c: C.in },
        { t: 'e', x: 20.8, y: 6.6 + b, rx: 0.9, ry: 3.8, a: 14, c: C.in },
        {
          t: 'e',
          x: 16,
          y: 13.5 + b,
          rx: 7.2,
          ry: 6.6,
          c: C.g,
          s: C.gs,
          h: C.gh,
          edge: true,
        },
        { t: 'e', x: 14.6, y: 7.6 + b, rx: 1.9, ry: 1.8, c: C.m, g: 'mn' },
        { t: 'e', x: 17, y: 7 + b, rx: 1.9, ry: 1.9, c: C.m, g: 'mn' },
        {
          t: 'e',
          x: 16,
          y: 18.4 + b,
          rx: 5.4,
          ry: 3.4,
          c: C.l,
          s: C.ls,
          edge: true,
        },
      ],
      feats: [
        ...facePixels(st, {
          lx: 11,
          rx: 19,
          ey: 11 + b,
          blush: true,
          mx: 14,
          my: 19 + b,
        }),
        [13, 17 + b, NOSTRIL],
        [18, 17 + b, NOSTRIL],
      ],
    }
  },
})
