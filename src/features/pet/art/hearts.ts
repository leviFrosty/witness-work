/**
 * The 5 × 4 pixel heart used in the hearts row: full, half (left half filled, a
 * muted middle column) or empty, in red or gold.
 */
import {
  createBuffer,
  mix,
  rgb,
  setPixel,
  type PixelBuffer,
} from '@/lib/pixelArt'

const CELLS: readonly (readonly [number, number])[] = [
  [1, 0],
  [3, 0],
  [0, 1],
  [1, 1],
  [2, 1],
  [3, 1],
  [4, 1],
  [1, 2],
  [2, 2],
  [3, 2],
  [2, 3],
]

const EMPTY = rgb('#cfcfcf')
const RED = { main: rgb('#ff4f6d'), light: rgb('#ff9aaa') }
const GOLD = { main: rgb('#f2b632'), light: rgb('#fff0b0') }

/** Heart icon size. */
export const HEART_ICON_W = 5
export const HEART_ICON_H = 4

/**
 * One heart filled to `fill` (≥ 1 full, 0 < fill < 1 half, 0 empty). Gold
 * hearts are the 365-days-at-five moment.
 */
export function heartIcon(fill: number, gold = false): PixelBuffer {
  const buf = createBuffer(HEART_ICON_W, HEART_ICON_H)
  const { main, light } = gold ? GOLD : RED
  const half = mix(main, EMPTY, 0.5)
  for (const [x, y] of CELLS) {
    const filled = fill >= 1 || (fill > 0 && x <= 2)
    const c = !filled
      ? EMPTY
      : x === 1 && y === 1
        ? light
        : fill < 1 && x === 2
          ? half
          : main
    setPixel(buf, x, y, c)
  }
  return buf
}

/** Fill of each of five hearts for a hearts value 0–5 (halves allowed). */
export function heartFills(hearts: number): number[] {
  return [0, 1, 2, 3, 4].map((i) => Math.max(0, Math.min(1, hearts - i)))
}
