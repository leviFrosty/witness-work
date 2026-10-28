/**
 * The 5 × 4 pixel heart used in the hearts row: full, half (left half filled, a
 * muted middle column) or empty, in red or gold.
 */
import {
  blit,
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

/** A full heart's main colour, red or gold, as CSS. */
export const HEART_MAIN = { red: '#ff4f6d', gold: '#f2b632' } as const

const EMPTY = rgb('#cfcfcf')
const RED = { main: rgb(HEART_MAIN.red), light: rgb('#ff9aaa') }
const GOLD = { main: rgb(HEART_MAIN.gold), light: rgb('#fff0b0') }

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

/** Pixels between hearts in a row. */
const ROW_GAP = 1
/** Width of a row of five hearts. */
export const HEARTS_ROW_W = HEART_ICON_W * 5 + ROW_GAP * 4

/** Five hearts for `hearts` (halves allowed) in one picture, red or gold. */
export function heartsRow(hearts: number, gold = false): PixelBuffer {
  const row = createBuffer(HEARTS_ROW_W, HEART_ICON_H)
  heartFills(hearts).forEach((fill, i) =>
    blit(row, heartIcon(fill, gold), i * (HEART_ICON_W + ROW_GAP), 0)
  )
  return row
}
