import {
  blit,
  cloneBuffer,
  createLru,
  flipH,
  rasterize,
  rgb,
  rgbPalette,
  setPixel,
  type PixelBuffer,
  type ShapeSpec,
} from '@/lib/pixelArt'
import { PET_SPECIES_IDS, type BigHatId, type Season } from '@/types/pet'

import { isDarkTime, SHOW_MS, showStrength } from './fx'
import {
  BIG_HAT_BRIM_ROW,
  BIG_HAT_CX,
  BIG_HAT_H,
  BIG_HAT_W,
  bigHatCanvas,
  bigHatPoint,
} from './hatCanvas'
import {
  FIG_STAGES,
  HAT_FRAME_SPECS,
  NEST_CHICK_U,
  RIDE,
  TRACK,
  type ChickFace,
} from './hatFrames'
import { PLAIN_HAT_SPECS, type PlainHatId } from './hatsPlain'
import type { TimeOfDay } from './room/window'
import { idlePose, petSprite } from './sprite'
import type { PetSpeciesId } from './types'

export interface HatLife {
  readonly growth?: number

  readonly wentOut?: boolean
}

export interface HatMoment {
  readonly tMs: number
  readonly species: PetSpeciesId
  readonly coat: string
  readonly season: Season
  readonly time: TimeOfDay
  readonly growth: number
  readonly wentOut: boolean
  readonly patMs: number
  readonly patRunMs?: number
  readonly coinsMs: number
  readonly growMs?: number
  readonly clockMs: number | null
}

export const FULL_GROWTH = FIG_STAGES - 1

export { isDarkTime, SHOW_MS }

const NOT_YET = -Infinity

const HOP = [0, 2, 4, 4, 3, 1, 0] as const

const HOP_STEP_MS = 80

export const hatHop = (sincePat: number): number =>
  sincePat >= 0 && sincePat < HOP.length * HOP_STEP_MS
    ? HOP[Math.floor(sincePat / HOP_STEP_MS)]
    : 0

const isStaticHat = (hat: BigHatId): hat is PlainHatId =>
  Object.hasOwn(PLAIN_HAT_SPECS, hat)

export function hatRoomDim(hat: BigHatId, m: HatMoment): number {
  if (hat !== 'dome' && hat !== 'carousel') return 0
  return showStrength(m)
}

const frames = createLru<PixelBuffer>(128)

function frameOf(key: string): PixelBuffer {
  return frames.getOrCreate(key, () =>
    rasterize(HAT_FRAME_SPECS[key] as ShapeSpec, BIG_HAT_W, BIG_HAT_H)
  )
}

function flippedFrameOf(key: string): PixelBuffer {
  return frames.getOrCreate(`${key}|flip`, () => flipH(frameOf(key)))
}

const INK = rgbPalette({
  dark: '#26221e',
  wing: '#d7e2ff',
  bubble: '#ffffff',
  fishA: '#f47a24',
  fishB: '#cf5a12',
  fishC: '#fff2d8',
  fishD: '#e0464f',
  bee: '#f1b92e',
  hand: '#2d2a32',
  bird: '#6b4a33',
  breast: '#e0703a',
  beak: '#e0a43a',
  string: '#8b7f6a',
  brass: '#6d4526',
  tube: '#56617a',
  tubeDark: '#3a4359',
  lens: '#d7ecff',
  glass: '#8fc4f2',
  lensLit: '#fff7d6',
  glassLit: '#ffd45c',
})

const put = (buf: PixelBuffer, d: number, u: number, c: number) => {
  const [x, y] = bigHatPoint(d, u)
  setPixel(buf, x, y, c)
}

const CAR_COLOR: Readonly<Record<string, number>> = rgbPalette({
  r: '#d8453c',
  R: '#a8322e',
  c: '#ffe9a6',
  g: '#f6d55c',
  s: '#f1b92e',
  k: '#26221e',
  o: '#3a332c',
  y: '#f6d55c',
  Y: '#c98a16',
})

const CARS = {
  loco: [
    '.......kk..',
    'kkkkk..kk..',
    'rccr.g.kk..',
    'rccrrrrrrk.',
    'rrrrRRRRRk.',
    'sssssssssss',
    '.oo..oo.oo.',
    '.oo..oo.oo.',
  ],
  coal: [
    '.......',
    '.......',
    '.kkkkk.',
    'rrrrrrr',
    'RRRRRRR',
    'sssssss',
    '.oo.oo.',
    '.oo.oo.',
  ],
  wagon: [
    '.......',
    '.......',
    '.......',
    'rrrrrrr',
    'RRRRRRR',
    'sssssss',
    '.oo.oo.',
    '.oo.oo.',
  ],
  heaped: [
    '.......',
    '..yyy..',
    '.yyYyy.',
    'rrrrrrr',
    'RRRRRRR',
    'sssssss',
    '.oo.oo.',
    '.oo.oo.',
  ],
  locoEnd: ['.kk.', 'kkkk', 'rccr', 'rkkr', 'rkkr', 'ssss', 'o..o', 'o..o'],
  coalEnd: ['....', '....', '.kk.', 'rrrr', 'RRRR', 'ssss', 'o..o', 'o..o'],
  wagonEnd: ['....', '....', '....', 'rrrr', 'RRRR', 'ssss', 'o..o', 'o..o'],
  heapedEnd: ['....', '.yy.', 'yYyy', 'rrrr', 'RRRR', 'ssss', 'o..o', 'o..o'],
} as const

function drawCar(
  buf: PixelBuffer,
  map: readonly string[],
  x: number,
  y: number,
  flip: boolean
) {
  map.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[flip ? row.length - 1 - i : i]
      if (ch !== '.')
        setPixel(
          buf,
          x - Math.floor(row.length / 2) + i,
          y - map.length + 1 + j,
          CAR_COLOR[ch]
        )
    }
  })
}

