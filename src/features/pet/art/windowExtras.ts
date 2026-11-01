import {
  rgbPalette,
  setPixel,
  type PixelBuffer,
  type Rgb,
} from '@/lib/pixelArt'

import { isWindowPane } from './room/window'

const WALKERS: Readonly<
  Record<'lion' | 'lamb', readonly (readonly string[])[]>
> = {
  lion: [
    ['.mm....', 'mffbbbt', '.mbbbb.', '.l.l.l.'],
    ['.mm....', 'mffbbbt', '.mbbbb.', 'l.l.l..'],
  ],
  lamb: [
    ['.....', 'fwwww', 'fwwww', '.l..l'],
    ['.....', 'fwwww', 'fwwww', 'l..l.'],
  ],
}

const LION_COLORS = rgbPalette({
  m: '#b85a26',
  f: '#f0b75a',
  b: '#e8a94e',
  t: '#b85a26',
  l: '#a8743a',
  w: '#fbf8ef',
})
const LAMB_COLORS: Readonly<Record<string, Rgb>> = {
  ...LION_COLORS,
  ...rgbPalette({ f: '#e8cfb4', l: '#5a4a43' }),
}

const STAR_TRAIL = rgbPalette({
  a: '#ffffff',
  b: '#fff4c8',
  c: '#e0d6a0',
  d: '#b8b0a0',
  e: '#8a90b0',
})

function paneDot(buf: PixelBuffer, x: number, y: number, c: Rgb): void {
  if (isWindowPane(x, y)) setPixel(buf, x, y, c)
}

export function drawParadiseWalkers(buf: PixelBuffer, tMs: number): void {
  const p = (tMs / 110) % 80
  const frame = Math.floor(tMs / 260) % 2
  const walkers: readonly (readonly [
    'lion' | 'lamb',
    number,
    Readonly<Record<string, Rgb>>,
  ])[] = [
    ['lamb', 8, LAMB_COLORS],
    ['lion', 0, LION_COLORS],
  ]
  for (const [kind, offset, colors] of walkers) {
    const x0 = Math.round(4 + p + offset)
    const baseY = 34 + Math.round(Math.sin((x0 + 3) / 6) * 2)
    WALKERS[kind][frame].forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i]
        if (ch !== '.') paneDot(buf, x0 + i, baseY - 4 + j, colors[ch])
      }
    })
  }
}

export function drawShootingStar(buf: PixelBuffer, tMs: number): void {
  const a = (tMs % 2600) / 650
  if (a >= 1) return
  const hx = 54 - a * 30
  const hy = 12 + a * 13
  const trail = [
    STAR_TRAIL.a,
    STAR_TRAIL.b,
    STAR_TRAIL.c,
    STAR_TRAIL.d,
    STAR_TRAIL.e,
  ]
  trail.forEach((c, i) =>
    paneDot(buf, Math.round(hx + i * 1.3), Math.round(hy - i * 0.55), c)
  )
}
