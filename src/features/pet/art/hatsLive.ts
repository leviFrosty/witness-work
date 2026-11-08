import {
  blit,
  cloneBuffer,
  createLru,
  flipH,
  rasterize,
  rgbPalette,
  setPixel,
  type PixelBuffer,
  type ShapeSpec,
} from '@/lib/pixelArt'
import type { BigHatId, Season } from '@/types/pet'

import {
  BIG_HAT_BRIM_ROW,
  BIG_HAT_CX,
  BIG_HAT_H,
  BIG_HAT_W,
  bigHatCanvas,
  bigHatPoint,
} from './hatCanvas'
import { FIG_STAGES, HAT_FRAME_SPECS } from './hatFrames'
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
  readonly coinsMs: number
  readonly clockMs: number | null
}

export const FULL_GROWTH = FIG_STAGES - 1

const NOT_YET = -Infinity

export const SHOW_MS = 14_000

const SHOW_FADE_MS = 900

const HOP = [0, 2, 4, 4, 3, 1, 0] as const

const HOP_STEP_MS = 80

export const hatHop = (sincePat: number): number =>
  sincePat >= 0 && sincePat < HOP.length * HOP_STEP_MS
    ? HOP[Math.floor(sincePat / HOP_STEP_MS)]
    : 0

const isStaticHat = (hat: BigHatId): hat is PlainHatId =>
  Object.hasOwn(PLAIN_HAT_SPECS, hat)

export const isDarkTime = (time: TimeOfDay): boolean =>
  time === 'night' || time === 'dusk'

export function hatRoomDim(hat: BigHatId, m: HatMoment): number {
  if (hat !== 'lighthouse' && hat !== 'dome') return 0
  if (isDarkTime(m.time)) return 1
  const since = m.tMs - m.patMs
  if (since < 0 || since >= SHOW_MS) return 0
  return Math.min(1, since / SHOW_FADE_MS, (SHOW_MS - since) / SHOW_FADE_MS)
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
  beak: '#e0a43a',
  string: '#8b7f6a',
  brass: '#6d4526',
})

const put = (buf: PixelBuffer, d: number, u: number, c: number) => {
  const [x, y] = bigHatPoint(d, u)
  setPixel(buf, x, y, c)
}

const CAR_COLOR: Readonly<Record<string, number>> = rgbPalette({
  r: '#c0453f',
  g: '#ffd45c',
  b: '#2f7f5a',
  k: '#26221e',
  o: '#8f8a84',
  y: '#f1b92e',
  Y: '#c98a16',
  w: '#3f6fb5',
  W: '#2c5290',
})

const CARS = {
  loco: [
    '......k.',
    'rrr...k.',
    'rgrbbbbb',
    'rrrbbbbb',
    'kkkkkkkk',
    '.o..o.o.',
  ],
  coal: ['......', 'kkkkkk', 'rrrrrr', 'rrrrrr', 'kkkkkk', '.o..o.'],
  wagon: ['......', '......', 'wwwwww', 'WWWWWW', 'kkkkkk', '.o..o.'],
  heaped: ['..yy..', 'yYyyYy', 'wwwwww', 'WWWWWW', 'kkkkkk', '.o..o.'],
  locoEnd: ['.k.', 'rrr', 'rgr', 'rrr', 'kkk', 'o.o'],
  coalEnd: ['...', 'kkk', 'rrr', 'rrr', 'kkk', 'o.o'],
  wagonEnd: ['...', 'yyy', 'www', 'WWW', 'kkk', 'o.o'],
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
          y - map.length + j,
          CAR_COLOR[ch]
        )
    }
  })
}

const TRAIN_LAP_MS = 2000

export function trainAngle(tMs: number, patMs: number): number {
  const since = tMs - patMs
  const lap =
    since >= 0 && since < TRAIN_LAP_MS
      ? (since / TRAIN_LAP_MS) * 2 * Math.PI
      : 0
  return tMs * 0.0011 + lap
}

