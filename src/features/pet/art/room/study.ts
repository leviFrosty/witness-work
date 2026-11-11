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
  plaid: '#b5524a',
  plaidDark: '#8c3b32',
  plaidLine: '#ecd9a8',
  enamel: '#4f7a72',
  enamelLight: '#6f9c92',
  enamelDark: '#2f4a45',
  basket: '#22302d',
  key: '#efe6cf',
  steel: '#b9bcc4',
  platen: '#3a3a42',
  platenLight: '#5c5c68',
  shade: '#2f7d5b',
  shadeLight: '#4fa57c',
  shadeDark: '#1f5a41',
  bulb: '#ffe7a0',
  quilt: '#6a8fb3',
  quiltLight: '#8fb0cf',
  quiltDark: '#4a6c8f',
  quiltFold: '#587a9e',
  lining: '#c9dcec',
  liningShade: '#a3bcd3',
  inside: '#e9b662',
  insideMid: '#cf9247',
  insideDeep: '#8f5a2c',
  peg: '#d9b77a',
})

export const STUDY_SHIFT_X = 4

export const STUDY_COLORS = C

type Box = readonly [number, number, number, number]

const SHIFT_X = STUDY_SHIFT_X

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
  rocker(buf) {
    shadow(buf, 22, 48)
  },
  typewriter(buf) {
    shadow(buf, 20, 50)
    rect(buf, [22, 62, 48, 64], C.woodTop)
    rect(buf, [22, 64, 48, 65], C.woodDark)
    rect(buf, [24, 65, 26, 74], C.wood)
    rect(buf, [44, 65, 46, 74], C.wood)
    rect(buf, [26, 69, 44, 70], C.woodDark)
    rect(buf, [25, 60, 46, 62], C.enamelDark)
    rect(buf, [26, 58, 45, 60], C.enamel)
    rect(buf, [28, 55, 43, 58], C.enamel)
    rect(buf, [28, 55, 43, 56], C.enamelLight)
    dot(buf, 26, 58, C.enamelLight)
    rect(buf, [32, 56, 39, 58], C.basket)
    for (let x = 33; x < 38; x += 2) dot(buf, x, 56, C.steel)
    for (let x = 27; x < 44; x += 2) dot(buf, x, 58, C.key)
    for (let x = 28; x < 44; x += 2) dot(buf, x, 59, C.key)
    rect(buf, [31, 60, 40, 61], C.key)
    dot(buf, 25, 61, C.basket)
    dot(buf, 45, 61, C.basket)
  },
  lampdesk(buf) {
    shadow(buf, 14, 52)
    rect(buf, [16, 60, 51, 62], C.woodTop)
    rect(buf, [16, 62, 51, 63], C.woodDark)
    rect(buf, [17, 63, 29, 74], C.wood)
    rect(buf, [17, 63, 18, 74], C.woodLight)
    rect(buf, [28, 63, 29, 74], C.woodDark)
    rect(buf, [19, 64, 27, 68], C.woodLight)
    rect(buf, [19, 69, 27, 73], C.woodLight)
    rect(buf, [19, 67, 27, 68], C.wood)
    rect(buf, [19, 72, 27, 73], C.wood)
    rect(buf, [22, 65, 24, 66], C.brass)
    rect(buf, [22, 70, 24, 71], C.brass)
    rect(buf, [29, 63, 50, 65], C.wood)
    rect(buf, [29, 65, 50, 66], C.woodDark)
    rect(buf, [48, 66, 50, 74], C.woodDark)
    rect(buf, [47, 66, 48, 74], C.wood)
    rect(buf, [19, 59, 27, 60], C.brass)
    rect(buf, [20, 58, 26, 59], C.brass)
    dot(buf, 20, 58, C.highlight)
    dot(buf, 21, 58, C.highlight)
    rect(buf, [22, 55, 24, 58], C.brass)
    rect(buf, [22, 55, 23, 58], C.highlight)
    rect(buf, [19, 49, 27, 50], C.shadeLight)
    rect(buf, [17, 50, 29, 54], C.shade)
    rect(buf, [18, 50, 24, 51], C.shadeLight)
    dot(buf, 18, 51, C.shadeLight)
    rect(buf, [17, 53, 29, 54], C.shadeDark)
    rect(buf, [19, 54, 27, 55], C.bulb)
    dot(buf, 27, 55, C.brass)
    dot(buf, 27, 56, C.brass)
    dot(buf, 27, 57, C.highlight)
    openBook(buf, 31, 55, 6)
    rect(buf, [44, 58, 50, 60], C.notebook)
    rect(buf, [44, 58, 50, 59], C.notebookDark)
    rect(buf, [45, 57, 49, 58], C.pen)
    dot(buf, 45, 57, C.brass)
  },
  fort(buf) {
    shadow(buf, 13, 52)
    paintFortShell(buf)
    paintFortOpening(buf, 0)
  },
}

