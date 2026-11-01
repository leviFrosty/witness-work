import {
  createBuffer,
  rgbPalette,
  type PixelBuffer,
  type Rgb,
} from '@/lib/pixelArt'

function put(b: PixelBuffer, x: number, y: number, c: Rgb, a = 1): void {
  if (x < 0 || y < 0 || x >= b.width || y >= b.height || a <= 0) return
  const i = (y * b.width + x) * 4
  const d = b.data
  const sa = Math.min(1, a)
  const da = d[i + 3] / 255
  const oa = sa + da * (1 - sa)
  const mix = (s: number, t: number) => (s * sa + t * da * (1 - sa)) / oa
  d[i] = mix((c >> 16) & 255, d[i])
  d[i + 1] = mix((c >> 8) & 255, d[i + 1])
  d[i + 2] = mix(c & 255, d[i + 2])
  d[i + 3] = oa * 255
}

function noise(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

export type GamePalette = {
  dark: boolean
  paper: Rgb
  fiber: Rgb
  card: Rgb
  cardEdge: Rgb
  line: Rgb
  wood: Rgb
  woodLight: Rgb
  woodEdge: Rgb
  pill: Rgb

  ink: string
  inkAlt: string

  accent: Rgb
  accentLight: Rgb
  accentDark: Rgb

  onAccent: string

  newFill: Rgb
  newInk: string
}

const LIGHT = rgbPalette({
  paper: '#fbf8f1',
  fiber: '#f4eee2',
  card: '#fffdf8',
  cardEdge: '#dccbad',
  line: '#e8dfcf',
  wood: '#e6cfa6',
  woodLight: '#f3e3c6',
  woodEdge: '#a8845a',
  pill: '#f1e9da',
  accent: '#3b3632',
  accentLight: '#5a524c',
  accentDark: '#211d1a',
  newFill: '#d30808',
})
const DARK = rgbPalette({
  paper: '#171513',
  fiber: '#1b1916',
  card: '#221f1b',
  cardEdge: '#3a342d',
  line: '#2d2924',
  wood: '#6b5236',
  woodLight: '#86674a',
  woodEdge: '#33271a',
  pill: '#28241f',
  accent: '#ebe2d2',
  accentLight: '#fbf6ec',
  accentDark: '#b9ad9a',
  newFill: '#e5383b',
})

export const gamePalette = (dark: boolean): GamePalette =>
  dark
    ? {
        ...DARK,
        dark,
        ink: '#f1e9da',
        inkAlt: '#9d9283',
        onAccent: '#1b1815',
        newInk: '#ffffff',
      }
    : {
        ...LIGHT,
        dark,
        ink: '#2a2420',
        inkAlt: '#756a5e',
        onAccent: '#fbf8f1',
        newInk: '#ffffff',
      }

const rgbOf = (hex: string): Rgb => parseInt(hex.slice(1), 16)

export const cssColor = (c: Rgb): string =>
  `#${c.toString(16).padStart(6, '0')}`

export type Ring = Rgb | readonly [Rgb, Rgb]

export function drawBox(
  b: PixelBuffer,
  x0: number,
  y0: number,
  w: number,
  h: number,
  rings: readonly Ring[],
  fill: Rgb | ((x: number, y: number) => Rgb) | null,
  cut = 1
): void {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = Math.min(x, w - 1 - x)
      const dy = Math.min(y, h - 1 - y)
      const r = Math.min(dx, dy, dx + dy - cut)
      if (r < 0) continue
      if (r < rings.length) {
        const ring = rings[r]
        let c: Rgb
        if (typeof ring === 'number') c = ring
        else {
          const onTopOrBottom = dy === r || dx + dy - cut === r
          c = (onTopOrBottom ? y < h / 2 : x < w / 2) ? ring[0] : ring[1]
        }
        put(b, x0 + x, y0 + y, c)
      } else if (fill !== null)
        put(
          b,
          x0 + x,
          y0 + y,
          typeof fill === 'function' ? fill(x0 + x, y0 + y) : fill
        )
    }
}

export const paperFill =
  (p: GamePalette) =>
  (x: number, y: number): Rgb =>
    noise(x, y, 11) > 0.96 ? p.fiber : p.paper