const TRAIN_LAP_MS = 2000

const TRAIN_START = Math.PI / 2 + 0.75

export function trainAngle(tMs: number, patMs: number): number {
  const since = tMs - patMs
  const lap =
    since >= 0 && since < TRAIN_LAP_MS
      ? (since / TRAIN_LAP_MS) * 2 * Math.PI
      : 0
  return TRAIN_START + tMs * 0.0011 + lap
}

export function trainSpot(at: number): {
  readonly d: number
  readonly u: number
  readonly near: number
} {
  const near = Math.sin(at)
  return { d: TRACK.rx * Math.cos(at), u: TRACK.u - TRACK.ry * near, near }
}

function drawTrain(buf: PixelBuffer, m: HatMoment) {
  blit(buf, frameOf('train/bed'), 0, 0)
  const angle = trainAngle(m.tMs, m.patMs)
  const heaped = m.tMs === 0 || m.tMs - m.coinsMs < 20_000
  const cars = [
    { side: CARS.loco, end: CARS.locoEnd, at: angle },
    { side: CARS.coal, end: CARS.coalEnd, at: angle - 0.92 },
    {
      side: heaped ? CARS.heaped : CARS.wagon,
      end: heaped ? CARS.heapedEnd : CARS.wagonEnd,
      at: angle - 1.62,
    },
  ].map((car) => ({ ...car, ...trainSpot(car.at) }))
  const place = (car: (typeof cars)[number]) => {
    const turning = Math.abs(car.near) < 0.3
    const [x, y] = bigHatPoint(car.d, car.u)
    drawCar(
      buf,
      turning ? car.end : car.side,
      Math.round(x),
      Math.round(y),
      !turning && car.near > 0
    )
  }
  cars
    .filter((car) => car.near <= 0)
    .sort((a, b) => a.near - b.near)
    .forEach(place)
  blit(buf, frameOf('train/hill'), 0, 0)
  cars
    .filter((car) => car.near > 0)
    .sort((a, b) => a.near - b.near)
    .forEach(place)
}

function drawFish(
  buf: PixelBuffer,
  d: number,
  u: number,
  left: boolean,
  body: number,
  fin: number
) {
  const [x, y] = bigHatPoint(d, u)
  for (let i = 0; i < 3; i++) {
    setPixel(buf, x + i, y, body)
    setPixel(buf, x + i, y + 1, body)
  }
  const tail = left ? x + 3 : x - 1
  setPixel(buf, tail, y, fin)
  setPixel(buf, tail, y + 1, fin)
  setPixel(buf, left ? x : x + 2, y, INK.dark)
}

export const FISH_JUMP_MS = 1400

function drawBowl(buf: PixelBuffer, m: HatMoment) {
  const t = m.tMs
  const sincePat = t - m.patMs
  const jump = t - m.coinsMs
  const landed = jump - FISH_JUMP_MS
  const slosh =
    (sincePat >= 0 && sincePat < 1200) || (landed >= 0 && landed < 800)
      ? 1 + (Math.floor(t / 200) % 2)
      : 0
  blit(buf, frameOf(`bowl/${slosh}`), 0, 0)
  const speed = sincePat >= 0 && sincePat < 1000 ? 0.006 : 0.0014
  if (jump >= 0 && jump < FISH_JUMP_MS) {
    const p = jump / FISH_JUMP_MS
    drawFish(
      buf,
      -3 + p * 7,
      15 + Math.sin(p * Math.PI) * 14,
      false,
      INK.fishA,
      INK.fishB
    )
  } else
    drawFish(
      buf,
      6 * Math.sin(t * speed) - 1,
      9.5 + Math.sin(t * 0.0023) * 2,
      Math.cos(t * speed) < 0,
      INK.fishA,
      INK.fishB
    )
  drawFish(
    buf,
    5 * Math.sin(t * speed * 0.72 + 2) - 1,
    6.5 + Math.sin(t * 0.0017 + 1) * 1.5,
    Math.cos(t * speed * 0.72 + 2) < 0,
    INK.fishC,
    INK.fishD
  )
  for (let i = 0; i < 3; i++) {
    const rise = (t * 0.0006 + i * 0.37) % 1
    put(buf, -4 + i * 4 + Math.sin(t * 0.004 + i), 4 + rise * 10.5, INK.bubble)
  }
}

const FROG_CYCLE_MS = 9000

const FROG_SNATCH_AT_MS = 7600

const TONGUE_OUT_MS = 110
const TONGUE_MS = 300

const FLY_BACK_MS = 2000
const FLY_OUT_MS = 3200

const FROG_MOUTH = [1, 6.1] as const

const FLY_HIDE = [3, 6] as const

const TONGUE = rgb('#ef7b9b')

const flyPath = (t: number): readonly [number, number] => [
  14 + 3 * Math.sin(t * 0.005),
  8 + 3 * Math.sin(t * 0.0083),
]

const idleSnatchMs = (t: number): number =>
  t < FROG_SNATCH_AT_MS
    ? NOT_YET
    : t - ((t - FROG_SNATCH_AT_MS) % FROG_CYCLE_MS)