const ROCKER_REACH = 28

export function paintRocker(buf: PixelBuffer, lean: number): void {
  const put = (x: number, y: number, c: Rgb) =>
    dot(buf, x + Math.round((lean * (STUDY_FLOOR_Y - y)) / ROCKER_REACH), y, c)
  const row = (x0: number, x1: number, y: number, c: Rgb) => {
    for (let x = x0; x < x1; x++) put(x, y, c)
  }
  const contact = 35 + lean * 2
  const runner = (x: number) =>
    STUDY_FLOOR_Y - 1 - Math.round(((x - contact) * (x - contact)) / 44)
  for (let x = 22; x <= 48; x++) {
    dot(buf, x, runner(x), C.shelfBack)
    dot(buf, x, runner(x) - 1, C.woodDark)
  }
  for (const x of [28, 41]) {
    for (let y = 65; y < runner(x) - 1; y++) {
      put(x, y, C.woodDark)
      put(x + 1, y, C.shelfBack)
    }
  }
  row(30, 41, 68, C.shelfBack)
  const post = (y: number) => 23 + Math.round(((y - 49) * 3) / 14)
  for (let y = 51; y < 63; y++) {
    const x = post(y)
    put(x + 6, y, C.shelfBack)
    put(x + 7, y, C.woodDark)
    if (y < 61) {
      put(x + 2, y, C.wood)
      put(x + 4, y, C.wood)
    }
    put(x, y, C.woodDark)
    put(x + 1, y, C.wood)
  }
  row(post(49), post(49) + 8, 49, C.wood)
  row(post(50), post(50) + 8, 50, C.woodDark)
  row(post(61) + 2, post(61) + 6, 61, C.woodDark)
  row(26, 45, 63, C.wood)
  row(26, 45, 64, C.shelfBack)
  row(27, 45, 57, C.wood)
  row(27, 44, 58, C.shelfBack)
  for (let y = 59; y < 63; y++) {
    put(42, y, C.woodDark)
    put(43, y, C.shelfBack)
  }
  for (let y = 48; y < 57; y++) {
    const x0 = post(Math.max(49, y)) - 2
    const x1 = x0 + (y < 54 ? 6 : 4)
    for (let x = x0; x < x1; x++) {
      let c = C.plaid
      if (y === 48 || y === 51 || y === 54) c = C.plaidLine
      else if ((x - x0) % 3 === 1) c = C.plaidDark
      put(x, y, c)
    }
  }
  for (let x = post(57) - 2; x < post(57) + 2; x += 2) put(x, 57, C.plaidLine)
  row(31, 41, 62, C.cover)
  for (let y = 59; y < 62; y++) row(32, 40, y, C.paper)
  for (let y = 59; y < 62; y++) put(36, y, C.paperShade)
  for (const x of [33, 34, 38]) put(x, 60, C.ink)
  put(36, 62, C.ribbon)
}

const TYPED = ['## ### ', '### # #', '# ## ##', '## # ##'] as const

export function paintTypewriterCarriage(
  buf: PixelBuffer,
  shift: number,
  paper: number,
  lines: number,
  typed: number
): void {
  if (paper > 0) {
    const x0 = 32 + shift
    rect(buf, [x0, 53 - paper, x0 + 9, 53], C.paper)
    rect(buf, [x0 + 8, 53 - paper, x0 + 9, 53], C.paperShade)
    for (let n = 1; n <= lines; n++) {
      const y = 52 - n
      if (y <= 53 - paper) break
      const words = TYPED[(lines - n) % TYPED.length]
      for (let i = 0; i < words.length; i++)
        if (words[i] === '#') dot(buf, x0 + 1 + i, y, C.ink)
    }
    const words = TYPED[lines % TYPED.length]
    for (let i = 0; i < typed; i++)
      if (words[i] === '#') dot(buf, x0 + 1 + i, 52, C.ink)
  }
  rect(buf, [29 + shift, 53, 44 + shift, 55], C.platen)
  rect(buf, [29 + shift, 53, 44 + shift, 54], C.platenLight)
  rect(buf, [28 + shift, 53, 29 + shift, 55], C.brass)
  rect(buf, [44 + shift, 53, 45 + shift, 55], C.brass)
  dot(buf, 27 + shift, 52, C.steel)
  dot(buf, 27 + shift, 53, C.steel)
}

const PAGE_TURN: readonly (readonly [number, number])[] = [
  [42, 2],
  [40, 4],
  [37, 5],
  [34, 4],
  [32, 2],
]

