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

export const HEART_MAIN = { red: '#ff4f6d', gold: '#f2b632' } as const

const EMPTY = rgb('#cfcfcf')
const RED = { main: rgb(HEART_MAIN.red), light: rgb('#ff9aaa') }
const GOLD = { main: rgb(HEART_MAIN.gold), light: rgb('#fff0b0') }

export const HEART_ICON_W = 5
export const HEART_ICON_H = 4

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

export function heartFills(hearts: number): number[] {
  return [0, 1, 2, 3, 4].map((i) => Math.max(0, Math.min(1, hearts - i)))
}

const ROW_GAP = 1

export const HEARTS_ROW_W = HEART_ICON_W * 5 + ROW_GAP * 4

export function heartsRow(hearts: number, gold = false): PixelBuffer {
  const row = createBuffer(HEARTS_ROW_W, HEART_ICON_H)
  heartFills(hearts).forEach((fill, i) =>
    blit(row, heartIcon(fill, gold), i * (HEART_ICON_W + ROW_GAP), 0)
  )
  return row
}