function frogSnatchMs(t: number, patMs: number): number {
  const idle = idleSnatchMs(t)
  if (
    !Number.isFinite(patMs) ||
    patMs > t ||
    patMs - idleSnatchMs(patMs) < FLY_OUT_MS
  )
    return idle
  return idle > patMs && idle - patMs >= FLY_OUT_MS ? idle : patMs
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

export interface FrogShot {
  readonly fly: { d: number; u: number; caught: boolean } | null
  readonly tongue: { d: number; u: number } | null
}

export function frogShot(m: HatMoment): FrogShot {
  const t = m.tMs
  const since = t - frogSnatchMs(t, m.patRunMs ?? m.patMs)
  const mouthU = FROG_MOUTH[1] + hatHop(t - m.patMs)
  const [d, u] = flyPath(t)
  if (since < TONGUE_OUT_MS) {
    const k = since / TONGUE_OUT_MS
    return {
      fly: { d, u, caught: false },
      tongue: { d: lerp(FROG_MOUTH[0], d, k), u: lerp(mouthU, u, k) },
    }
  }
  if (since < TONGUE_MS) {
    const [cd, cu] = flyPath(t - since + TONGUE_OUT_MS)
    const k = (since - TONGUE_OUT_MS) / (TONGUE_MS - TONGUE_OUT_MS)
    const tip = { d: lerp(cd, FROG_MOUTH[0], k), u: lerp(cu, mouthU, k) }
    return { fly: k < 0.8 ? { ...tip, caught: true } : null, tongue: tip }
  }
  if (since < FLY_BACK_MS) return { fly: null, tongue: null }
  if (since < FLY_OUT_MS) {
    const k = (since - FLY_BACK_MS) / (FLY_OUT_MS - FLY_BACK_MS)
    const e = k * k * (3 - 2 * k)
    return {
      fly: {
        d: lerp(FLY_HIDE[0], d, e),
        u: lerp(FLY_HIDE[1], u, e),
        caught: false,
      },
      tongue: null,
    }
  }
  return { fly: { d, u, caught: false }, tongue: null }
}

function drawFly(buf: PixelBuffer, d: number, u: number, t: number) {
  put(buf, d, u, INK.dark)
  if (Math.floor(t / 100) % 2) put(buf, d, u + 1, INK.wing)
}

function drawFrog(buf: PixelBuffer, m: HatMoment) {
  const t = m.tMs
  const { fly, tongue } = frogShot(m)
  if (fly && !tongue) drawFly(buf, fly.d, fly.u, t)
  const key = tongue
    ? 'tongue'
    : t % 3100 < 160 && t > 0
      ? 'blink'
      : Math.floor(t / 800) % 2
        ? 'throat'
        : 'idle'
  const hop = hatHop(t - m.patMs)
  blit(buf, frameOf(`frog/${key}`), 0, -hop)
  if (!tongue) return
  const [md, mu] = [FROG_MOUTH[0], FROG_MOUTH[1] + hop]
  const steps = Math.ceil(
    Math.max(Math.abs(tongue.d - md), Math.abs(tongue.u - mu))
  )
  for (let i = 0; i <= steps; i++) {
    const k = steps ? i / steps : 1
    put(buf, lerp(md, tongue.d, k), lerp(mu, tongue.u, k), TONGUE)
  }
  if (fly) drawFly(buf, fly.d, fly.u, fly.caught ? 0 : t)
}

const SNAIL_CROSSING_MS = 60_000

const SNAIL_REACH = 5

function drawSnail(buf: PixelBuffer, m: HatMoment) {
  const lap =
    ((m.tMs + SNAIL_CROSSING_MS / 2) % (SNAIL_CROSSING_MS * 2)) /
    SNAIL_CROSSING_MS
  const forward = lap < 1
  const d = SNAIL_REACH * (forward ? lap * 2 - 1 : 3 - lap * 2)
  const sincePat = m.tMs - m.patMs
  const key = sincePat >= 0 && sincePat < 1200 ? 'snail/in' : 'snail/out'
  const sprite = forward ? frameOf(key) : flippedFrameOf(key)
  blit(buf, sprite, Math.round(d), Math.abs(d) > 4 ? 1 : 0)
}

const NEST_FIRST_VISIT_MS = 8000
const NEST_CYCLE_MS = 13_000

export const NEST_VISIT = {
  landMs: 800,
  begMs: 250,
  feedMs: 1250,
  gulpMs: 1650,
  leaveMs: 2300,
  endMs: 3200,
} as const

const CHICK_D = [-6, 0, 6] as const
const CHICK_FACE = [-1, 0, 1] as const

const PERCH_D = { [-1]: -14, [1]: 13 } as const
const PERCH_U = 7

const hash01 = (n: number): number => {
  let x = n | 0
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d)
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

const cycleStartMs = (t: number, firstMs: number, cycleMs: number): number =>
  t < firstMs ? NOT_YET : t - ((t - firstMs) % cycleMs)

function nestVisitMs(t: number, patMs: number): number {
  const idle = cycleStartMs(t, NEST_FIRST_VISIT_MS, NEST_CYCLE_MS)
  if (
    !Number.isFinite(patMs) ||
    patMs > t ||
    patMs - cycleStartMs(patMs, NEST_FIRST_VISIT_MS, NEST_CYCLE_MS) <
      NEST_VISIT.endMs
  )
    return idle
  return idle > patMs && idle - patMs >= NEST_VISIT.endMs ? idle : patMs
}

type ParentKey = 'up' | 'down' | 'perch' | 'feed'

export interface NestParent {
  readonly d: number
  readonly u: number
  readonly key: ParentKey
  readonly faceRight: boolean
  readonly worm: boolean
}

export interface NestChick {
  readonly d: number
  readonly lift: number
  readonly face: ChickFace
  readonly open: boolean
  readonly shut: boolean
  readonly wings: 'none' | 'up' | 'down'
}

export interface NestShot {
  readonly parent: NestParent | null
  readonly chicks: readonly NestChick[]
}

const bezier = (a: number, c: number, b: number, k: number) =>
  (1 - k) * (1 - k) * a + 2 * (1 - k) * k * c + k * k * b

function parentAt(s: number, side: -1 | 1, t: number): NestParent | null {
  const V = NEST_VISIT
  const faceRight = side < 0
  const flap: ParentKey = Math.floor(t / 70) % 2 ? 'up' : 'down'
  const perchD = PERCH_D[side]
  if (s < V.landMs) {
    const k = s / V.landMs
    const e = 1 - (1 - k) * (1 - k)
    return {
      d: bezier(side * 30, side * 17, perchD, e),
      u: bezier(30, 24, PERCH_U, e),
      key: k > 0.82 ? 'up' : flap,
      faceRight,
      worm: true,
    }
  }
  if (s < V.leaveMs) {
    const landing = s < V.landMs + 120
    return {
      d: perchD,
      u: PERCH_U + (landing ? -1 : 0),
      key: s >= V.feedMs && s < V.gulpMs ? 'feed' : 'perch',
      faceRight,
      worm: s < V.gulpMs,
    }
  }
  if (s < V.endMs) {
    const k = (s - V.leaveMs) / (V.endMs - V.leaveMs)
    const e = k * k
    return {
      d: bezier(perchD, side * 2, -side * 32, e),
      u: bezier(PERCH_U, 24, 36, e),
      key: flap,
      faceRight,
      worm: false,
    }
  }
  return null
}

export function nestShot(m: HatMoment): NestShot {
  const t = m.tMs
  const sincePat = t - m.patMs
  const jolt = sincePat >= 0 && sincePat < 350
  if (isDarkTime(m.time)) {
    const woken = sincePat >= 0 && sincePat < 1800
    return {
      parent: null,
      chicks: CHICK_D.map((d, i) => {
        const cheep = woken && (Math.floor(sincePat / 220) + i) % 3 === 0
        return {
          d,
          lift: woken
            ? (jolt ? 2 : 1) + (cheep ? 1 : 0)
            : Math.sin(t * 0.0011 + i * 2.1) > 0.5
              ? 0
              : -1,
          face: CHICK_FACE[i],
          open: cheep,
          shut: !woken,
          wings: 'none',
        }
      }),
    }
  }
  const visit = nestVisitMs(t, m.patRunMs ?? m.patMs)
  const s = t - visit
  const side: -1 | 1 = hash01(Math.floor(visit / 100)) < 0.5 ? -1 : 1
  const parent = parentAt(s, side, t)
  const fedChick = side < 0 ? 0 : 2
  const V = NEST_VISIT
  const begging = parent !== null && s >= V.begMs && s < V.leaveMs + 250
  return {
    parent,
    chicks: CHICK_D.map((d, i) => {
      if (begging) {
        const fed = i === fedChick && s >= V.gulpMs
        if (fed) {
          const since = s - V.gulpMs
          return {
            d: d + (since < 450 ? (Math.floor(since / 75) % 2 ? 1 : -1) : 0),
            lift: since < 150 ? 1 : 0,
            face: CHICK_FACE[i],
            open: false,
            shut: since >= 450,
            wings: 'none',
          }
        }
        const reaching = i === fedChick && s >= V.feedMs - 250 && s < V.gulpMs
        const settling = s >= V.leaveMs
        const beat = (Math.floor(t / 90) + i) % 2
        return {
          d,
          lift: reaching
            ? 4
            : settling
              ? 1
              : 2 + beat - (s < V.begMs + 120 ? 1 : 0),
          face: side,
          open: !settling,
          shut: false,
          wings: settling || reaching ? 'none' : beat ? 'up' : 'down',
        }
      }
      const slot = Math.floor((t + i * 233) / 650)
      const cheep = hash01(slot * 3 + i) < 0.22 && (t + i * 233) % 650 < 300
      const glance = Math.floor((t + i * 911) / 2300)
      const turn = hash01(glance * 5 + i + 101) < 0.3
      const face: ChickFace = turn
        ? i === 1
          ? hash01(glance + 7) < 0.5
            ? -1
            : 1
          : 0
        : CHICK_FACE[i]
      const stretch = Math.floor((t + i * 577) / 1700)
      const flapping =
        hash01(stretch * 11 + i + 37) < 0.14 && (t + i * 577) % 1700 < 560
      return {
        d,
        lift: flapping
          ? 2
          : (cheep ? 1 : 0) +
            (jolt ? 2 : 0) +
            (Math.sin(t * 0.0017 + i * 2.4) > 0.6 ? 1 : 0),
        face,
        open: cheep || jolt,
        shut: t > 0 && (t + i * 1300) % 3700 < 130,
        wings: flapping ? (Math.floor(t / 80) % 2 ? 'up' : 'down') : 'none',
      }
    }),
  }
}

const PARENT_INK: Readonly<Record<string, number>> = rgbPalette({
  b: '#7a5236',
  w: '#553823',
  B: '#e0703a',
  e: '#26221e',
  y: '#e0a43a',
  k: '#3a2a1c',
})

const WORM = rgb('#e88a9a')

const PARENT: Readonly<
  Record<
    ParentKey,
    { rows: readonly string[]; foot: number; beak: readonly [number, number] }
  >
> = {
  perch: {
    rows: [
      '......bb...',
      '.....bbbey.',
      '....bbbBB..',
      '.wwwwwBBB..',
      'wwwwwwBBB..',
      '...bbBBB...',
      '.....k.k...',
    ],
    foot: 6,
    beak: [9, 1],
  },
  feed: {
    rows: [
      '...........',
      '.......bb..',
      '......bbbey',
      '.wwwwwbBB..',
      'wwwwwwBBB..',
      '...bbBBB...',
      '.....k.k...',
    ],
    foot: 6,
    beak: [10, 2],
  },
  up: {
    rows: [
      '...w.......',
      '...ww......',
      '...www.bb..',
      '.wbwwwbbbey',
      'wwbbbbBBB..',
      '...bbBBB...',
    ],
    foot: 6,
    beak: [10, 3],
  },
  down: {
    rows: [
      '.......bb..',
      '......bbbey',
      'wwbbbbbBB..',
      '.bbwwwBBB..',
      '...wwwBB...',
      '...ww......',
      '...w.......',
    ],
    foot: 6,
    beak: [10, 1],
  },
}

const PARENT_W = 11

function drawParent(buf: PixelBuffer, p: NestParent) {
  const art = PARENT[p.key]
  const [px, py] = bigHatPoint(p.d, p.u).map(Math.round)
  const col = (i: number) => (p.faceRight ? i : PARENT_W - 1 - i)
  const x0 = px - col(art.foot)
  const y0 = py - (art.rows.length - 1)
  art.rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i]
      if (ch !== '.') setPixel(buf, x0 + col(i), y0 + j, PARENT_INK[ch])
    }
  })
  if (!p.worm) return
  const bx = x0 + col(art.beak[0])
  const by = y0 + art.beak[1]
  setPixel(buf, bx, by + 1, WORM)
  setPixel(buf, bx + (p.faceRight ? -1 : 1), by + 2, WORM)
}

