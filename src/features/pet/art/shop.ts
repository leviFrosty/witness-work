/**
 * The Shop's pixel art (ADR 0035): the gold coin, the category icons, and its
 * frames, drawn to any size like the rest of the pet. The look is a modern
 * Japanese wooden shop in sumi ink: washi paper, hinoki frames, a noren curtain
 * for the sign. Dark mode turns it to ink-black paper with walnut, and what's
 * chosen turns paper white.
 */
import {
  createBuffer,
  rgbPalette,
  type PixelBuffer,
  type Rgb,
} from '@/lib/pixelArt'

/** Paints `c` over (x, y) at opacity `a`. */
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

/** A steady 0–1 hash of (x, y), for paper fibres. */
function noise(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

// --- Palettes ---------------------------------------------------------------

/** One look of the Shop: its paper, wood and words, and the sumi accent. */
export type ShopPalette = {
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
  /** Words and icons. */
  ink: string
  inkAlt: string
  /** What's chosen: the open tab, the picked ring, the button, the sign. */
  accent: Rgb
  accentLight: Rgb
  accentDark: Rgb
  /** Words on the accent. */
  onAccent: string
  /** The "New" tag: its fill, outline and words. */
  newFill: Rgb
  newOutline: Rgb
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
  newFill: '#1b1815',
  newOutline: '#ffffff',
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
  newFill: '#ffffff',
  newOutline: '#000000',
})

/** The Shop's look in light or dark mode. */
export const shopPalette = (dark: boolean): ShopPalette =>
  dark
    ? {
        ...DARK,
        dark,
        ink: '#f1e9da',
        inkAlt: '#9d9283',
        onAccent: '#1b1815',
        newInk: '#1b1815',
      }
    : {
        ...LIGHT,
        dark,
        ink: '#2a2420',
        inkAlt: '#756a5e',
        onAccent: '#fbf8f1',
        newInk: '#ffffff',
      }

/** The colour of a CSS-style hex string, for drawing words' icons. */
const rgbOf = (hex: string): Rgb => parseInt(hex.slice(1), 16)

/** A palette colour as a CSS-style hex string, for views. */
export const cssColor = (c: Rgb): string =>
  `#${c.toString(16).padStart(6, '0')}`

// --- Boxes ------------------------------------------------------------------

/** A ring colour, or [top-left, bottom-right] for a bevel. */
export type Ring = Rgb | readonly [Rgb, Rgb]

/**
 * A box drawn to any size, as a 9-slice frame would be: `rings` from the
 * outside in, then `fill`. `cut` chamfers the corners.
 */
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

/** Washi: paper with a few fibres. */
export const paperFill =
  (p: ShopPalette) =>
  (x: number, y: number): Rgb =>
    noise(x, y, 11) > 0.96 ? p.fiber : p.paper

/** The Shop's paper background, `w` × `h` pixels. */
export function shopPaper(p: ShopPalette, w: number, h: number): PixelBuffer {
  const b = createBuffer(w, h)
  drawBox(b, 0, 0, w, h, [], paperFill(p), -1)
  return b
}

/**
 * The frames the Shop draws behind its parts, by kind:
 *
 * - `card`: an item; `cardPicked` with the accent ring around it. Both leave room
 *   for the ring, so picking one doesn't move anything.
 * - `button`: the accent button; `buttonOff` when it can't be pressed.
 * - `pill`: the wallet.
 * - `preview`: the hinoki frame around the room.
 * - `tab`: the open category, a cloth tab hanging from its rod.
 * - `newTag`: the "New" tag, outlined so it reads over any picture.
 */
export type ShopFrameKind =
  | 'card'
  | 'cardPicked'
  | 'button'
  | 'buttonOff'
  | 'pill'
  | 'preview'
  | 'tab'
  | 'newTag'

/** How far inside its edge each frame's content starts, in pixels. */
export const SHOP_FRAME_INSET: Record<ShopFrameKind, number> = {
  card: 5,
  cardPicked: 5,
  button: 2,
  buttonOff: 2,
  pill: 0,
  preview: 2,
  tab: 0,
  newTag: 1,
}

/** One frame, `w` × `h` pixels, its middle filled unless it's a picture's. */
export function shopFrame(
  p: ShopPalette,
  kind: ShopFrameKind,
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
      drawBox(b, 0, 0, w, h, [p.newOutline], p.newFill, 1)
      break
  }
  return b
}

/**
 * The Shop's sign: a short noren hung from a hinoki rod, slit near its hem. The
 * word goes over it as text, so it's translated.
 */
export function norenSign(p: ShopPalette, w: number, h: number): PixelBuffer {
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

// --- Icons ------------------------------------------------------------------

/** The coin's sizes: large for the wallet's info, small beside a number. */
export type CoinIconSize = 'small' | 'large'
export const COIN_ICON_PX: Record<CoinIconSize, number> = {
  small: 10,
  large: 16,
}

/**
 * A gold coin, placed by hand: a rim lit from the top left, a face inside a
 * darker ring, and a slot down the middle. The small one drops the ring, which
 * crowds 10 pixels.
 */
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

/** A sprite from rows of tone keys (`tones`), `.` clear. */
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

/** The currency's icon: a gold coin. */
export function coinIcon(size: CoinIconSize = 'small'): PixelBuffer {
  let icon = iconCache.get(size)
  if (!icon) {
    icon = toneIcon(COINS[size], COIN_TONES)
    iconCache.set(size, icon)
  }
  return icon
}

/** The Shop's category icons, 12 × 12, one colour. */
export const SHOP_TAB_ICON_PX = 12
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
}
/** Back, pointing left. */
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

/** A Shop category's icon in `color` (`#rrggbb`). */
export const shopTabIcon = (tab: string, color: string): PixelBuffer =>
  maskIcon(TAB_ICONS[tab] ?? TAB_ICONS.hat, color)

/** The back chevron in `color`. */
export const shopBackIcon = (color: string): PixelBuffer =>
  maskIcon(CHEVRON, color)

/** The check beside "Wearing", in `color`. */
export const shopCheckIcon = (color: string): PixelBuffer =>
  maskIcon(CHECK, color)
