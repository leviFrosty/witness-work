import {
  dim,
  fillRect,
  plot,
  readRgb,
  rgbPalette,
  type PixelBuffer,
  type Rgb,
} from '@/lib/pixelArt'
import { STUDY_IDS, type StudyId } from '@/types/pet'

export { STUDY_IDS }
export type { StudyId }

export const STUDY_FLOOR_Y = 74

const C = rgbPalette({
  wood: '#8a5a35',
  woodLight: '#a8744a',
  woodTop: '#b98454',
  woodDark: '#5e3b22',
  shelfBack: '#4f321d',
  paper: '#f2e8d0',
  paperShade: '#d9cba8',
  ink: '#9c8f74',
  cover: '#4a4f5c',
  coverEdge: '#33363f',
  ribbon: '#b0413e',
  brass: '#d4a640',
  leather: '#9b6a3f',
  leatherDark: '#6e4a2a',
  leatherLight: '#b78155',
  notebook: '#5f8fb0',
  notebookDark: '#4a7393',
  pen: '#2f2f35',
  highlighter: '#f2d34a',
  highlighterCap: '#c9a92a',
  highlight: '#f6e27a',
  fabric: '#7a9a6a',
  fabricLight: '#8fb07e',
  fabricDark: '#5f7d52',
  pillow: '#e8d9a8',
  pillowShade: '#cdbd8b',
  bookRed: '#8c3b32',
  bookGreen: '#4f7a4a',
  bookGold: '#c79a3a',
  bookBlue: '#3d5f8a',
  bookPlum: '#7a5a8a',
  bookTeal: '#3f7f7a',
})

type Box = readonly [number, number, number, number]

const SHIFT_X = 4

const rect = (buf: PixelBuffer, [x0, y0, x1, y1]: Box, c: Rgb) =>
  fillRect(buf, x0 + SHIFT_X, y0, x1 + SHIFT_X, y1, c)

const dot = (buf: PixelBuffer, x: number, y: number, c: Rgb) =>
  plot(buf, x + SHIFT_X, y, c)

function shadow(buf: PixelBuffer, x0: number, x1: number): void {
  const cx = (x0 + x1) / 2 + SHIFT_X
  const rx = (x1 - x0) / 2
  for (let y = STUDY_FLOOR_Y - 1; y <= STUDY_FLOOR_Y + 1; y++) {
    for (let x = Math.floor(x0 + SHIFT_X); x <= x1 + SHIFT_X; x++) {
      const a = (x + 0.5 - cx) / rx
      const b = (y + 0.5 - STUDY_FLOOR_Y) / 1.6
      if (a * a + b * b <= 1) plot(buf, x, y, dim(readRgb(buf, x, y), 0.82))
    }
  }
}

function closedBook(
  buf: PixelBuffer,
  x0: number,
  y0: number,
  x1: number,
  cover: Rgb
): void {
  rect(buf, [x0, y0, x1, y0 + 4], cover)
  rect(buf, [x0 + 1, y0 + 1, x1, y0 + 3], C.paper)
  rect(buf, [x0 + 1, y0 + 2, x1, y0 + 3], C.paperShade)
  rect(buf, [x0, y0 + 3, x1, y0 + 4], dim(cover, 0.75))
}

function openBook(
  buf: PixelBuffer,
  x0: number,
  y0: number,
  half: number,
  highlight = false
): void {
  const x1 = x0 + half * 2
  rect(buf, [x0 - 1, y0 + 3, x1 + 1, y0 + 5], C.cover)
  rect(buf, [x0, y0, x1, y0 + 4], C.paper)
  rect(buf, [x0 + half, y0, x0 + half + 1, y0 + 4], C.paperShade)
  for (let x = x0 + 1; x < x1 - 1; x += 2) {
    if (x === x0 + half || x === x0 + half - 1) continue
    dot(buf, x, y0 + 1, C.ink)
    dot(buf, x, y0 + 2, C.ink)
  }
  if (highlight) rect(buf, [x0 + 1, y0 + 2, x0 + half - 1, y0 + 3], C.highlight)
}