export function gamePaper(p: GamePalette, w: number, h: number): PixelBuffer {
  const b = createBuffer(w, h)
  drawBox(b, 0, 0, w, h, [], paperFill(p), -1)
  return b
}

export type GameFrameKind =
  | 'card'
  | 'cardPicked'
  | 'button'
  | 'buttonOff'
  | 'buttonSoft'
  | 'pill'
  | 'preview'
  | 'tab'
  | 'newTag'
  | 'panel'
  | 'plaque'
  | 'field'
  | 'fieldFocused'
  | 'toggleOn'
  | 'toggleOff'
  | 'knob'

export const GAME_FRAME_INSET: Record<GameFrameKind, number> = {
  card: 5,
  cardPicked: 5,
  button: 2,
  buttonOff: 2,
  buttonSoft: 2,
  pill: 0,
  preview: 2,
  tab: 0,
  newTag: 0,
  panel: 1,
  plaque: 2,
  field: 2,
  fieldFocused: 2,
  toggleOn: 1,
  toggleOff: 1,
  knob: 1,
}

export function gameFrame(
  p: GamePalette,
  kind: GameFrameKind,
  w: number,
  h: number
): PixelBuffer {
  const b = createBuffer(Math.max(1, w), Math.max(1, h))
  switch (kind) {
    case 'card':
      drawBox(b, 2, 2, w - 4, h - 4, [p.cardEdge], p.card, 1)
      break
    case 'cardPicked':
      drawBox(b, 0, 0, w, h, [p.accent, p.accent], null, 2)
      drawBox(b, 2, 2, w - 4, h - 4, [p.cardEdge], p.card, 1)
      break
    case 'button':
      drawBox(
        b,
        0,
        0,
        w,
        h,
        [p.accentDark, [p.accentLight, p.accent]],
        p.accent,
        2
      )
      break
    case 'buttonOff':
      drawBox(b, 0, 0, w, h, [p.cardEdge], p.pill, 2)
      break
    case 'buttonSoft':
      drawBox(b, 0, 0, w, h, [p.cardEdge, [p.card, p.pill]], p.pill, 2)
      break
    case 'pill':
      drawBox(b, 0, 0, w, h, [], p.pill, 2)
      break
    case 'preview':
      drawBox(b, 0, 0, w, h, [p.woodEdge, [p.woodLight, p.wood]], null, 1)
      break
    case 'tab':
      drawBox(
        b,
        0,
        0,
        w,
        h,
        [p.accentDark],
        (_, y) => (y <= 2 ? p.accentDark : p.accent),
        0
      )
      break
    case 'newTag':
      drawBox(b, 0, 0, w, h, [], p.newFill, 1)
      break
    case 'panel':
      drawBox(b, 0, 0, w, h, [p.cardEdge], p.card, 1)
      break
    case 'plaque':
      drawBox(
        b,
        0,
        0,
        w,
        h,
        [p.woodEdge, [p.woodLight, p.wood]],
        (_, y) => (y === h - 3 ? p.woodEdge : p.wood),
        1
      )
      break
    case 'field':
      drawBox(b, 0, 0, w, h, [p.cardEdge, p.card], p.card, 1)
      break
    case 'fieldFocused':
      drawBox(b, 0, 0, w, h, [p.accent, p.accent], p.card, 1)
      break
    case 'toggleOn':
      drawBox(b, 0, 0, w, h, [p.accentDark], p.accent, 2)
      break
    case 'toggleOff':
      drawBox(b, 0, 0, w, h, [p.cardEdge], p.pill, 2)
      break
    case 'knob':
      drawBox(b, 0, 0, w, h, [p.cardEdge, [p.card, p.pill]], p.card, 1)
      break
  }
  return b
}

export function norenSign(p: GamePalette, w: number, h: number): PixelBuffer {
  const b = createBuffer(w, h)
  for (let x = 0; x < w; x++) {
    put(b, x, 0, p.wood)
    put(b, x, 1, p.woodEdge)
  }
  const cloth = { x: 4, w: w - 8 }
  const slits = [
    cloth.x + Math.round(cloth.w / 3),
    cloth.x + Math.round((cloth.w * 2) / 3),
  ]
  for (let y = 2; y < h; y++)
    for (let x = cloth.x; x < cloth.x + cloth.w; x++) {
      if (slits.includes(x) && y >= h - 4) continue
      put(b, x, y, y <= 4 || y === h - 1 ? p.accentDark : p.accent)
    }
  return b
}

