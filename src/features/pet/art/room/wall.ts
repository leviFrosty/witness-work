import {
  createRng,
  dim,
  fillRect,
  mix,
  plot,
  rgb,
  rgbTuple,
  type PixelBuffer,
  type Rgb,
} from '@/lib/pixelArt'
import {
  WALL_COLORS as WALL_COLOR_IDS,
  WALL_PATTERNS as WALL_PATTERN_IDS,
  type WallColor,
  type WallPattern,
} from '@/types/pet'

import { SCENE_W } from '../layout'

export { WALL_COLOR_IDS, WALL_PATTERN_IDS }
export type { WallColor, WallPattern }

export const WALL_RGB: Readonly<Record<WallColor, Rgb>> = {
  sand: rgb('#dcbc91'),
  sage: rgb('#b7c59f'),
  sky: rgb('#a8c3d6'),
  rose: rgb('#dbb0a5'),
  cream: rgb('#ece2cb'),
  indigo: rgb('#36517c'),
  delft: rgb('#b6cdeb'),
  turmeric: rgb('#e3b347'),
  terracotta: rgb('#c4704a'),
  pistachio: rgb('#c3d38c'),
  lilac: rgb('#c8b4de'),
  seaglass: rgb('#a7d8c8'),
  plum: rgb('#77496f'),
  cocoa: rgb('#654742'),
  peach: rgb('#f4be98'),
  paprika: rgb('#b94b31'),
  glacier: rgb('#dfe8ee'),
}

const WHITE = rgb('#ffffff')
const MOULDING = rgb('#8a5a3a')
const MOULDING_SHADOW = rgb('#6e4529')
const WAINSCOT = rgb('#a77a50')
const WAINSCOT_TOP = rgb('#7d5333')
const WAINSCOT_SEAM = rgb('#946a43')

type PatternPainter = (
  buf: PixelBuffer,
  shade: Rgb,
  light: Rgb,
  speck: Rgb,
  base: Rgb
) => void

export const WALL_TOP = 7
export const WALL_BOTTOM = 52

const TOP = WALL_TOP
const BOTTOM = WALL_BOTTOM

function eachWallPixel(
  buf: PixelBuffer,
  paint: (x: number, y: number) => Rgb | null
): void {
  for (let y = TOP; y < BOTTOM; y++) {
    for (let x = 0; x < buf.width; x++) {
      const c = paint(x, y)
      if (c !== null) plot(buf, x, y, c)
    }
  }
}

const mod = (n: number, m: number): number => ((n % m) + m) % m

function overlapOffset(
  x: number,
  y: number,
  r: number,
  sx: number,
  sy: number,
  y0: number,
  fans: boolean
): [number, number] | null {
  const first = Math.ceil((y - r - y0) / sy)
  const last = Math.floor((y + r - y0) / sy)
  for (let i = 0; i <= last - first; i++) {
    const j = fans ? last - i : first + i
    const cy = y0 + j * sy
    const dy = y - cy
    if (fans ? dy > 0 : dy < 0) continue
    const shift = mod(j, 2) * (sx / 2)
    const dx = x - (shift + Math.round((x - shift) / sx) * sx)
    if (dx * dx + dy * dy <= r * r) return [dx, dy]
  }
  return null
}

type Ridge = readonly (readonly [number, number])[]

function ridgeHeights(points: Ridge): Float32Array {
  const ys = new Float32Array(SCENE_W)
  for (let x = 0; x < SCENE_W; x++) {
    let i = 0
    while (i < points.length - 2 && points[i + 1][0] <= x) i++
    const [x0, y0] = points[i]
    const [x1, y1] = points[i + 1]
    ys[x] = y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
  }
  return ys
}

export const MOUNTAIN_FAR = ridgeHeights([
  [-6, 33],
  [10, 25],
  [22, 31],
  [36, 21],
  [50, 30],
  [64, 25],
  [74, 31],
  [88, 21],
  [100, 30],
  [110, 22],
  [118, 29],
  [127, 17],
  [138, 28],
  [148, 23],
  [158, 28],
  [166, 20],
  [173, 29],
  [182, 19],
  [190, 26],
])

const MOUNTAIN_MID = ridgeHeights([
  [-5, 40],
  [12, 35],
  [28, 41],
  [46, 34],
  [62, 40],
  [80, 36],
  [96, 42],
  [114, 35],
  [130, 41],
  [146, 34],
  [164, 40],
  [185, 36],
])