const CHICK_WING = rgb('#e8c13f')
const CHICK_WING_TIP = rgb('#b08a22')

function drawNest(buf: PixelBuffer, m: HatMoment) {
  const { parent, chicks } = nestShot(m)
  for (const c of chicks)
    blit(
      buf,
      frameOf(
        `nest/chick/${c.face}/${c.open ? 'open' : 'shut'}/${c.shut ? 'lid' : 'eye'}`
      ),
      c.d,
      -c.lift
    )
  blit(buf, frameOf('nest/bowl'), 0, 0)
  for (const c of chicks) {
    if (c.wings === 'none') continue
    const u = NEST_CHICK_U - 2 + c.lift
    const tip = c.wings === 'up' ? 1 : -1
    for (const [base, out] of [
      [c.d - 3, -1],
      [c.d + 2, 1],
    ]) {
      put(buf, base, u, CHICK_WING)
      put(buf, base + out, u + tip, CHICK_WING_TIP)
    }
  }
  if (parent) drawParent(buf, parent)
}

function drawHive(buf: PixelBuffer, m: HatMoment) {
  const sincePat = m.tMs - m.patMs
  const speed = sincePat >= 0 && sincePat < 1800 ? 0.0065 : 0.0024
  const bees = [0, 2.1, 4.2].map((phase, i) => {
    const a = m.tMs * speed + phase
    return {
      d: (11 + i) * Math.cos(a),
      u: 8 + i * 2 + 5 * Math.sin(a * 0.7),
      front: Math.sin(a) > 0,
    }
  })
  const drawBee = ({ d, u }: { d: number; u: number }) => {
    put(buf, d, u, INK.bee)
    put(buf, d + 1, u, INK.dark)
    if (Math.floor(m.tMs / 100) % 2) put(buf, d, u + 1, INK.wing)
  }
  bees.filter((bee) => !bee.front).forEach(drawBee)
  blit(buf, frameOf('hive'), 0, 0)
  bees.filter((bee) => bee.front).forEach(drawBee)
}

