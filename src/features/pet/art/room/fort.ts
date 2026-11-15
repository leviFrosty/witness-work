import {
  dim,
  mix,
  rgb,
  rgbPalette,
  type PixelBuffer,
  type Rgb,
  type StampPattern,
} from '@/lib/pixelArt'

const C = rgbPalette({
  quilt: '#6a8fb3',
  quiltLight: '#8fb0cf',
  quiltDark: '#4f7399',
  quiltDeep: '#3d5a7a',
  roofCap: '#7fa2c4',
  cream: '#ecd9a8',
  rose: '#c9685c',
  trim: '#f4e6bf',
  lining: '#c9dcec',
  liningShade: '#a3bcd3',
  tie: '#b5524a',
  wallGlow: '#e2a653',
  wallMid: '#b9773a',
  wallDeep: '#85502a',
  mat: '#4f7a72',
  matDark: '#3a5f58',
  matLine: '#8fb5a6',
  wood: '#5e3b22',
  woodLight: '#8a5a35',
  peg: '#d9b77a',
  pegDark: '#a98850',
  fur: '#fbf4e4',
  furShade: '#d9c8a6',
  ear: '#eda5a0',
  eye: '#3a2a20',
  nose: '#e07f84',
  cover: '#4a4f5c',
  paper: '#f2e8d0',
  paperShade: '#b9ab8a',
  cushion: '#c9685c',
  cushionLight: '#dd8a7c',
  cushionDark: '#a14e45',
  mustard: '#d4a640',
  mustardDark: '#a97f2c',
  brass: '#6e4a2a',
  flame: '#fff2c2',
  bookRed: '#8c3b32',
  bookGold: '#c79a3a',
  bookTeal: '#3f7f7a',
  wire: '#3d5a7a',
})

export type FortPut = (x: number, y: number, c: Rgb) => void

const LEFT = 22
const RIGHT = 61
const MID = (LEFT + RIGHT) / 2
const HALF = (RIGHT - LEFT) / 2
const APEX_Y = 49
const EAVE_Y = 62
const FLOOR_Y = 76
const DOOR_Y = EAVE_Y + 1
const DOOR_HALF = 12

const DEPTH = 4
const BACK_EAVE_Y = EAVE_Y - DEPTH
const BACK_FLOOR_Y = FLOOR_Y - DEPTH

export const FORT_BOX = {
  x0: LEFT - 3,
  y0: APEX_Y - 2,
  x1: RIGHT + 1,
  y1: FLOOR_Y + 5,
} as const

export const FORT_LANTERN: readonly [number, number] = [LEFT + 27, FLOOR_Y - 3]

export const FORT_DOORSTEP: readonly [number, number] = [MID, FLOOR_Y + 2]

const slope = (x: number, eaveY: number): number =>
  Math.round(
    APEX_Y + (eaveY - APEX_Y) * Math.pow(Math.abs(x - MID) / HALF, 0.85)
  )

const roofTop = (x: number): number => slope(x, BACK_EAVE_Y)

const roofRidge = (x: number): number => slope(x, EAVE_Y)

const doorHalf = (y: number, door: number): number =>
  y < DOOR_Y ? -1 : Math.min(DOOR_HALF + door, 3 + (y - DOOR_Y) * 1.05 + door)

export const inFortDoor = (x: number, y: number, door: number): boolean =>
  Math.abs(x - MID) < doorHalf(y, door)

export const inFort = (x: number, y: number): boolean =>
  x >= LEFT && x <= RIGHT && y >= roofTop(x) && y <= FLOOR_Y

const PATCH = 5
const ACCENTS: Readonly<Record<number, Rgb>> = {
  2: C.cream,
  5: C.rose,
  9: C.rose,
  14: C.cream,
  17: C.cream,
  30: C.rose,
}

function patch(col: number, row: number): Rgb {
  const accent = ACCENTS[col + row * 8]
  if (accent !== undefined) return accent
  return (col + row) % 2 === 0 ? C.quilt : C.quiltDark
}

function roofPatch(x: number, y: number): Rgb {
  const t = (y - APEX_Y) / (EAVE_Y - APEX_Y)
  const s = (x - MID) / (HALF * Math.max(t, 0.05))
  const cols = (RIGHT - LEFT + 1) / PATCH
  const col = Math.max(0, Math.min(cols - 1, Math.floor(((s + 1) / 2) * cols)))
  if (t < 0.36) return C.roofCap
  return mix(patch(col, t < 0.7 ? 0 : 1), C.quiltLight, 0.22)
}

const drapePatch = (x: number, y: number): Rgb =>
  patch(Math.floor((x - LEFT) / PATCH), 2 + Math.floor((y - DOOR_Y) / PATCH))

const isLeg = (x: number): boolean => x <= LEFT + 1 || x >= RIGHT - 1