const MOUNTAIN_NEAR = (() => {
  const ys = new Float32Array(SCENE_W)
  for (let x = 0; x < SCENE_W; x++)
    ys[x] = 46.5 + 2.4 * Math.sin(x * 0.07 + 0.6) + 1.3 * Math.sin(x * 0.19)
  return ys
})()

const SNOW_LINE = 25.5

export function wallTones(base: Rgb): {
  readonly base: Rgb
  readonly shade: Rgb
  readonly light: Rgb
  readonly bright: Rgb
  readonly far: Rgb
  readonly mid: Rgb
  readonly near: Rgb
  readonly deep: Rgb
} {
  const dark = wallDarkness(base)
  const [shade, light] = patternTones(base)
  return {
    base,
    shade,
    light,
    bright: mix(base, WHITE, 0.5 - 0.22 * dark),
    far: dim(base, 0.9 - 0.06 * dark),
    mid: dim(base, 0.8 - 0.08 * dark),
    near: dim(base, 0.7 - 0.1 * dark),
    deep: dim(base, 0.56 - 0.12 * dark),
  }
}

const LEAF_MOTIF = [
  '..x..',
  '.xvx.',
  '.xvx.',
  'xxvxx',
  'xxvxx',
  'xxvxx',
  '.xvx.',
  '..v..',
  '..v..',
] as const

const LEAF_LEAN = [
  '....xx.',
  '...xvxx',
  '..xvxxx',
  '.xxvxx.',
  '.xvxx..',
  'xxvx...',
  '.vx....',
  'v......',
] as const