function drawTrain(buf: PixelBuffer, m: HatMoment) {
  blit(buf, frameOf('train/bed'), 0, 0)
  const angle = trainAngle(m.tMs, m.patMs)
  const heaped = m.tMs - m.coinsMs < 20_000
  const cars = [
    { side: CARS.loco, end: CARS.locoEnd, at: angle },
    { side: CARS.coal, end: CARS.coalEnd, at: angle - 0.95 },
    {
      side: heaped || m.coinsMs === NOT_YET ? CARS.heaped : CARS.wagon,
      end: CARS.wagonEnd,
      at: angle - 1.75,
    },
  ].map((car) => ({
    ...car,
    sin: Math.sin(car.at),
    d: 12 * Math.cos(car.at),
    edge: Math.abs(Math.cos(car.at)) < 0.34,
  }))
  const place = (car: (typeof cars)[number]) => {
    const [x, y] = bigHatPoint(car.d, 3.2 - 3.1 * car.sin - 1.4)
    drawCar(buf, car.edge ? car.end : car.side, x, y, !car.edge && car.sin > 0)
  }
  cars
    .filter((car) => car.sin <= 0)
    .sort((a, b) => a.sin - b.sin)
    .forEach(place)
  blit(buf, frameOf('train/hill'), 0, 0)
  cars
    .filter((car) => car.sin > 0)
    .sort((a, b) => a.sin - b.sin)
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
  const slosh =
    sincePat >= 0 && sincePat < 1200 ? 1 + (Math.floor(t / 200) % 2) : 0
  blit(buf, frameOf(`bowl/${slosh}`), 0, 0)
  const speed = sincePat >= 0 && sincePat < 1000 ? 0.006 : 0.0014
  const jump = t - m.coinsMs
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

function drawFrog(buf: PixelBuffer, m: HatMoment) {
  const t = m.tMs
  const cycle = t % FROG_CYCLE_MS
  const key =
    cycle > 7600 && cycle < 7900
      ? 'tongue'
      : t % 3100 < 160 && t > 0
        ? 'blink'
        : Math.floor(t / 800) % 2
          ? 'throat'
          : 'idle'
  blit(buf, frameOf(`frog/${key}`), 0, -hatHop(t - m.patMs))
  if (cycle < 7800) {
    const d = 14 + 3 * Math.sin(t * 0.005)
    const u = 8 + 3 * Math.sin(t * 0.0083)
    put(buf, d, u, INK.dark)
    if (Math.floor(t / 100) % 2) put(buf, d, u + 1, INK.wing)
  }
}

const SNAIL_CROSSING_MS = 60_000

function drawSnail(buf: PixelBuffer, m: HatMoment) {
  const lap = (m.tMs % (SNAIL_CROSSING_MS * 2)) / SNAIL_CROSSING_MS
  const forward = lap < 1
  const d = forward ? -7 + lap * 14 : 7 - (lap - 1) * 14
  const sincePat = m.tMs - m.patMs
  const key = sincePat >= 0 && sincePat < 1200 ? 'snail/in' : 'snail/out'
  const sprite = forward ? frameOf(key) : flippedFrameOf(key)
  blit(buf, sprite, Math.round(d), Math.round((d / 8) ** 2 * 2))
}

const NEST_TURNS = [0, 1, 0, 2, 0, 3] as const

function drawNest(buf: PixelBuffer, m: HatMoment) {
  const sincePat = m.tMs - m.patMs
  const key =
    sincePat >= 0 && sincePat < 1500
      ? 'fed'
      : NEST_TURNS[Math.floor(m.tMs / 900) % NEST_TURNS.length]
  blit(buf, frameOf(`nest/${key}`), 0, 0)
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
  const hour = clock ? clock.getHours() % 12 : 10
  const minute = clock ? clock.getMinutes() : 10
  const second = clock ? clock.getSeconds() : 0
  const sincePat = m.tMs - m.patMs
  const calling =
    (sincePat >= 0 && sincePat < 1500) || (clock && minute === 0 && second < 6)
  blit(buf, frameOf(calling ? 'cuckoo/out' : 'cuckoo/shut'), 0, 0)
  const hand = (turn: number, length: number) => {
    const a = turn * 2 * Math.PI
    for (let r = 0; r <= length; r += 0.5)
      put(buf, r * Math.sin(a), 5.6 + r * Math.cos(a), INK.hand)
  }
  hand((hour + minute / 60) / 12, 2.2)
  hand(minute / 60, 3.4)
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
    return out
  })
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

function birdPerch(m: HatMoment): readonly [number, number] {
  const hop = [0, 0, 1, 1, 0, -1, -1, 0][Math.floor(m.tMs / 700) % 8]
  return [2 + hop, m.growth >= 5 ? 33 : 29]
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
    put(buf, d, u - 1, INK.bird)
    put(buf, d + 1, u - 1, INK.bird)
    put(buf, d + 2, u, INK.beak)
    put(buf, d, u + 1, INK.dark)
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
        sincePat >= 0 && sincePat < 1600
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
    case 'lighthouse':
      blit(buf, frameOf(`lighthouse/${Math.floor(t / 160) % 8}`), 0, 0)
      break
    case 'train':
      drawTrain(buf, m)
      break
    case 'dome':
      blit(
        buf,
        frameOf(hatRoomDim(hat, m) > 0.25 ? 'dome/open' : 'dome/closed'),
        0,
        0
      )
      break
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