function paintShell(put: FortPut, door: number): void {
  for (let x = LEFT; x <= RIGHT; x++) {
    const top = roofTop(x)
    const ridge = roofRidge(x)
    for (let y = top; y <= FLOOR_Y; y++) {
      if (inFortDoor(x, y, door)) continue
      const reach = Math.abs(x - MID) - doorHalf(y, door)
      let c: Rgb
      if (y < ridge) c = x < MID ? C.quiltLight : C.quiltDeep
      else if (y < EAVE_Y) c = roofPatch(x, y)
      else if (y === EAVE_Y) c = C.trim
      else if (reach < (y >= DOOR_Y + 6 ? 2 : 1))
        c = reach >= 1 ? C.liningShade : C.lining
      else if (isLeg(x) && y >= FLOOR_Y - 3)
        c = x === LEFT || x === RIGHT - 1 ? C.woodLight : C.wood
      else if (y === FLOOR_Y && ((x >> 1) & 1) === 1) continue
      else if (y === FLOOR_Y || (isLeg(x) && y === FLOOR_Y - 4)) c = C.quiltDeep
      else c = drapePatch(x, y)
      put(x, y, c)
    }
  }
  for (const side of [-1, 1]) {
    const x = Math.round(MID + side * (doorHalf(DOOR_Y + 7, door) + 1.5))
    put(x, DOOR_Y + 7, C.tie)
    put(x, DOOR_Y + 8, C.tie)
  }
  for (let y = APEX_Y - 1; y <= APEX_Y + 1; y++) {
    put(Math.floor(MID), y, C.peg)
    put(Math.ceil(MID), y, C.pegDark)
  }
}

const BOOK_STACK: readonly (readonly [number, number, Rgb])[] = [
  [LEFT - 3, LEFT + 2, C.bookTeal],
  [LEFT - 2, LEFT + 3, C.bookGold],
  [LEFT - 3, LEFT + 3, C.bookRed],
]

function paintBookStack(put: FortPut): void {
  BOOK_STACK.forEach(([x0, x1, cover], i) => {
    const y = FLOOR_Y - 5 + i * 2
    for (let x = x0; x <= x1; x++) {
      put(x, y, cover)
      put(x, y + 1, x === x1 ? C.paper : dim(cover, 0.78))
    }
  })
}

const STAMP_COLORS: Readonly<Record<string, Rgb>> = {
  w: C.fur,
  s: C.furShade,
  i: C.ear,
  e: C.eye,
  n: C.nose,
  c: C.cover,
  P: C.paper,
  p: C.paperShade,
  g: C.cushion,
  G: C.cushionLight,
  d: C.cushionDark,
  m: C.mustard,
  M: C.mustardDark,
  b: C.brass,
  Y: C.flame,
}

function stampOn(
  put: FortPut,
  pattern: StampPattern,
  x: number,
  y: number
): void {
  for (let j = 0; j < pattern.length; j++) {
    const row = pattern[j]
    for (let i = 0; i < row.length; i++) {
      const c = STAMP_COLORS[row[i]]
      if (c !== undefined) put(x + i, y + j, c)
    }
  }
}

const CUSHIONS: StampPattern = [
  '.mmmm.',
  'mmmmmM',
  'MMMMMM',
  'gGGGGg',
  'gggggd',
  'dddddd',
]
const LANTERN: StampPattern = ['.b.', 'bbb', 'bYb', 'bYb', 'bbb']

export type BunnyLook = 'read' | 'peek' | 'sit' | 'joy'

export interface FortBunny {
  readonly x: number
  readonly y: number
  readonly hop: number
  readonly look: BunnyLook
  readonly blink: boolean
  readonly ear: boolean
  readonly page: boolean
}

export interface FortPose {
  readonly door: number
  readonly bunny: FortBunny
  readonly lit: number
}

export const FORT_BUNNY_HOME: readonly [number, number] = [
  LEFT + 16,
  FLOOR_Y - 1,
]

export const FORT_REST: FortPose = {
  door: 0,
  bunny: {
    x: FORT_BUNNY_HOME[0],
    y: FORT_BUNNY_HOME[1],
    hop: 0,
    look: 'read',
    blink: false,
    ear: false,
    page: false,
  },
  lit: 0,
}

const EARS: Readonly<Record<'up' | 'twitch' | 'joy', StampPattern>> = {
  up: ['.ww..ww.', '.wi..iw.', '.wi..iw.', '.ww..ww.'],
  twitch: ['.ww.....', '.wi..www', '.wi..iw.', '.ww..ww.'],
  joy: ['ww....ww', 'wi....iw', '.wi..iw.', '.ww..ww.'],
}

const HEADS: Readonly<Record<'open' | 'shut' | 'side', StampPattern>> = {
  open: ['wwwwwwww', 'wewwwwew', 'wwwnnwww', '.wwwwww.'],
  shut: ['wwwwwwww', 'wswwwwsw', 'wwwnnwww', '.wwwwww.'],
  side: ['wwwwwwww', 'wwewwwwe', 'wwwwnnww', '.wwwwww.'],
}