const PATTERNS: Readonly<Record<WallPattern, PatternPainter>> = {
  plain(buf, shade, _light, speck) {
    const r = createRng(7)
    for (let i = 0; i < 260; i++) {
      plot(buf, r() * buf.width, 7 + r() * 45, r() < 0.5 ? shade : speck)
    }
  },
  dots(buf, shade) {
    for (let y = 10; y < 50; y += 5) {
      for (let x = (y * 7) % 11; x < buf.width; x += 11) plot(buf, x, y, shade)
    }
  },
  stripes(buf, shade, light) {
    for (let x = 2; x < buf.width; x += 10) {
      fillRect(buf, x, 7, x + 3, 52, shade)
      fillRect(buf, x + 5, 7, x + 6, 52, light)
    }
  },
  trellis(buf, shade, light) {
    for (let y = 7; y < 52; y++) {
      for (let x = 0; x < buf.width; x++) {
        if ((x + y) % 12 === 0 || (x - y + 240) % 12 === 0)
          plot(buf, x, y, shade)
        if ((x + y) % 12 === 6 && (x - y + 240) % 12 === 6)
          plot(buf, x, y, light)
      }
    }
  },
  clouds(buf, shade, light) {
    const r = createRng(97)
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(r() * buf.width)
      const y = TOP + 2 + Math.floor(r() * (BOTTOM - TOP - 4))
      const w = 3 + Math.floor(r() * 5)
      fillRect(buf, x, y, x + w, y + 1, light)
      if (r() < 0.5) fillRect(buf, x + 1, y + 1, x + w - 1, y + 2, shade)
    }
  },
  leaves(buf, shade, light) {
    for (let row = -1; TOP + row * 12 < BOTTOM; row++) {
      for (let col = -1; col * 16 < buf.width + 16; col++) {
        const x0 = col * 16 + mod(row, 2) * 8 + 2
        const y0 = TOP + 2 + row * 12
        const kind = mod(col + row * 2, 3)
        const motif = kind === 0 ? LEAF_MOTIF : LEAF_LEAN
        const flip = kind === 2
        motif.forEach((line, j) => {
          for (let i = 0; i < line.length; i++) {
            const cell = line[i]
            if (cell === '.') continue
            const x = x0 + (flip ? line.length - 1 - i : i)
            const y = y0 + j
            if (y >= TOP && y < BOTTOM)
              plot(buf, x, y, cell === 'v' ? light : shade)
          }
        })
      }
    }
  },
  mountains(buf, _shade, light, _speck, base) {
    const t = wallTones(base)
    const r = createRng(211)
    for (let x = 0; x < buf.width; x++) {
      const far = MOUNTAIN_FAR[x]
      const mid = MOUNTAIN_MID[x]
      const near = MOUNTAIN_NEAR[x]
      const rising = x > 0 && MOUNTAIN_FAR[x - 1] > far
      for (let y = Math.max(TOP, Math.ceil(far)); y < BOTTOM; y++) {
        if (y >= near) {
          plot(buf, x, y, y - near < 1 ? t.mid : t.near)
          continue
        }
        if (y >= mid) {
          const slope = x > 0 && MOUNTAIN_MID[x - 1] > mid
          const lit = y - mid < 1 || (slope && y - mid < 3 && (x + y) % 2 === 0)
          plot(buf, x, y, lit ? t.far : t.mid)
          continue
        }
        const depth = y - far
        const cap = (SNOW_LINE - far) * 0.6 + ((x * 7) % 3 === 0 ? 1 : 0)
        if (far < SNOW_LINE && depth < cap)
          plot(buf, x, y, rising || depth < 1 ? t.bright : light)
        else if (depth < 1) plot(buf, x, y, rising ? light : t.far)
        else plot(buf, x, y, !rising && depth < 5 ? t.shade : t.far)
      }
    }
    let x = 3
    while (x < buf.width) {
      const h = 4 + Math.floor(r() * 3)
      const foot = Math.round(MOUNTAIN_NEAR[Math.min(x, buf.width - 1)])
      for (let i = 0; i < h; i++) {
        const half = Math.floor((i + 1) / 2)
        fillRect(
          buf,
          x - half,
          foot - h + i,
          x + half + 1,
          foot - h + i + 1,
          t.deep
        )
      }
      plot(buf, x, foot, t.deep)
      x += 5 + Math.floor(r() * 9)
    }
  },
  aurora(buf, shade, light, speck, base) {
    PATTERNS.plain(buf, shade, light, speck, base)
  },
  waves(buf, shade, light) {
    eachWallPixel(buf, (x, y) => {
      const o = overlapOffset(x, y, 12, 24, 6, TOP + 3, true)
      if (!o) return null
      const d = Math.hypot(o[0], o[1] - 0.5)
      if (d > 11) return shade
      const ring = Math.floor(d / 2.5)
      if (ring === 3) return light
      if (ring === 1) return light
      if (d < 1.5) return shade
      return mod(Math.floor(d), 5) === 0 ? shade : null
    })
  },
  chevron(buf, shade, light) {
    eachWallPixel(buf, (x, y) => {
      const zig = Math.abs(mod(x, 12) - 6)
      const row = mod(y - TOP - zig, 11)
      if (row < 3) return shade
      if (row === 5) return light
      if (row === 6) return (x + y) % 2 ? light : null
      return null
    })
  },
  gingham(buf, shade, light) {
    eachWallPixel(buf, (x, y) => {
      const across = mod(x, 10) < 5
      const down = mod(y - TOP, 10) < 5
      if (across && down) return shade
      if (across || down) return (x + y) % 2 ? shade : null
      return (x + y) % 2 ? null : light
    })
  },
  scales(buf, shade, light) {
    eachWallPixel(buf, (x, y) => {
      const o = overlapOffset(x, y, 6.5, 12, 6, TOP - 3, false)
      if (!o) return null
      const d = Math.hypot(o[0], o[1])
      if (d > 5.5) return shade
      if (d > 3.5 && d <= 4.5 && o[0] < 0) return light
      return null
    })
  },
  argyle(buf, shade, light) {
    eachWallPixel(buf, (x, y) => {
      const u = 2 * x + (y - TOP)
      const v = 2 * x - (y - TOP) + 400
      if ((mod(u, 24) === 12 || mod(v, 24) === 12) && y % 3 !== 0) return light
      const cell = Math.floor(u / 24) + Math.floor(v / 24)
      return cell % 2 ? shade : null
    })
  },
  ikat(buf, shade, light) {
    const r = createRng(23)
    const feather = Array.from({ length: 10 }, () => Math.floor(r() * 3))
    eachWallPixel(buf, (x, y) => {
      const row = Math.round((y - TOP - 10) / 22)
      const shift = mod(row, 2) * 12
      const col = Math.round((x - shift) / 24)
      const dx = Math.abs(x - shift - col * 24)
      const dy = Math.abs(y - TOP - 10 - row * 22)
      if (dy > 9) return null
      const half = Math.round(9 * (1 - dy / 10))
      const bleed = feather[dy] - (mod(col + row, 2) ? 1 : 0)
      if (dx <= half - 6) return light
      if (dx <= half - 4) return null
      if (dx <= half) return shade
      if (dx <= half + bleed) return (x + dy) % 2 ? shade : null
      return null
    })
  },
  mosaic(buf, shade, light) {
    const r = createRng(41)
    for (let top = TOP; top < BOTTOM; top += 4) {
      fillRect(buf, 0, top + 3, buf.width, top + 4, shade)
      for (let x = -Math.floor(r() * 3); x < buf.width; x += 4) {
        fillRect(buf, x + 3, top, x + 4, top + 3, shade)
        const tone = r()
        if (tone < 0.17) fillRect(buf, x, top, x + 3, top + 3, light)
        else if (tone < 0.4) plot(buf, x, top, light)
        else if (tone < 0.5) plot(buf, x + 2, top + 2, shade)
      }
    }
  },
  meadow(buf, shade, light) {
    const r = createRng(59)
    for (let cy = TOP; cy < BOTTOM - 3; cy += 7) {
      for (let cx = 0; cx < buf.width; cx += 8) {
        const x = cx + 1 + Math.floor(r() * 6)
        const y = cy + 1 + Math.floor(r() * 5)
        if (r() < 0.12) continue
        plot(buf, x, y - 1, light)
        plot(buf, x - 1, y, light)
        plot(buf, x + 1, y, light)
        plot(buf, x - 1, y + 1, light)
        plot(buf, x + 1, y + 1, light)
        plot(buf, x, y, shade)
      }
    }
  },
  honeycomb(buf, shade, light) {
    for (let row = 0; row * 9 < BOTTOM - TOP + 9; row++) {
      const cy = TOP + 2 + row * 9
      for (let cx = (row % 2) * 6; cx < buf.width + 6; cx += 12) {
        for (let i = 0; i <= 6; i++) {
          const dy = Math.floor(i / 2)
          plot(buf, cx - i, cy - 6 + dy, shade)
          plot(buf, cx + i, cy - 6 + dy, shade)
          plot(buf, cx - i, cy + 6 - dy, shade)
          plot(buf, cx + i, cy + 6 - dy, shade)
          if (i > 0 && i < 6) plot(buf, cx - i, cy - 5 + dy, light)
        }
        fillRect(buf, cx - 6, cy - 3, cx - 5, cy + 4, shade)
        fillRect(buf, cx - 5, cy - 2, cx - 4, cy + 3, light)
      }
    }
  },
  fan(buf, shade, light) {
    eachWallPixel(buf, (x, y) => {
      const row = Math.floor((y - TOP) / 12)
      const base = TOP + 11 + row * 12
      const shift = mod(row, 2) * 11
      const dx = x - shift - Math.round((x - shift) / 22) * 22
      const dy = y - base
      const d = Math.hypot(dx, dy - 0.5)
      if (d > 10.5) return null
      if (d > 9.5) return shade
      if (d > 8.5) return null
      if (d < 2.5) return shade
      const angle = Math.atan2(0.5 - dy, dx) / Math.PI
      const wedge = Math.min(4, Math.floor(angle * 5))
      return wedge % 2 ? light : null
    })
  },
}