function drawCuckoo(buf: PixelBuffer, m: HatMoment) {
  const clock = m.clockMs === null ? null : new Date(m.clockMs)
  const hour = clock ? clock.getHours() % 12 : 3
  const minute = clock ? clock.getMinutes() : 0
  const second = clock ? clock.getSeconds() : 0
  const sincePat = m.tMs - m.patMs
  const calling =
    (sincePat >= 0 && sincePat < 1500) || (clock && minute === 0 && second < 6)
  blit(buf, frameOf(calling ? 'cuckoo/out' : 'cuckoo/shut'), 0, 0)
  const hand = (turn: number, length: number) => {
    const a = turn * 2 * Math.PI
    for (let r = 0; r <= length; r++)
      put(
        buf,
        Math.round(r * Math.sin(a)),
        6 + Math.round(r * Math.cos(a)),
        INK.hand
      )
  }
  hand(minute / 60, 3)
  hand((hour + minute / 60) / 12, 2)
  put(buf, Math.floor(m.tMs / 500) % 2 ? -1 : 1, 0.8, INK.brass)
}

const minis = createLru<PixelBuffer>(32)

function miniOf(species: PetSpeciesId, coat: string, bob: number): PixelBuffer {
  return minis.getOrCreate(`${species}|${coat}|${bob}`, () => {
    const src = petSprite(species, coat, {
      ...idlePose('happy', 1000, 1),
      bob,
      tail: 0,
      blink: false,
      flip: false,
      lie: false,
      mouthClosing: false,
    })
    const side = Math.floor(src.width / 2)
    const out = bigHatCanvas()
    const left = BIG_HAT_CX - Math.floor(side / 2)
    const top = BIG_HAT_BRIM_ROW - side + 2
    const lum = (i: number) =>
      src.data[i] * 0.3 + src.data[i + 1] * 0.59 + src.data[i + 2] * 0.11
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        const cell: number[] = []
        for (const [dx, dy] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ]) {
          const i = ((y * 2 + dy) * src.width + (x * 2 + dx)) * 4
          if (src.data[i + 3] > 0) cell.push(i)
        }
        if (cell.length < 2) continue
        cell.sort((a, b) => lum(a) - lum(b))
        const pick =
          lum(cell[cell.length - 1]) - lum(cell[0]) > 90
            ? cell[0]
            : cell[Math.floor(cell.length / 2)]
        setPixel(
          out,
          left + x,
          top + y,
          (src.data[pick] << 16) |
            (src.data[pick + 1] << 8) |
            src.data[pick + 2]
        )
      }
    }
    return outlined(out)
  })
}

