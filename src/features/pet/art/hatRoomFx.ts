import { rgbPalette, type PixelBuffer, type PixelMask } from '@/lib/pixelArt'
import type { BigHatId } from '@/types/pet'

import { bigHatPoint } from './hatCanvas'
import {
  BIRD_AWAY_MS,
  birdPerch,
  FISH_JUMP_MS,
  hatRoomDim,
  isDarkTime,
  trainAngle,
  trainSpot,
  type HatMoment,
} from './hatsLive'
import { SCENE_H, SCENE_W } from './layout'
import { FLOOR_TOP } from './room/floor'

export type HatFxPlace = {
  readonly x: number
  readonly y: number
  readonly flip: boolean
}

const FX = rgbPalette({
  beam: '#fff0ae',
  glow: '#fff6cf',
  gull: '#fbf6ea',
  star: '#e4ecff',
  starWarm: '#ffe7b0',
  white: '#ffffff',
  water: '#c6ecff',
  splash: '#a8dcf5',
  smoke: '#d9d3c7',
  steam: '#eee9dd',
  window: '#ffd45c',
  coin: '#f1b92e',
  rain: '#7cb9e8',
  snow: '#ffffff',
  fig: '#6d3a78',
  bird: '#6b4a33',
  petal: '#ffd3e0',
  leafGreen: '#6fb24e',
  leafAmber: '#d98f2e',
  sprout: '#b8ec7c',
})

function blend(
  buf: PixelBuffer,
  px: number,
  py: number,
  c: number,
  a: number
): void {
  const x = Math.round(px)
  const y = Math.round(py)
  if (x < 0 || y < 0 || x >= buf.width || y >= buf.height || a <= 0) return
  const k = (y * buf.width + x) * 4
  const d = buf.data
  const v = Math.min(1, a)
  d[k] += (((c >> 16) & 255) - d[k]) * v
  d[k + 1] += (((c >> 8) & 255) - d[k + 1]) * v
  d[k + 2] += ((c & 255) - d[k + 2]) * v
}

function square(
  buf: PixelBuffer,
  x: number,
  y: number,
  size: number,
  c: number,
  a: number
) {
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) blend(buf, x + i, y + j, c, a)
}

const at = (place: HatFxPlace, d: number, u: number): [number, number] => {
  const [x, y] = bigHatPoint(place.flip ? -d : d, u)
  return [place.x + x, place.y + y]
}

function darken(buf: PixelBuffer, amount: number) {
  const r = 1 - 0.45 * amount
  const b = 1 - 0.34 * amount
  const d = buf.data
  for (let k = 0; k < d.length; k += 4) {
    d[k] *= r
    d[k + 1] *= r
    d[k + 2] *= b
  }
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

const METEORS = [
  [150, 18],
  [120, 14],
  [165, 26],
] as const

const METEOR_MS = 700

function drawStars(
  buf: PixelBuffer,
  m: HatMoment,
  place: HatFxPlace,
  dim: number,
  subject: PixelMask
) {
  const [cx, cy] = at(place, 0, 15)
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

function drawBeam(
  buf: PixelBuffer,
  m: HatMoment,
  place: HatFxPlace,
  dim: number
) {
  const [lx, ly] = at(place, 0, 21.5)
  const turn = m.tMs * 0.0011
  const cos = Math.cos(turn)
  const front = Math.sin(turn) > 0
  const strength = (0.05 + 0.3 * dim) * (front ? 1 : 0.55)
  if (Math.abs(cos) > 0.08) {
    const reach = 170 * Math.abs(cos)
    const dir = cos >= 0 ? 1 : -1
    for (let i = 2; i < reach; i++) {
      const half = Math.round(1.5 + i * 0.15)
      const centre = Math.round(ly + i * 0.2)
      const a = strength * (1 - i / 190)
      for (let y = centre - half; y < centre + half; y++)
        blend(buf, lx + dir * i, y, FX.beam, a)
    }
  }
  const sincePat = m.tMs - m.patMs
  const sinceCoins = m.tMs - m.coinsMs
  const flash = Math.max(
    front && Math.abs(cos) < 0.12 ? 0.5 : 0,
    sincePat >= 0 && sincePat < 700 && Math.floor(sincePat / 200) % 2 === 0
      ? 1
      : 0,
    sinceCoins >= 0 && sinceCoins < 220 ? 1 : 0
  )
  if (flash > 0) {
    const a = (0.08 + 0.2 * dim) * flash
    for (let y = 0; y < SCENE_H; y++)
      for (let x = 0; x < SCENE_W; x++) blend(buf, x, y, FX.glow, a)
  }
  square(buf, lx - 2, ly - 2, 5, FX.glow, 0.35 + 0.4 * dim)
  if (dim < 0.5) {
    const a = 1 - dim * 2
    ;[0, 2.2].forEach((phase, i) => {
      const th = m.tMs * 0.0009 + phase
      const x = lx + 22 * Math.cos(th)
      const y = ly - 6 + 7 * Math.sin(th)
      const flap = Math.floor(m.tMs / 180 + i) % 2
      blend(buf, x - 1, y - flap, FX.gull, a)
      blend(buf, x, y, FX.gull, a)
      blend(buf, x + 1, y - flap, FX.gull, a)
    })
  }
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

export function drawHatRoom(
  buf: PixelBuffer,
  hat: BigHatId,
  m: HatMoment,
  place: HatFxPlace,
  subject: PixelMask
): void {
  const dim = hatRoomDim(hat, m)
  if (dim > 0) darken(buf, dim)
  switch (hat) {
    case 'bowl': {
      drawWaterLight(buf, m, subject)
      const jump = m.tMs - m.coinsMs
      if (jump >= FISH_JUMP_MS * 0.8 && jump < FISH_JUMP_MS + 500) {
        const age = jump - FISH_JUMP_MS * 0.8
        const [x, y] = at(place, 2, 20)
        for (let i = -3; i <= 3; i++)
          blend(
            buf,
            x + i * age * 0.012,
            y - age * 0.02 + 0.00012 * age * age,
            FX.splash,
            1 - age / 780
          )
      }
      break
    }
    case 'lighthouse':
      drawBeam(buf, m, place, dim)
      break
    case 'dome':
      if (dim > 0.02) drawStars(buf, m, place, dim, subject)
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
      if (m.tMs - m.coinsMs >= 0 && m.tMs - m.coinsMs < 700) {
        const age = m.tMs - m.coinsMs
        for (let i = -3; i <= 3; i++) {
          const [x, y] = at(place, i * 2, 12 + age * 0.012)
          blend(buf, x, y, FX.coin, 1 - age / 700)
        }
      }
      break
    case 'fig':
      drawFallingLeaves(buf, m, place)
      drawFigDrop(buf, m, place)
      if (m.tMs - m.coinsMs >= 0 && m.tMs - m.coinsMs < 900) {
        const age = m.tMs - m.coinsMs
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
    case 'cloud':
      drawWeather(buf, m, place)
      break
    default:
  }
}