export type CoinIconSize = 'small' | 'large'
export const COIN_ICON_PX: Record<CoinIconSize, number> = {
  small: 10,
  large: 16,
}

const COINS: Record<CoinIconSize, readonly string[]> = {
  large: [
    '.....oooooo.....',
    '...oolllllloo...',
    '..olllllllyyyo..',
    '.ollllddddyyyyo.',
    '.ollddwfffddyyo.',
    'ollldwfffffdyyso',
    'olldfflddfffdsso',
    'olldfflddfffdsso',
    'olldfflddfffdsso',
    'olldfflddfffdsso',
    'olyydffffffdssso',
    '.oyyddffffddsso.',
    '.oyyyyddddsssso.',
    '..oyyyssssssso..',
    '...oossssssoo...',
    '.....oooooo.....',
  ],
  small: [
    '...oooo...',
    '.oollyyoo.',
    '.olwfffyo.',
    'olfffdffso',
    'olffldffso',
    'olffldffso',
    'oyfffdffso',
    '.oyfffsso.',
    '.oossssoo.',
    '...oooo...',
  ],
}
const COIN_TONES: Record<string, string> = {
  o: '#6b3f0a',
  y: '#f5c542',
  l: '#fde68a',
  w: '#fffbea',
  f: '#eab52c',
  s: '#c98a12',
  d: '#b9770b',
}

function toneIcon(
  rows: readonly string[],
  tones: Readonly<Record<string, string>>
): PixelBuffer {
  const b = createBuffer(rows[0].length, rows.length)
  rows.forEach((row, y) =>
    [...row].forEach((cell, x) => {
      const tone = tones[cell]
      if (tone) put(b, x, y, rgbOf(tone))
    })
  )
  return b
}

const iconCache = new Map<string, PixelBuffer>()

export function coinIcon(size: CoinIconSize = 'small'): PixelBuffer {
  let icon = iconCache.get(size)
  if (!icon) {
    icon = toneIcon(COINS[size], COIN_TONES)
    iconCache.set(size, icon)
  }
  return icon
}

export const GAME_TAB_ICON_PX = 12
const TAB_ICONS: Record<string, readonly string[]> = {
  hat: [
    '............',
    '............',
    '....####....',
    '...######...',
    '...######...',
    '...######...',
    '............',
    '.##########.',
    '############',
    '............',
    '............',
    '............',
  ],
  wall: [
    '............',
    '.#########..',
    '.#########.#',
    '.#########.#',
    '...........#',
    '......######',
    '......#.....',
    '......#.....',
    '.....###....',
    '.....###....',
    '.....###....',
    '............',
  ],
  floor: [
    '............',
    '............',
    '#####.######',
    '#####.######',
    '............',
    '##.#########',
    '##.#########',
    '............',
    '########.###',
    '########.###',
    '............',
    '............',
  ],
  bed: [
    '............',
    '............',
    '............',
    '............',
    '.#........#.',
    '##.######.##',
    '##.######.##',
    '############',
    '############',
    '.##########.',
    '............',
    '............',
  ],
  shelf: [
    '............',
    '.##.........',
    '.##.##......',
    '.##.##.#....',
    '.##.##.##...',
    '.##.##..##..',
    '.##.##..##..',
    '.##.##...##.',
    '############',
    '.#........#.',
    '.#........#.',
    '............',
  ],
  lamp: [
    '............',
    '....####....',
    '...######...',
    '...######...',
    '..########..',
    '.....##.....',
    '.....##.....',
    '.....##.....',
    '.....##.....',
    '...######...',
    '............',
    '............',
  ],
  sign: [
    '.....##.....',
    '....#..#....',
    '...#....#...',
    '.##########.',
    '.#........#.',
    '.#.##..##.#.',
    '.#........#.',
    '.#.######.#.',
    '.#........#.',
    '.##########.',
    '............',
    '............',
  ],
  window: [
    '............',
    '.##########.',
    '.#...##...#.',
    '.#...##...#.',
    '.#...##...#.',
    '.##########.',
    '.#...##...#.',
    '.#...##...#.',
    '.#...##...#.',
    '.##########.',
    '############',
    '............',
  ],
}