function outlined(src: PixelBuffer): PixelBuffer {
  const out = cloneBuffer(src)
  const { width, height, data } = src
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) continue
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const xx = x + dx
        const yy = y + dy
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
        const k = (yy * width + xx) * 4
        if (data[k + 3] === 0) continue
        setPixel(
          out,
          x,
          y,
          (Math.round(data[k] * 0.42) << 16) |
            (Math.round(data[k + 1] * 0.42) << 8) |
            Math.round(data[k + 2] * 0.42)
        )
        break
      }
    }
  return out
}

function drawBalloon(buf: PixelBuffer, m: HatMoment) {
  const t = m.tMs
  const sincePat = t - m.patMs
  const jolt =
    sincePat >= 0 && sincePat < 1600
      ? Math.round(Math.sin(sincePat * 0.012) * 4 * (1 - sincePat / 1600))
      : 0
  const sway = Math.round(Math.sin(t * 0.0009) * 3)
  const lift = 16 + Math.round(Math.sin(t * 0.0013)) + jolt
  for (let u = 0; u <= lift; u++)
    put(
      buf,
      (sway * u) / lift + Math.sin(u * 0.6 + t * 0.002) * 0.6,
      u,
      INK.string
    )
  blit(buf, frameOf('balloon'), sway, -lift)
}

export function birdPerch(m: HatMoment): readonly [number, number] {
  const hop = [0, 0, 1, 1, 0, -1, -1, 0][Math.floor(m.tMs / 700) % 8]
  return [2 + hop, m.growth >= 5 ? 31 : 29]
}

export const BIRD_AWAY_MS = 3200

function drawFig(buf: PixelBuffer, m: HatMoment) {
  blit(buf, frameOf(`fig/${m.season}${m.growth}`), 0, 0)
  const sincePat = m.tMs - m.patMs
  if (
    m.growth >= 4 &&
    m.season !== 'winter' &&
    !(sincePat >= 0 && sincePat < BIRD_AWAY_MS)
  ) {
    const [d, u] = birdPerch(m)
    put(buf, d, u, INK.bird)
    put(buf, d + 1, u, INK.bird)
    put(buf, d + 2, u, INK.beak)
    put(buf, d - 1, u - 1, INK.dark)
    put(buf, d, u - 1, INK.bird)
    put(buf, d + 1, u - 1, INK.breast)
  }
}

const wrap = (v: number, n: number) => ((v % n) + n) % n

const CAROUSEL_SPIN_MS = 2400

export function carouselAngle(tMs: number, patMs: number): number {
  const since = tMs - patMs
  const spin =
    since >= 0 && since < CAROUSEL_SPIN_MS
      ? (1 - Math.cos((since / CAROUSEL_SPIN_MS) * Math.PI)) * 2 * Math.PI
      : 0
  return Math.PI / 2 + 0.2 + tMs * 0.0007 + spin
}

type Rider = {
  readonly map: readonly string[]
  readonly ink: Readonly<Record<string, number>>
}

const RIDERS: Readonly<Record<PetSpeciesId, Rider>> = {
  lion: {
    map: [
      '........',
      '...aaa..',
      '..aabkb.',
      'a.aabbbk',
      'abbrrbb.',
      '.bbbbbs.',
      '.s....s.',
    ],
    ink: rgbPalette({
      b: '#e8b04a',
      s: '#c98a2e',
      a: '#a0522d',
      k: '#26221e',
    }),
  },
  dog: {
    map: [
      '........',
      '....bbb.',
      '...abkbb',
      'b..abbbk',
      'bbbrrbb.',
      '.bbbbbs.',
      '.s....s.',
    ],
    ink: rgbPalette({
      b: '#c8874a',
      s: '#a86a34',
      a: '#7a4a28',
      k: '#26221e',
    }),
  },
  cat: {
    map: [
      '....b.b.',
      '....bbb.',
      'b...bkbb',
      'b..bbbbp',
      '.bbrrbb.',
      '.bsbsbs.',
      '.s....s.',
    ],
    ink: rgbPalette({
      b: '#e89a52',
      s: '#c4763a',
      p: '#f4a6b8',
      k: '#26221e',
    }),
  },
  donkey: {
    map: [
      '....a.a.',
      '....a.a.',
      '...bbkb.',
      'b..bbbww',
      'bbbrrb..',
      '.bbbbbs.',
      '.s....s.',
    ],
    ink: rgbPalette({
      b: '#9a948c',
      s: '#7a746c',
      a: '#5e5850',
      w: '#e9e1d0',
      k: '#26221e',
    }),
  },
  lamb: {
    map: [
      '........',
      '....sss.',
      '...sbfff',
      's..bbfff',
      'sbbrrbb.',
      '.bbbbbs.',
      '.f....f.',
    ],
    ink: rgbPalette({
      b: '#fbf6ea',
      s: '#cfc4ae',
      f: '#3a332c',
    }),
  },
}

const FAIR = rgbPalette({
  pole: '#f6d55c',
  poleDark: '#c98a16',
  rim: '#d6ae2c',
  bulbOff: '#b08a3a',
  bulb: '#fff2b8',
  pennant: '#3fb6a8',
  pennantDark: '#2a8a80',
})

const SADDLES = rgbPalette({ a: '#e0464f', b: '#3fb6a8', c: '#f47fb0' })

const CREAM = ['#fbf6ea', '#ddd3c0']

const STRIPES = [
  ['#e0464f', '#b93039'],
  ['#3fb6a8', '#2a8a80'],
  ['#f6d55c', '#d6ae2c'],
  ['#f47fb0', '#c95a8a'],
  ['#8f7ae6', '#6a58bf'],
  ['#7cc45a', '#5a9a3e'],
]
  .flatMap((color) => [CREAM, color])
  .map(([c, dark]) => [rgb(c), rgb(dark)] as const)