export function wallDarkness(base: Rgb): number {
  const [r, g, b] = rgbTuple(base)
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return Math.min(1, Math.max(0, (0.6 - luma) / 0.3))
}

export function patternTones(base: Rgb): [shade: Rgb, light: Rgb, speck: Rgb] {
  const dark = wallDarkness(base)
  const light = mix(base, WHITE, 0.25 - 0.13 * dark)
  return [dim(base, 0.93 - 0.09 * dark), light, mix(light, base, 0.6 * dark)]
}

export function drawWall(
  buf: PixelBuffer,
  color: WallColor,
  pattern: WallPattern
): void {
  const W = buf.width
  const base = WALL_RGB[color]
  fillRect(buf, 0, 0, W, 52, base)
  const [shade, light, speck] = patternTones(base)
  PATTERNS[pattern](buf, shade, light, speck, base)
  fillRect(buf, 0, 0, W, 3, MOULDING)
  fillRect(buf, 0, 3, W, 4, MOULDING_SHADOW)
  fillRect(buf, 0, 52, W, 62, WAINSCOT)
  fillRect(buf, 0, 52, W, 53, WAINSCOT_TOP)
  for (let x = 6; x < W; x += 14) fillRect(buf, x, 54, x + 1, 61, WAINSCOT_SEAM)
}
