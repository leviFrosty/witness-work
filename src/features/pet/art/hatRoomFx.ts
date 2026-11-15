import { rgbPalette, type PixelBuffer, type PixelMask } from '@/lib/pixelArt'
import type { BigHatId } from '@/types/pet'

import { blend, darken, glow, isDarkTime, square } from './fx'
import { bigHatPoint } from './hatCanvas'
import {
  BIRD_AWAY_MS,
  birdPerch,
  carouselAngle,
  carouselBulbs,
  FISH_JUMP_MS,
  hatRoomDim,
  trainAngle,
  trainSpot,
  type HatMoment,
} from './hatsLive'
import { PET_X, SCENE_H, SCENE_W, SPRITE_SIZE } from './layout'
import { FLOOR_TOP } from './room/floor'

export type HatFxPlace = {
  readonly x: number
  readonly y: number
  readonly flip: boolean
}

const FX = rgbPalette({
  star: '#e4ecff',
  starWarm: '#ffe7b0',
  white: '#ffffff',
  water: '#c6ecff',
  splash: '#a8dcf5',
  drop: '#3f94c8',
  smoke: '#d9d3c7',
  steam: '#eee9dd',
  window: '#ffd45c',
  coin: '#f1b92e',
  coinLight: '#fff0a8',
  coinDark: '#8a5a12',
  rain: '#7cb9e8',
  snow: '#ffffff',
  fig: '#6d3a78',
  bird: '#6b4a33',
  petal: '#ffd3e0',
  leafGreen: '#6fb24e',
  leafAmber: '#d98f2e',
  sprout: '#b8ec7c',
})

const FAIR_LIGHTS = rgbPalette({
  red: '#ff6b6b',
  teal: '#4fd1c5',
  gold: '#ffd45c',
  pink: '#ff8fc7',
  violet: '#a78bfa',
  green: '#8fe388',
})

const SPOT_COLORS = Object.values(FAIR_LIGHTS)

const NOTE_COLORS = rgbPalette({ a: '#c95a8a', b: '#2a8a80', c: '#b93039' })

const at = (place: HatFxPlace, d: number, u: number): [number, number] => {
  const [x, y] = bigHatPoint(place.flip ? -d : d, u)
  return [place.x + x, place.y + y]
}

const sines = {
  x: new Float32Array(SCENE_W),
  y: new Float32Array(SCENE_H),
  mix: new Float32Array(SCENE_W + SCENE_H),
}

function drawWaterLight(
  buf: PixelBuffer,
  m: HatMoment,
  subject: PixelMask
): void {
  const k = m.tMs * 0.0011
  for (let x = 0; x < SCENE_W; x++) sines.x[x] = Math.sin(x * 0.21 + k)
  for (let y = 0; y < SCENE_H; y++) sines.y[y] = Math.sin(y * 0.33 - k * 0.8)
  for (let i = 0; i < sines.mix.length; i++)
    sines.mix[i] = Math.sin(i * 0.13 + k * 0.5)
  const a = isDarkTime(m.time) ? 0.3 : 0.12
  for (let y = 0; y < FLOOR_TOP; y++) {
    for (let x = 0; x < SCENE_W; x++) {
      const v = sines.x[x] + sines.y[y] + sines.mix[x + Math.round(y * 0.6)]
      if (v > 1.7 && !subject.data[y * SCENE_W + x])
        blend(buf, x, y, FX.water, a)
    }
  }
}

const STARS = (() => {
  let n = 4242
  const next = () => (n = (n * 16807) % 2147483647) / 2147483647
  const out: {
    r: number
    a: number
    twinkle: number
    bright: boolean
    warm: boolean
  }[] = []
  for (let i = 0; i < 420; i++) {
    const band = i % 2 === 0
    const r = 6 + Math.pow(next(), 0.6) * 130
    const side = next() < 0.28 ? -0.3 : -0.3 + Math.PI
    const a = band ? side + (next() - 0.5) * 0.34 : next() * Math.PI * 2
    out.push({
      r,
      a,
      twinkle: next() * 6,
      bright: next() < 0.16,
      warm: next() < 0.2,
    })
  }
  return out
})()