function books(
  buf: PixelBuffer,
  x0: number,
  floor: number,
  spines: readonly (readonly [number, number, Rgb])[]
): void {
  let x = x0
  for (const [width, height, color] of spines) {
    rect(buf, [x, floor - height, x + width, floor], color)
    dot(buf, x, floor - height, dim(color, 0.8))
    if (height > 5)
      dot(buf, x + Math.floor(width / 2), floor - height + 2, C.brass)
    x += width
  }
}

const ITEMS: Readonly<
  Record<Exclude<StudyId, 'none'>, (buf: PixelBuffer) => void>
> = {
  stool(buf) {
    shadow(buf, 24, 44)
    rect(buf, [26, 62, 43, 64], C.woodTop)
    rect(buf, [26, 64, 43, 65], C.woodDark)
    rect(buf, [27, 65, 29, 74], C.wood)
    rect(buf, [40, 65, 42, 74], C.wood)
    rect(buf, [29, 69, 40, 70], C.woodDark)
    closedBook(buf, 29, 58, 40, C.cover)
    dot(buf, 35, 62, C.ribbon)
    dot(buf, 35, 63, C.ribbon)
  },
  bag(buf) {
    shadow(buf, 22, 44)
    for (const [x, y] of [
      [25, 61],
      [25, 60],
      [26, 59],
      [26, 58],
      [27, 57],
      [28, 56],
      [29, 55],
      [30, 55],
      [31, 54],
      [32, 54],
      [33, 54],
      [34, 55],
      [35, 55],
      [36, 56],
      [37, 57],
      [38, 58],
      [38, 59],
      [39, 60],
      [39, 61],
    ] as const)
      dot(buf, x, y, C.leatherDark)
    rect(buf, [34, 58, 38, 63], C.cover)
    rect(buf, [35, 59, 38, 62], C.paper)
    rect(buf, [24, 62, 42, 74], C.leather)
    rect(buf, [24, 62, 42, 63], C.leatherLight)
    rect(buf, [24, 62, 42, 67], C.leatherDark)
    rect(buf, [25, 63, 41, 66], C.leather)
    rect(buf, [24, 73, 42, 74], C.leatherDark)
    rect(buf, [31, 66, 35, 69], C.brass)
    rect(buf, [32, 67, 34, 68], C.leatherDark)
    for (let x = 26; x < 41; x += 2) dot(buf, x, 71, C.leatherLight)
  },
  bookstand(buf) {
    shadow(buf, 26, 46)
    rect(buf, [28, 72, 44, 74], C.woodDark)
    rect(buf, [30, 71, 42, 72], C.wood)
    rect(buf, [34, 57, 38, 71], C.wood)
    rect(buf, [34, 57, 35, 71], C.woodLight)
    rect(buf, [25, 54, 47, 57], C.woodLight)
    rect(buf, [25, 57, 47, 58], C.woodDark)
    rect(buf, [24, 56, 48, 57], C.woodDark)
    openBook(buf, 27, 50, 9)
    dot(buf, 36, 54, C.ribbon)
    dot(buf, 36, 55, C.ribbon)
  },
  desk(buf) {
    shadow(buf, 16, 52)
    rect(buf, [18, 60, 50, 62], C.woodTop)
    rect(buf, [18, 62, 50, 63], C.woodDark)
    rect(buf, [19, 63, 49, 67], C.wood)
    rect(buf, [36, 63, 47, 66], C.woodLight)
    dot(buf, 41, 64, C.brass)
    dot(buf, 42, 64, C.brass)
    rect(buf, [19, 67, 21, 74], C.woodDark)
    rect(buf, [47, 67, 49, 74], C.woodDark)
    rect(buf, [21, 67, 22, 74], C.wood)
    rect(buf, [22, 57, 31, 60], C.notebook)
    rect(buf, [23, 57, 31, 59], C.paper)
    rect(buf, [26, 57, 27, 59], C.notebookDark)
    dot(buf, 24, 58, C.ink)
    dot(buf, 28, 58, C.ink)
    dot(buf, 29, 58, C.ink)
    rect(buf, [32, 59, 38, 60], C.pen)
    dot(buf, 32, 59, C.brass)
    closedBook(buf, 40, 56, 48, C.bookRed)
    rect(buf, [41, 54, 47, 56], C.bookBlue)
    rect(buf, [42, 55, 47, 56], C.paper)
  },
  bookcase(buf) {
    shadow(buf, 18, 50)
    rect(buf, [20, 48, 48, 74], C.woodDark)
    rect(buf, [20, 48, 48, 50], C.woodTop)
    rect(buf, [22, 50, 46, 60], C.shelfBack)
    rect(buf, [22, 62, 46, 72], C.shelfBack)
    rect(buf, [20, 60, 48, 62], C.woodLight)
    rect(buf, [20, 72, 48, 74], C.wood)
    books(buf, 22, 60, [
      [2, 8, C.bookBlue],
      [3, 9, C.cover],
      [2, 7, C.bookRed],
      [2, 8, C.bookGreen],
      [3, 9, C.bookGold],
      [2, 7, C.bookPlum],
      [2, 8, C.bookTeal],
    ])
    for (const [x, y] of [
      [40, 59],
      [41, 58],
      [42, 57],
      [43, 56],
      [44, 55],
    ] as const) {
      dot(buf, x, y, C.bookRed)
      dot(buf, x + 1, y, C.bookRed)
      dot(buf, x + 1, y + 1, dim(C.bookRed, 0.8))
    }
    books(buf, 22, 72, [
      [3, 9, C.bookGreen],
      [2, 8, C.cover],
      [2, 9, C.bookBlue],
      [3, 8, C.bookRed],
    ])
    rect(buf, [35, 68, 45, 72], C.notebook)
    rect(buf, [35, 68, 45, 69], C.notebookDark)
    rect(buf, [36, 66, 44, 68], C.bookGold)
    rect(buf, [37, 66, 44, 67], C.paper)
  },
  table(buf) {
    shadow(buf, 16, 52)
    rect(buf, [18, 62, 50, 64], C.woodTop)
    rect(buf, [18, 64, 50, 65], C.woodDark)
    rect(buf, [20, 65, 22, 74], C.wood)
    rect(buf, [46, 65, 48, 74], C.wood)
    rect(buf, [22, 68, 46, 69], C.woodDark)
    openBook(buf, 22, 57, 8, true)
    rect(buf, [41, 57, 49, 62], C.notebook)
    rect(buf, [42, 57, 49, 61], C.paper)
    dot(buf, 43, 58, C.ink)
    dot(buf, 45, 58, C.ink)
    dot(buf, 44, 59, C.ink)
    rect(buf, [40, 60, 47, 62], C.highlighter)
    rect(buf, [45, 60, 47, 62], C.highlighterCap)
  },
  armchair(buf) {
    shadow(buf, 18, 50)
    rect(buf, [24, 48, 44, 62], C.fabric)
    rect(buf, [23, 49, 45, 62], C.fabric)
    rect(buf, [24, 48, 44, 49], C.fabricLight)
    rect(buf, [28, 54, 34, 60], C.pillow)
    rect(buf, [28, 59, 34, 60], C.pillowShade)
    rect(buf, [25, 62, 43, 66], C.fabricLight)
    rect(buf, [24, 66, 44, 70], C.fabric)
    rect(buf, [24, 69, 44, 70], C.fabricDark)
    rect(buf, [20, 56, 25, 70], C.fabricDark)
    rect(buf, [43, 56, 48, 70], C.fabricDark)
    rect(buf, [20, 55, 25, 57], C.fabricLight)
    rect(buf, [43, 55, 48, 57], C.fabricLight)
    rect(buf, [21, 70, 23, 74], C.woodDark)
    rect(buf, [45, 70, 47, 74], C.woodDark)
    openBook(buf, 34, 59, 4)
  },
}

export function drawStudy(buf: PixelBuffer, study: StudyId | undefined): void {
  if (!study || study === 'none') return
  ITEMS[study](buf)
}
