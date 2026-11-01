import { rgb, rgbPalette, type Rgb, type Shape } from '@/lib/pixelArt'

import { facePixels } from '../face'
import { defineSpecies } from './define'

interface LambCoat {
  readonly w: Rgb
  readonly ws: Rgb
  readonly wh: Rgb

  readonly f: Rgb
  readonly fs: Rgb

  readonly h: Rgb
}

const NOSE = rgb('#c98f86')

export const lamb = defineSpecies<'lamb', LambCoat>({
  id: 'lamb',
  coats: {
    default: {
      ...rgbPalette({
        w: '#fbf8ef',
        ws: '#e3dccb',
        wh: '#ffffff',
        f: '#f2d6bd',
        fs: '#d9b597',
        h: '#5a4a43',
      }),
      swatch: ['#fbf8ef'],
    },
  },
  build(st, C) {
    const b = st.bob
    const t = st.tail
    const wool: Shape[] = []
    for (let a = 0; a < 360; a += 40) {
      const r = (a * Math.PI) / 180
      wool.push({
        t: 'e',
        x: 16 + Math.cos(r) * 6.6,
        y: 23.6 + Math.sin(r) * 3.6,
        rx: 3,
        ry: 3,
        c: C.w,
        s: C.ws,
        g: 'wool',
      })
    }
    return {
      shapes: [
        { t: 'e', x: 12, y: 28.6, rx: 1.4, ry: 1.9, c: C.h },
        { t: 'e', x: 20, y: 28.6, rx: 1.4, ry: 1.9, c: C.h },
        {
          t: 'e',
          x: 25.4 + t * 0.5,
          y: 20.5,
          rx: 2.2,
          ry: 2.2,
          c: C.w,
          s: C.ws,
        },
        ...wool,
        {
          t: 'e',
          x: 16,
          y: 23.6,
          rx: 8,
          ry: 5,
          c: C.w,
          s: C.ws,
          h: C.wh,
          g: 'wool',
        },
        {
          t: 'e',
          x: 8,
          y: 13.4 + b,
          rx: 3.2,
          ry: 1.6,
          a: -22,
          c: C.f,
          s: C.fs,
        },
        {
          t: 'e',
          x: 24,
          y: 13.4 + b,
          rx: 3.2,
          ry: 1.6,
          a: 22,
          c: C.f,
          s: C.fs,
        },
        {
          t: 'e',
          x: 16,
          y: 14 + b,
          rx: 6.4,
          ry: 6,
          c: C.f,
          s: C.fs,
          edge: true,
        },
        {
          t: 'e',
          x: 13,
          y: 8.4 + b,
          rx: 2.4,
          ry: 2.4,
          c: C.w,
          s: C.ws,
          g: 'tuft',
          edge: true,
        },
        {
          t: 'e',
          x: 16,
          y: 7.4 + b,
          rx: 2.7,
          ry: 2.6,
          c: C.w,
          s: C.ws,
          g: 'tuft',
          edge: true,
        },
        {
          t: 'e',
          x: 19,
          y: 8.4 + b,
          rx: 2.4,
          ry: 2.4,
          c: C.w,
          s: C.ws,
          g: 'tuft',
          edge: true,
        },
      ],
      feats: [
        ...facePixels(st, {
          lx: 12,
          rx: 18,
          ey: 12 + b,
          blush: true,
          mx: 14,
          my: 18 + b,
        }),
        [15, 16 + b, NOSE],
        [16, 16 + b, NOSE],
      ],
    }
  },
})