const WATER_U = 15

const LANDING_D = 5

const SPLASH_MS = 800

const SPLASH_GRAVITY = 0.00012

const SPLASH_DROPS = [
  [-0.012, 0.06],
  [-0.008, 0.07],
  [-0.004, 0.074],
  [0, 0.068],
  [0.004, 0.073],
  [0.008, 0.066],
  [0.012, 0.056],
  [-0.016, 0.044],
  [0.016, 0.046],
  [-0.002, 0.05],
] as const

function drawFishSplash(buf: PixelBuffer, m: HatMoment, place: HatFxPlace) {
  const age = m.tMs - m.coinsMs - FISH_JUMP_MS
  if (age < 0 || age >= SPLASH_MS) return
  const fade = Math.min(1, (1 - age / SPLASH_MS) * 2)
  for (const [vd, vu] of SPLASH_DROPS) {
    const u = WATER_U + vu * age - SPLASH_GRAVITY * age * age
    if (u < WATER_U) continue
    const [x, y] = at(place, LANDING_D + vd * age, u)
    blend(buf, x, y, FX.white, fade)
    blend(buf, x, y + 1, FX.drop, fade)
  }
  const reach = 1.5 + (age / SPLASH_MS) * 6
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const d = LANDING_D + side * (reach - i)
      if (Math.abs(d) > 9) continue
      const [x, y] = at(place, d, WATER_U)
      blend(buf, x, y, FX.white, fade * (1 - i * 0.3))
    }
  }
}

const METEORS = [
  [150, 18],
  [120, 14],
  [165, 26],
] as const

const METEOR_MS = 700

const SKY_CENTRE = [PET_X + SPRITE_SIZE / 2, 43] as const

function drawStars(
  buf: PixelBuffer,
  m: HatMoment,
  dim: number,
  subject: PixelMask
) {
  const [cx, cy] = SKY_CENTRE
  const turn = Math.sin(m.tMs * 0.00011) * 0.3
  const onWall = (x: number, y: number) => {
    const ix = Math.round(x)
    const iy = Math.round(y)
    return (
      ix >= 0 &&
      iy >= 0 &&
      ix < SCENE_W &&
      iy < FLOOR_TOP &&
      !subject.data[iy * SCENE_W + ix]
    )
  }
  for (const star of STARS) {
    const a = star.a + turn
    const x = cx + star.r * Math.cos(a) * 1.25
    const y = cy + star.r * Math.sin(a) * 0.9
    if (!onWall(x, y)) continue
    const glow = 0.55 + 0.45 * Math.sin(m.tMs * 0.002 + star.twinkle)
    const c = star.warm ? FX.starWarm : FX.star
    blend(buf, x, y, c, dim * glow)
    if (star.bright && glow > 0.7)
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ])
        if (onWall(x + dx, y + dy)) blend(buf, x + dx, y + dy, c, dim * 0.45)
  }
  const sinceCoins = m.tMs - m.coinsMs
  const meteors = [
    m.tMs % 6500,
    sinceCoins >= 0 ? sinceCoins : Infinity,
    sinceCoins >= 200 ? sinceCoins - 200 : Infinity,
  ]
  meteors.forEach((age, i) => {
    if (age >= METEOR_MS) return
    const p = age / METEOR_MS
    const x = METEORS[i][0] - p * 72
    const y = METEORS[i][1] + p * 26
    for (let j = 0; j < 7; j++) {
      const px = x + j * 2.6
      const py = y - j
      if (onWall(px, py))
        blend(buf, px, py, FX.white, dim * (1 - j / 7) * (1 - p * 0.4))
    }
  })
}

