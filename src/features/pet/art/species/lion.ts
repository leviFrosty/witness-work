import { rgbPalette, type Rgb, type Shape } from '@/lib/pixelArt'

import { facePixels } from '../face'
import { defineSpecies } from './define'

interface LionCoat {
  readonly m: Rgb
  readonly ms: Rgb
  readonly mh: Rgb

  readonly f: Rgb
  readonly fs: Rgb
  readonly fh: Rgb

  readonly l: Rgb

  readonly in: Rgb

  readonly n: Rgb
}

export const lion = defineSpecies<'lion', LionCoat>({
  id: 'lion',
  coats: {
    default: {
      ...rgbPalette({
        m: '#c9652a',
        ms: '#9a4521',
        mh: '#e0843d',
        f: '#f5bd5c',
        fs: '#d9953a',
        fh: '#ffdb8f',
        l: '#fff1d2',
        in: '#f39a8b',
        n: '#5b2d22',
      }),
      swatch: ['#f5bd5c'],
    },
  },
  build(st, C) {
    const b = st.bob
    const t = st.tail
    const mane: Shape[] = []
    for (let a = 0; a < 360; a += 30) {
      const r = (a * Math.PI) / 180
      mane.push({
        t: 'e',
        x: 16 + Math.cos(r) * 9.6,
        y: 12.5 + b + Math.sin(r) * 8.4,
        rx: 2.8,
        ry: 2.8,
        c: C.m,
        s: C.ms,
        g: 'mane',
        edge: true,
      })
    }
    return {
      shapes: [
        {
          t: 'e',
          x: 25 + t,
          y: 24,
          rx: 1.2,
          ry: 4,
          a: 25 + t * 12,
          c: C.f,
          s: C.fs,
        },
        { t: 'e', x: 26.8 + t * 1.6, y: 19.8, rx: 2, ry: 2, c: C.m, s: C.ms },
        { t: 'e', x: 16, y: 24.5, rx: 8, ry: 5.5, c: C.f, s: C.fs, h: C.fh },
        { t: 'e', x: 16, y: 26, rx: 4, ry: 3, c: C.l },
        {
          t: 'e',
          x: 11.5,
          y: 28.6,
          rx: 2.6,
          ry: 1.7,
          c: C.f,
          s: C.fs,
          edge: true,
        },
        {
          t: 'e',
          x: 20.5,
          y: 28.6,
          rx: 2.6,
          ry: 1.7,
          c: C.f,
          s: C.fs,
          edge: true,
        },
        ...mane,
        {
          t: 'e',
          x: 16,
          y: 12.5 + b,
          rx: 10,
          ry: 9,
          c: C.m,
          s: C.ms,
          h: C.mh,
          g: 'mane',
          edge: true,
        },
        {
          t: 'e',
          x: 9.6,
          y: 5.8 + b,
          rx: 2.6,
          ry: 2.6,
          c: C.f,
          s: C.fs,
          edge: true,
        },
        {
          t: 'e',
          x: 22.4,
          y: 5.8 + b,
          rx: 2.6,
          ry: 2.6,
          c: C.f,
          s: C.fs,
          edge: true,
        },
        { t: 'e', x: 9.6, y: 6 + b, rx: 1.2, ry: 1.2, c: C.in },
        { t: 'e', x: 22.4, y: 6 + b, rx: 1.2, ry: 1.2, c: C.in },
        {
          t: 'e',
          x: 16,
          y: 13.5 + b,
          rx: 7.6,
          ry: 6.6,
          c: C.f,
          s: C.fs,
          h: C.fh,
          edge: true,
        },
        { t: 'e', x: 16, y: 17 + b, rx: 3.6, ry: 2.4, c: C.l, edge: true },
      ],
      feats: [
        ...facePixels(st, {
          lx: 11,
          rx: 19,
          ey: 11 + b,
          blush: true,
          mx: 14,
          my: 17 + b,
        }),
        [15, 15 + b, C.n],
        [16, 15 + b, C.n],
      ],
    }
  },
})
