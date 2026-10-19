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
}

const WHITE = rgb('#ffffff')
const MOULDING = rgb('#8a5a3a')
const MOULDING_SHADOW = rgb('#6e4529')
const WAINSCOT = rgb('#a77a50')
const WAINSCOT_TOP = rgb('#7d5333')
const WAINSCOT_SEAM = rgb('#946a43')

type PatternPainter = (buf: PixelBuffer, shade: Rgb, light: Rgb) => void

const PATTERNS: Readonly<Record<WallPattern, PatternPainter>> = {
  plain(buf, shade, light) {
    const r = createRng(7)
    for (let i = 0; i < 260; i++) {
      plot(buf, r() * buf.width, 7 + r() * 45, r() < 0.5 ? shade : light)
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
  PATTERNS[pattern](buf, dim(base, 0.93), mix(base, WHITE, 0.25))
  fillRect(buf, 0, 0, W, 3, MOULDING)
  fillRect(buf, 0, 3, W, 4, MOULDING_SHADOW)
  fillRect(buf, 0, 52, W, 62, WAINSCOT)
  fillRect(buf, 0, 52, W, 53, WAINSCOT_TOP)
  for (let x = 6; x < W; x += 14) fillRect(buf, x, 54, x + 1, 61, WAINSCOT_SEAM)
}