function drawPuffs(
  buf: PixelBuffer,
  tMs: number,
  count: number,
  lifeMs: number,
  c: number,
  size: number,
  origin: (bornMs: number) => readonly [number, number] | null
) {
  for (let i = 0; i < count; i++) {
    const age = (tMs + (i * lifeMs) / count) % lifeMs
    const start = origin(tMs - age)
    if (!start) continue
    const p = age / lifeMs
    square(
      buf,
      Math.round(start[0] + age * 0.008),
      Math.round(start[1] - age * 0.012),
      size,
      c,
      Math.min(1, (1 - p) * 1.4)
    )
  }
}

function drawFallingLeaves(buf: PixelBuffer, m: HatMoment, place: HatFxPlace) {
  if (m.growth < 2 || m.season === 'winter') return
  const c =
    m.season === 'spring'
      ? FX.petal
      : m.season === 'autumn'
        ? FX.leafAmber
        : FX.leafGreen
  const lifeMs = 3600
  for (let i = 0; i < 3; i++) {
    const age = (m.tMs + (i * lifeMs) / 3) % lifeMs
    const round = Math.floor((m.tMs + (i * lifeMs) / 3) / lifeMs)
    const d = ((round * 37 + i * 11) % 17) - 8
    const [x, y] = at(place, d, m.growth >= 4 ? 20 : 15)
    const fall = Math.min(age * 0.016, 86 - y)
    blend(
      buf,
      x + Math.sin(age * 0.004 + i) * 2,
      y + fall,
      c,
      Math.min(1, (1 - age / lifeMs) * 1.6)
    )
  }
}

const FIG_DROP_MS = 3400

function drawFigDrop(buf: PixelBuffer, m: HatMoment, place: HatFxPlace) {
  const since = m.tMs - m.patMs
  if (since < 0 || m.growth < 4 || m.season === 'winter') return
  if (since < BIRD_AWAY_MS) {
    const [bx, by] = at(
      place,
      2 + since * 0.02,
      birdPerch(m)[1] + 1 + since * 0.014
    )
    const flap = Math.floor(since / 120) % 2
    blend(buf, bx - 1, by - flap, FX.bird, 1)
    blend(buf, bx, by, FX.bird, 1)
    blend(buf, bx + 1, by - flap, FX.bird, 1)
  }
  if (since >= FIG_DROP_MS) return
  const [x0, y0] = at(place, 6, 18)
  const floor = 86
  const gravity = 0.00011
  const fallMs = Math.sqrt((2 * Math.max(1, floor - y0)) / gravity)
  const fade = Math.min(1, (1 - since / FIG_DROP_MS) * 2)
  if (m.season === 'spring') {
    for (let i = 0; i < 6; i++)
      blend(
        buf,
        x0 - i * 2 + Math.sin(since * 0.004 + i) * 2,
        Math.min(y0 + since * (0.012 + i * 0.002), floor),
        FX.petal,
        fade
      )
    return
  }
  let y = y0 + 0.5 * gravity * since * since
  let x = x0 + since * 0.012
  if (since > fallMs) {
    const bounce = since - fallMs
    const hop = Math.max(0, bounce * 0.018 - 0.5 * gravity * bounce * bounce)
    y = floor - hop
    x = x0 + fallMs * 0.012 + bounce * 0.024
  }
  square(buf, Math.round(x), Math.round(y), 2, FX.fig, fade)
}

function drawWeather(buf: PixelBuffer, m: HatMoment, place: HatFxPlace) {
  const snowing = m.season === 'winter'
  const sincePat = m.tMs - m.patMs
  const heavy = sincePat >= 0 && sincePat < 1600
  const count = snowing ? 7 : heavy ? 14 : 8
  const lifeMs = snowing ? 2600 : 900
  const [, topY] = at(place, 0, 8)
  const floor = topY + 36
  for (let i = 0; i < count; i++) {
    const age = (m.tMs + (i * lifeMs) / count) % lifeMs
    const round = Math.floor((m.tMs + (i * lifeMs) / count) / lifeMs)
    const d = ((round * 23 + i * 13) % 17) - 8
    const [x] = at(place, d, 8)
    const y = topY + (age / lifeMs) * (floor - topY)
    const wob = snowing ? Math.sin(age * 0.005 + i) * 1.4 : 0
    blend(buf, x + wob, y, snowing ? FX.snow : FX.rain, snowing ? 0.95 : 0.85)
    if (!snowing) blend(buf, x, y - 1, FX.rain, 0.55)
  }
}