export const PAGE_TURN_STEPS = PAGE_TURN.length

export function paintLampdeskPage(buf: PixelBuffer, step: number): void {
  const turn = PAGE_TURN[step]
  if (!turn) return
  const [x, height] = turn
  rect(buf, [x, 59 - height, x + 1, 59], C.paper)
  dot(buf, x + (step < 2 ? 1 : -1), 59 - height + 1, C.paperShade)
}

const FORT_MID = 33

const fortTop = (x: number): number => {
  if (x < 17) return 50 + (17 - x) * 2
  if (x > 48) return 50 + (x - 48) * 2
  if (x <= 20 || x >= 45) return 50
  const a = (x - 32.5) / 12.5
  return 51 + Math.round(3 * (1 - a * a))
}

const fortHem = (x: number): number =>
  x >= 25 && x <= 42 ? STUDY_FLOOR_Y : STUDY_FLOOR_Y - 2 + ((x >> 1) & 1)

function paintFortShell(buf: PixelBuffer): void {
  rect(buf, [18, 70, 20, 74], C.woodDark)
  rect(buf, [46, 70, 48, 74], C.woodDark)
  for (let x = 14; x <= 51; x++) {
    const top = fortTop(x)
    const hem = fortHem(x)
    for (let y = top; y < hem; y++) {
      const drop = y - top
      let c = C.quilt
      if (drop === 0) c = C.quiltLight
      else if (drop % 6 === 3) c = C.plaidLine
      else if (drop % 6 === 4) c = C.quiltLight
      if (x === 14 || x === 51 || x === 24 || x === 43) c = C.quiltFold
      if (y === hem - 1) c = C.quiltDark
      dot(buf, x, y, c)
    }
  }
  for (let x = 14; x <= 26; x++) {
    const top = fortTop(x)
    const end = 65 - Math.round((x - 14) * 0.75)
    for (let y = top; y < end; y++) {
      const drop = y - top
      let c = C.plaid
      if (drop === 0 || y === end - 1) c = C.plaidLine
      else if (drop % 4 === 2) c = C.plaidDark
      else if ((x - 14) % 4 === 1) c = C.plaidDark
      dot(buf, x, y, c)
    }
  }
  for (const x of [27, 39]) {
    dot(buf, x, fortTop(x) - 1, C.peg)
    dot(buf, x, fortTop(x), C.peg)
    dot(buf, x, fortTop(x) + 1, C.woodDark)
  }
}

export const FORT_GLOW: readonly [number, number] = [FORT_MID, 68]

export const FORT_APEX = 60

export function fortOpening(
  lift: number,
  y: number
): readonly [left: number, right: number, flap: number] {
  const drop = y - FORT_APEX
  const left = FORT_MID - Math.min(5, Math.ceil(drop * 0.6))
  const right =
    FORT_MID + Math.min(5 + lift, Math.ceil(drop * (0.6 + 0.15 * lift)))
  const flap = y > STUDY_FLOOR_Y - 1 - lift * 3 ? 0 : 1 + Math.floor(drop / 5)
  return [left, right, flap]
}

export function paintFortOpening(buf: PixelBuffer, lift: number): void {
  for (let y = FORT_APEX; y < STUDY_FLOOR_Y; y++) {
    const [left, right, flap] = fortOpening(lift, y)
    const reach = lift > 0 && flap === 0 ? right + 3 : right
    for (let x = left; x <= reach; x++) {
      const d = Math.hypot(x - FORT_MID, (y - 68) * 0.9)
      dot(buf, x, y, d < 3.2 ? C.inside : d < 6.2 ? C.insideMid : C.insideDeep)
    }
    dot(buf, left - 1, y, C.lining)
    for (let i = 1; i <= flap; i++)
      dot(buf, right + i, y, i === flap && flap > 1 ? C.liningShade : C.lining)
    if (flap > 0) dot(buf, right + flap + 1, y, C.quiltDark)
  }
  rect(buf, [28, 71, 35, 74], C.pillow)
  rect(buf, [29, 70, 34, 71], C.pillow)
  rect(buf, [28, 73, 35, 74], C.pillowShade)
  rect(buf, [34, 72, 39, 74], C.cover)
  rect(buf, [34, 71, 39, 73], C.paper)
  dot(buf, 36, 71, C.paperShade)
  dot(buf, 36, 72, C.paperShade)
  dot(buf, 35, 72, C.ink)
  dot(buf, 38, 72, C.ink)
}

export function drawStudy(buf: PixelBuffer, study: StudyId | undefined): void {
  if (!study || study === 'none') return
  ITEMS[study](buf)
}