const BULB_TINTS = ['#fff2b8', '#ffd3e0', '#c6f3ec', '#ffe08a'].map(rgb)

export const ROOF = { rim: 16, apex: 25, rx: 14.4 } as const

const STRIPE_ARC = Math.PI / 6

function drawRider(
  buf: PixelBuffer,
  rider: Rider,
  saddle: number,
  x: number,
  y: number,
  flip: boolean
) {
  const { map, ink } = rider
  map.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[flip ? row.length - 1 - i : i]
      if (ch === '.') continue
      setPixel(
        buf,
        x - 4 + i,
        y - map.length + 1 + j,
        ch === 'r' ? saddle : ink[ch]
      )
    }
  })
}

function drawCanopy(buf: PixelBuffer, angle: number) {
  for (let u: number = RIDE.roof; u <= ROOF.apex; u++) {
    const w =
      u <= ROOF.rim
        ? ROOF.rx
        : ROOF.rx * Math.pow((ROOF.apex - u) / (ROOF.apex - ROOF.rim), 1.2)
    const reach = Math.round(w)
    for (let d = -reach; d <= reach; d++) {
      const theta = Math.acos(Math.max(-1, Math.min(1, d / Math.max(w, 0.5))))
      const along = wrap(theta - angle, 2 * Math.PI) / STRIPE_ARC
      if (u === RIDE.roof) {
        const middle = along - Math.floor(along)
        if (middle < 0.25 || middle > 0.75) continue
      }
      const [c, dark] = STRIPES[Math.floor(along) % STRIPES.length]
      put(
        buf,
        d,
        u,
        u === ROOF.rim ? FAIR.rim : Math.abs(d) > w * 0.78 ? dark : c
      )
    }
  }
}

export interface CarouselBulb {
  readonly d: number
  readonly u: number
  readonly c: number
  readonly lit: boolean
}

const BULBS = 12

export function carouselBulbs(m: HatMoment): CarouselBulb[] {
  const angle = carouselAngle(m.tMs, m.patMs)
  const show = hatRoomDim('carousel', m) > 0.25
  const sinceCoins = m.tMs - m.coinsMs
  const flashing = sinceCoins >= 0 && sinceCoins < 1600
  const step = Math.floor(m.tMs / (show ? 140 : 700))
  const out: CarouselBulb[] = []
  for (let k = 0; k < BULBS; k++) {
    const at = angle + (k * 2 * Math.PI) / BULBS
    if (Math.sin(at) < 0.1) continue
    const lit =
      flashing || (show ? wrap(k - step, 3) === 0 : wrap(k + step, 2) === 0)
    out.push({
      d: Math.round(ROOF.rx * Math.cos(at)),
      u: ROOF.rim,
      c: flashing
        ? BULB_TINTS[wrap(k + Math.floor(sinceCoins / 120), BULB_TINTS.length)]
        : show
          ? BULB_TINTS[k % BULB_TINTS.length]
          : FAIR.bulb,
      lit,
    })
  }
  return out
}

function drawCarousel(buf: PixelBuffer, m: HatMoment) {
  blit(buf, frameOf('carousel/base'), 0, 0)
  const angle = carouselAngle(m.tMs, m.patMs)
  const lead = Math.max(0, PET_SPECIES_IDS.indexOf(m.species))
  const saddles = [SADDLES.a, SADDLES.b, SADDLES.c]
  const riders = saddles.map((saddle, k) => {
    const at = angle + (k * 2 * Math.PI) / 3
    const near = Math.sin(at)
    const base = RIDE.u - RIDE.ry * near
    return {
      rider: RIDERS[PET_SPECIES_IDS[(lead + k) % PET_SPECIES_IDS.length]],
      saddle,
      d: Math.round(RIDE.rx * Math.cos(at)),
      base,
      lift: Math.round(1.4 * Math.sin(2 * at + k)),
      near,
    }
  })
  const place = (r: (typeof riders)[number]) => {
    for (let u = Math.round(r.base); u < RIDE.roof; u++)
      put(buf, r.d, u, u % 3 === 0 ? FAIR.poleDark : FAIR.pole)
    const [x, y] = bigHatPoint(r.d, r.base + 2 + r.lift)
    drawRider(buf, r.rider, r.saddle, Math.round(x), Math.round(y), r.near > 0)
  }
  riders
    .filter((r) => r.near <= 0)
    .sort((a, b) => a.near - b.near)
    .forEach(place)
  blit(buf, frameOf('carousel/column'), 0, 0)
  riders
    .filter((r) => r.near > 0)
    .sort((a, b) => a.near - b.near)
    .forEach(place)
  drawCanopy(buf, angle)
  for (const bulb of carouselBulbs(m))
    put(buf, bulb.d, bulb.u, bulb.lit ? bulb.c : FAIR.bulbOff)
  for (let u = ROOF.apex + 1; u <= ROOF.apex + 4; u++)
    put(buf, 0, u, FAIR.poleDark)
  put(buf, 0, ROOF.apex + 1, FAIR.pole)
  put(buf, -1, ROOF.apex + 1, FAIR.pole)
  const flutter = Math.floor(m.tMs / 260) % 2
  put(buf, 1, ROOF.apex + 4, FAIR.pennant)
  put(buf, 2, ROOF.apex + 4 - flutter, FAIR.pennant)
  put(buf, 1, ROOF.apex + 3, FAIR.pennantDark)
  put(buf, 3, ROOF.apex + 3 - flutter, FAIR.pennant)
  blit(buf, outlined(buf), 0, 0)
}

const SCOPE = {
  d: 1,
  u: 10,
  length: 9,
  sweep: 0.75,
  reach: 0.95,
  patMs: 1600,
  coinsMs: 1500,
} as const