const SPOTS_PER_ROW = 8

const SPOT_R = 4.5

function drawFairLights(
  buf: PixelBuffer,
  m: HatMoment,
  place: HatFxPlace,
  dim: number,
  subject: PixelMask
) {
  const sinceCoins = m.tMs - m.coinsMs
  const boost = sinceCoins >= 0 && sinceCoins < 1600 ? 1.5 : 1
  for (const bulb of carouselBulbs(m)) {
    if (!bulb.lit) continue
    const [x, y] = at(place, bulb.d, bulb.u)
    glow(buf, x, y, 3, bulb.c, (0.15 + 0.45 * dim) * boost)
  }
  if (dim <= 0.02) return
  const span = SCENE_W + 24
  const slide = carouselAngle(m.tMs, m.patMs) * 24 * (place.flip ? -1 : 1)
  for (let row = 0; row < 2; row++) {
    for (let k = 0; k < SPOTS_PER_ROW; k++) {
      const cx =
        wrapTo(slide + ((k + row / 2) * span) / SPOTS_PER_ROW, span) - 12
      const cy = (row ? 34 : 15) + 3 * Math.sin(cx * 0.045 + row * 2)
      const c = SPOT_COLORS[(k + row * 3) % SPOT_COLORS.length]
      const strength = Math.min(1, 0.55 * dim * boost)
      for (let y = Math.floor(cy - SPOT_R); y <= cy + SPOT_R; y++) {
        if (y < 0 || y >= FLOOR_TOP) continue
        for (let x = Math.floor(cx - SPOT_R); x <= cx + SPOT_R; x++) {
          if (x < 0 || x >= SCENE_W || subject.data[y * SCENE_W + x]) continue
          const r = Math.hypot(x - cx, (y - cy) * 1.2) / SPOT_R
          if (r < 1) blend(buf, x, y, c, strength * (1 - r * r))
        }
      }
    }
  }
}

const wrapTo = (v: number, n: number) => ((v % n) + n) % n

const NOTE = [
  [1, 0],
  [2, 0],
  [1, 1],
  [3, 1],
  [1, 2],
  [0, 3],
  [1, 3],
  [0, 4],
  [1, 4],
] as const

const NOTE_MS = 1700

const NOTE_STAGGER_MS = 300

function drawNotes(buf: PixelBuffer, m: HatMoment, place: HatFxPlace) {
  const since = m.tMs - m.patMs
  const colors = [NOTE_COLORS.a, NOTE_COLORS.b, NOTE_COLORS.c]
  colors.forEach((c, i) => {
    const age = since - i * NOTE_STAGGER_MS
    if (age < 0 || age >= NOTE_MS) return
    const p = age / NOTE_MS
    const side = i === 1 ? -1 : 1
    const [x0, y0] = at(
      place,
      side * (11 + p * 10) + Math.sin(age * 0.008 + i) * 1.5,
      18 + i * 2 + p * 16
    )
    const a = Math.min(1, (1 - p) * 3)
    for (const [dx, dy] of NOTE)
      blend(buf, Math.round(x0) + dx, Math.round(y0) + dy, c, a)
  })
}

const COIN_HATS: ReadonlySet<BigHatId> = new Set([
  'mailbox',
  'bowl',
  'carousel',
  'train',
  'dome',
  'fig',
])

const COIN_TOSS = { count: 5, staggerMs: 100, flightMs: 900 }