const BODIES: Readonly<Record<'read' | 'page' | 'sit' | 'joy', StampPattern>> =
  {
    read: ['wPPPpPPw', 'cPPPpPPc', '.cccccc.', '.sw..ws.'],
    page: ['wPPpPPPw', 'cPPpPPPc', '.cccccc.', '.sw..ws.'],
    sit: ['.wwwwww.', 'wwwwwwww', 'wwwwwwww', 'sww..wws'],
    joy: ['w.wwww.w', '.wwwwww.', '.wwwwww.', '.sw..ws.'],
  }

const BUNNY_HEIGHT = 12

function paintBunny(put: FortPut, bunny: FortBunny): void {
  const { look, x } = bunny
  const top = bunny.y - bunny.hop - BUNNY_HEIGHT + 1
  const reading = look === 'read' || look === 'peek'
  stampOn(
    put,
    EARS[look === 'joy' ? 'joy' : bunny.ear ? 'twitch' : 'up'],
    x,
    top
  )
  stampOn(
    put,
    HEADS[bunny.blink ? 'shut' : look === 'peek' ? 'side' : 'open'],
    x,
    top + 4
  )
  stampOn(
    put,
    BODIES[reading ? (bunny.page ? 'page' : 'read') : look],
    x,
    top + 8
  )
}

const isHome = (bunny: FortBunny): boolean => bunny.y <= FLOOR_Y

export function paintFortInside(put: FortPut, pose: FortPose): void {
  const { door, bunny } = pose
  const [lx, ly] = FORT_LANTERN
  for (let y = DOOR_Y; y <= FLOOR_Y; y++) {
    for (let x = LEFT; x <= RIGHT; x++) {
      if (!inFortDoor(x, y, door)) continue
      if (y >= BACK_FLOOR_Y) {
        let c = C.mat
        if (x % 4 === 0 || y % 3 === 0) c = C.matDark
        if (x % 4 === 0 && y % 3 === 0) c = C.matLine
        put(x, y, y === BACK_FLOOR_Y ? dim(c, 0.8) : c)
        continue
      }
      const d = Math.hypot(x - lx, (y - ly) * 1.1)
      put(x, y, d < 5 ? C.wallGlow : d < 10.5 ? C.wallMid : C.wallDeep)
    }
  }
  const inside: FortPut = (x, y, c) => {
    if (inFortDoor(x, y, door)) put(x, y, c)
  }
  stampOn(inside, CUSHIONS, LEFT + 9, FLOOR_Y - 6)
  stampOn(inside, LANTERN, lx - 1, ly - 3)
  if (isHome(bunny)) paintBunny(inside, bunny)
}

export const FORT_BULB_COLORS: readonly Rgb[] = [
  '#ffd34a',
  '#ff8f6b',
  '#7fd6c2',
  '#fff2c2',
].map(rgb)

export const fortBulbColor = (i: number): Rgb =>
  FORT_BULB_COLORS[i % FORT_BULB_COLORS.length]

export const FORT_BULBS: readonly (readonly [number, number])[] = [
  -0.94, -0.72, -0.5, -0.28, 0.28, 0.5, 0.72, 0.94,
].map((t) => {
  const x = Math.round(MID + t * HALF)
  return [x, roofRidge(x) + 1] as const
})

function paintLights(put: FortPut, lit: number): void {
  for (let x = LEFT; x <= RIGHT; x++) put(x, roofRidge(x), C.wire)
  FORT_BULBS.forEach(([x, y], i) => {
    const c = fortBulbColor(i)
    const on = (lit & (1 << i)) !== 0
    put(x, y, on ? mix(c, C.flame, 0.6) : mix(c, C.wire, 0.25))
    put(x, y + 1, on ? c : mix(c, C.wire, 0.1))
  })
}

export function paintFortBunnyOut(put: FortPut, pose: FortPose): void {
  if (!isHome(pose.bunny)) paintBunny(put, pose.bunny)
}

export function paintFort(put: FortPut, pose: FortPose = FORT_REST): void {
  paintShell(put, pose.door)
  paintBookStack(put)
  paintLights(put, pose.lit)
  paintFortInside(put, pose)
  paintFortBunnyOut(put, pose)
}

export function fortShadow(buf: PixelBuffer): void {
  const cx = MID + 0.5
  const rx = HALF + 4
  const cy = FLOOR_Y
  const d = buf.data
  for (let y = cy - 2; y <= cy + 2; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const a = (x + 0.5 - cx) / rx
      const b = (y + 0.5 - cy) / 2.4
      if (a * a + b * b > 1) continue
      const k = (y * buf.width + x) * 4
      d[k] *= 0.82
      d[k + 1] *= 0.82
      d[k + 2] *= 0.82
    }
  }
}