const CHEVRON = [
  '....##',
  '...##.',
  '..##..',
  '.##...',
  '##....',
  '.##...',
  '..##..',
  '...##.',
  '....##',
]
const CHECK = ['......#', '.....##', '#...##.', '##.##..', '.###...', '..#....']

function maskIcon(rows: readonly string[], color: string): PixelBuffer {
  const b = createBuffer(rows[0].length, rows.length)
  const c = rgbOf(color)
  rows.forEach((row, y) =>
    [...row].forEach((cell, x) => cell === '#' && put(b, x, y, c))
  )
  return b
}

export const GAME_ICON_PX = 10
const BUTTON_ICONS = {
  settings: [
    '....##....',
    '.##.##.##.',
    '.########.',
    '..######..',
    '####..####',
    '####..####',
    '..######..',
    '.########.',
    '.##.##.##.',
    '....##....',
  ],
  share: [
    '....##....',
    '...####...',
    '..######..',
    '....##....',
    '....##....',
    '##..##..##',
    '##......##',
    '##......##',
    '##########',
    '##########',
  ],
  close: [
    '##......##',
    '###....###',
    '.###..###.',
    '..######..',
    '...####...',
    '...####...',
    '..######..',
    '.###..###.',
    '###....###',
    '##......##',
  ],
  shop: [
    '.########.',
    '##########',
    '#.##..##.#',
    '.#..##..#.',
    '..........',
    '.#......#.',
    '.#.##...#.',
    '.#.##...#.',
    '.#.##...#.',
    '##########',
  ],
  play: [
    '..#.......',
    '..##......',
    '..###.....',
    '..####....',
    '..#####...',
    '..#####...',
    '..####....',
    '..###.....',
    '..##......',
    '..#.......',
  ],
} as const satisfies Record<string, readonly string[]>
export type GameIconName =
  | keyof typeof BUTTON_ICONS
  | 'back'
  | 'forward'
  | 'check'

export const gameTabIcon = (tab: string, color: string): PixelBuffer =>
  maskIcon(TAB_ICONS[tab] ?? TAB_ICONS.hat, color)

export function gameIcon(name: GameIconName, color: string): PixelBuffer {
  switch (name) {
    case 'back':
      return maskIcon(CHEVRON, color)
    case 'forward':
      return maskIcon(
        CHEVRON.map((row) => [...row].reverse().join('')),
        color
      )
    case 'check':
      return maskIcon(CHECK, color)
    default:
      return maskIcon(BUTTON_ICONS[name], color)
  }
}

export const gameCheckIcon = (color: string): PixelBuffer =>
  maskIcon(CHECK, color)

export const OWNED_STAMP_PX = 22

const OWNED_STAMP = [
  '........oooooo........',
  '......ooffffffoo......',
  '....ooffffffffffoo....',
  '...offffffffffffffo...',
  '..offffffffffffffffo..',
  '..offffffffffffffffo..',
  '.offffffffffffffffffo.',
  '.offfffffffffffcccffo.',
  'offfffffffffffcccffffo',
  'offffffffffffcccfffffo',
  'offfcccfffffcccffffffo',
  'offffcccfffcccfffffffo',
  'offfffcccfcccffffffffo',
  'offffffcccccfffffffffo',
  '.offffffcccfffffffffo.',
  '.offfffffcffffffffffo.',
  '..offffffffffffffffo..',
  '..offffffffffffffffo..',
  '...offffffffffffffo...',
  '....ooffffffffffoo....',
  '......ooffffffoo......',
  '........oooooo........',
]

export const ownedStamp = (p: GamePalette): PixelBuffer =>
  toneIcon(OWNED_STAMP, {
    o: cssColor(p.accentDark),
    f: cssColor(p.accent),
    c: p.onAccent,
  })