const window01 = (since: number, totalMs: number, rampMs: number): number =>
  since < 0 || since >= totalMs
    ? 0
    : Math.min(1, since / rampMs, (totalMs - since) / rampMs)

export function telescopeAngle(m: HatMoment): number {
  const up = Math.PI / 2
  let angle = up - SCOPE.sweep * Math.sin(m.tMs * 0.0005 + 0.9)
  const sincePat = m.tMs - m.patMs
  const pat = window01(sincePat, SCOPE.patMs, 200)
  if (pat > 0) {
    const swing = Math.sin((sincePat / SCOPE.patMs) * 2 * Math.PI)
    angle += (up + SCOPE.reach * swing - angle) * pat
  }
  const sinceCoins = m.tMs - m.coinsMs
  const coins = window01(sinceCoins, SCOPE.coinsMs, 180)
  if (coins > 0) {
    const along = Math.min(1, sinceCoins / 900)
    angle += (up - SCOPE.reach + 1.5 * along - angle) * coins
  }
  return angle
}

function drawTelescope(buf: PixelBuffer, m: HatMoment, lit: boolean) {
  const angle = telescopeAngle(m)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const steep = Math.abs(sin) > Math.abs(cos)
  for (let i = 0; i <= SCOPE.length; i++) {
    const d = Math.round(SCOPE.d + cos * i)
    const u = Math.round(SCOPE.u + sin * i)
    const lens = i >= SCOPE.length - 1
    put(
      buf,
      d,
      u,
      lens ? (lit ? INK.lensLit : INK.lens) : i === 0 ? INK.dark : INK.tube
    )
    put(
      buf,
      steep ? d + 1 : d,
      steep ? u : u - 1,
      lens ? (lit ? INK.glassLit : INK.glass) : INK.tubeDark
    )
  }
}

const scratch = bigHatCanvas()

function drawInto(buf: PixelBuffer, hat: BigHatId, m: HatMoment) {
  const t = m.tMs
  const sincePat = t - m.patMs
  switch (hat) {
    case 'propeller': {
      const fast = sincePat >= 0 && sincePat < 1800
      const lift = fast
        ? Math.round(Math.sin((sincePat / 1800) * Math.PI) * 4)
        : 0
      blit(
        buf,
        frameOf(`propeller/${Math.floor(t / (fast ? 100 : 200)) % 8}`),
        0,
        -lift
      )
      break
    }
    case 'snail':
      drawSnail(buf, m)
      break
    case 'mailbox': {
      const sinceCoins = t - m.coinsMs
      const key =
        sincePat >= 0 && sincePat < 1600 && m.patMs >= m.coinsMs
          ? 'open'
          : sinceCoins >= 0 && sinceCoins < 500
            ? 'down'
            : m.wentOut || (sinceCoins >= 0 && sinceCoins < 8000)
              ? 'up'
              : 'down'
      blit(buf, frameOf(`mailbox/${key}`), 0, 0)
      break
    }
    case 'nest':
      drawNest(buf, m)
      break
    case 'frog':
      drawFrog(buf, m)
      break
    case 'hive':
      drawHive(buf, m)
      break
    case 'cottage':
      blit(
        buf,
        frameOf(isDarkTime(m.time) ? 'cottage/night' : 'cottage/day'),
        0,
        0
      )
      break
    case 'cloud':
      blit(
        buf,
        frameOf(
          sincePat >= 0 && sincePat < 1600 ? 'cloud/heavy' : 'cloud/light'
        ),
        Math.round(Math.sin(t * 0.0007)),
        Math.round(Math.sin(t * 0.0011))
      )
      break
    case 'cuckoo':
      drawCuckoo(buf, m)
      break
    case 'mini':
      blit(
        buf,
        miniOf(m.species, m.coat, Math.floor(t / 560 + 1) % 2),
        0,
        -hatHop(sincePat)
      )
      break
    case 'balloon':
      drawBalloon(buf, m)
      break
    case 'bowl':
      drawBowl(buf, m)
      break
    case 'carousel':
      drawCarousel(buf, m)
      break
    case 'train':
      drawTrain(buf, m)
      break
    case 'dome': {
      const lit = hatRoomDim(hat, m) > 0.25
      blit(buf, frameOf(lit ? 'dome/open' : 'dome/closed'), 0, 0)
      drawTelescope(buf, m, lit)
      break
    }
    case 'fig':
      drawFig(buf, m)
      break
    default:
      blit(buf, plainHat(hat as PlainHatId), 0, 0)
  }
}

const plains = createLru<PixelBuffer>(16)

function plainHat(hat: PlainHatId): PixelBuffer {
  return plains.getOrCreate(hat, () =>
    rasterize(PLAIN_HAT_SPECS[hat], BIG_HAT_W, BIG_HAT_H)
  )
}

export function bigHatFrame(hat: BigHatId, m: HatMoment): PixelBuffer {
  if (isStaticHat(hat)) return plainHat(hat)
  scratch.data.fill(0)
  drawInto(scratch, hat, m)
  return scratch
}

const RESTING: HatMoment = {
  tMs: 0,
  species: 'lion',
  coat: 'default',
  season: 'summer',
  time: 'day',
  growth: FULL_GROWTH,
  wentOut: true,
  patMs: NOT_YET,
  coinsMs: NOT_YET,
  clockMs: null,
}

const rests = createLru<PixelBuffer>(48)

export function bigHatRest(hat: BigHatId, growth = FULL_GROWTH): PixelBuffer {
  return rests.getOrCreate(`${hat}|${hat === 'fig' ? growth : ''}`, () =>
    cloneBuffer(bigHatFrame(hat, { ...RESTING, growth }))
  )
}
