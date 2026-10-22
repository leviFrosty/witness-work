/**
 * Back wall (y 0–51): colour, wallpaper pattern, crown moulding (y 0–6) and the
 * wainscot rail (y 52–61).
 */
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

export { WALL_COLOR_IDS, WALL_PATTERN_IDS }
export type { WallColor, WallPattern }

/** Base colour of each wall. */
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
  speck: Rgb
) => void

/** First and last-plus-one wall rows a pattern paints. */
const TOP = 7
const BOTTOM = 52

/** Calls `paint` for every wall pixel a pattern may touch. */
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

/** `n` mod `m`, never negative. */
const mod = (n: number, m: number): number => ((n % m) + m) % m

/**
 * In a grid of overlapping circles of radius `r` (centres `sx` apart, rows `sy`
 * apart from `y0`, odd rows shifted half a step), the offset of (x, y) from the
 * centre of the circle that shows there. `fans`: each row covers the one above
 * and only the top half of a circle shows (seigaiha, fans); otherwise each row
 * covers the one below and only the bottom half shows (roof scales).
 */
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
    // Lozenges in rows, outlined, with a light core, their edges
    // feathered sideways as dyed threads bleed. Mirrored top to bottom.
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

/**
 * How dark a wall colour is, 0 (light, every starter) to 1 (indigo): what's
 * drawn on it is adjusted by this much so it still reads.
 */
export function wallDarkness(base: Rgb): number {
  const [r, g, b] = rgbTuple(base)
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return Math.min(1, Math.max(0, (0.6 - luma) / 0.3))
}

/**
 * The pattern tones on `base`: a touch darker and a quarter whiter, and the
 * plaster's light specks. A dark wall gets a deeper shade and a softer light,
 * or the shade would vanish and the light would glare, and fainter specks, so
 * they don't read as stars (light walls, every starter included, are
 * unchanged).
 */
export function patternTones(base: Rgb): [shade: Rgb, light: Rgb, speck: Rgb] {
  const dark = wallDarkness(base)
  const light = mix(base, WHITE, 0.25 - 0.13 * dark)
  return [dim(base, 0.93 - 0.09 * dark), light, mix(light, base, 0.6 * dark)]
}

/** Paints the wall, its pattern, the moulding and the wainscot. */
export function drawWall(
  buf: PixelBuffer,
  color: WallColor,
  pattern: WallPattern
): void {
  const W = buf.width
  const base = WALL_RGB[color]
  fillRect(buf, 0, 0, W, 52, base)
  const [shade, light, speck] = patternTones(base)
  PATTERNS[pattern](buf, shade, light, speck)
  fillRect(buf, 0, 0, W, 3, MOULDING)
  fillRect(buf, 0, 3, W, 4, MOULDING_SHADOW)
  fillRect(buf, 0, 52, W, 62, WAINSCOT)
  fillRect(buf, 0, 52, W, 53, WAINSCOT_TOP)
  for (let x = 6; x < W; x += 14) fillRect(buf, x, 54, x + 1, 61, WAINSCOT_SEAM)
}