export const COIN_TOSS_MS =
  (COIN_TOSS.count - 1) * COIN_TOSS.staggerMs + COIN_TOSS.flightMs

function drawCoinToss(buf: PixelBuffer, m: HatMoment, place: HatFxPlace) {
  const since = m.tMs - m.coinsMs
  if (since < 0 || since >= COIN_TOSS_MS) return
  for (let i = 0; i < COIN_TOSS.count; i++) {
    const age = since - i * COIN_TOSS.staggerMs
    if (age < 0 || age >= COIN_TOSS.flightMs) continue
    const p = age / COIN_TOSS.flightMs
    const side = i - (COIN_TOSS.count - 1) / 2
    const [cx, cy] = at(place, side * (3 + 4 * p), 4 + 48 * p * (1 - p))
    const x = Math.round(cx)
    const y = Math.round(cy)
    const a = Math.min(1, (1 - p) * 4)
    square(buf, x - 1, y - 1, 3, FX.coinDark, a)
    blend(buf, x, y - 2, FX.coinDark, a)
    blend(buf, x, y + 2, FX.coinDark, a)
    blend(buf, x - 2, y, FX.coinDark, a)
    blend(buf, x + 2, y, FX.coinDark, a)
    blend(buf, x, y - 1, FX.coin, a)
    blend(buf, x, y + 1, FX.coin, a)
    blend(buf, x - 1, y, FX.coin, a)
    blend(buf, x + 1, y, FX.coin, a)
    blend(buf, x, y, FX.coinLight, a)
  }
}

export function drawHatRoom(
  buf: PixelBuffer,
  hat: BigHatId,
  m: HatMoment,
  place: HatFxPlace,
  subject: PixelMask,
  roomDim = 0
): void {
  const dim = hatRoomDim(hat, m)
  const dark = Math.max(dim, roomDim)
  if (dark > 0) darken(buf, dark)
  switch (hat) {
    case 'bowl':
      drawWaterLight(buf, m, subject)
      drawFishSplash(buf, m, place)
      break
    case 'dome':
      if (dim > 0.02) drawStars(buf, m, dim, subject)
      break
    case 'carousel':
      drawFairLights(buf, m, place, dim, subject)
      drawNotes(buf, m, place)
      break
    case 'cottage':
      if (isDarkTime(m.time)) {
        for (const [d, u] of [
          [-6.2, 5.6],
          [3.4, 5.6],
        ]) {
          const [x, y] = at(place, place.flip ? d + 2.8 : d, u)
          square(buf, x - 1, y - 1, 5, FX.window, 0.25)
          square(buf, x, y, 3, FX.window, 1)
        }
      }
      drawPuffs(buf, m.tMs, 4, 2200, FX.smoke, 2, () => at(place, 4.9, 17.6))
      break
    case 'train':
      drawPuffs(buf, m.tMs, 5, 1700, FX.steam, 2, (bornMs) => {
        const { d, u, near } = trainSpot(trainAngle(bornMs, m.patMs))
        if (near < 0 && Math.abs(d) < 7) return null
        return at(place, d + (near > 0 ? -2.5 : 2.5), u + 9)
      })
      break
    case 'fig': {
      drawFallingLeaves(buf, m, place)
      drawFigDrop(buf, m, place)
      const age = m.tMs - Math.max(m.coinsMs, m.growMs ?? -Infinity)
      if (age >= 0 && age < 900) {
        for (let i = 0; i < 8; i++) {
          const [x, y] = at(
            place,
            ((i * 37) % 15) - 7,
            12 + ((i * 19) % 12) + age * 0.012
          )
          blend(buf, x, y, FX.sprout, 1 - age / 900)
        }
      }
      break
    }
    case 'cloud':
      drawWeather(buf, m, place)
      break
    default:
  }
  if (COIN_HATS.has(hat)) drawCoinToss(buf, m, place)
}
