import {
  plot,
  rgbPalette,
  type PixelBuffer,
  type PixelMask,
  type Rgb,
} from '@/lib/pixelArt'
import type { BedId } from '@/types/pet'

import { blend, glow } from '../fx'
import { GARDEN_BUDS, isBedWater, leafPileTop, type WaterBed } from './bed'
import {
  sinceCoins,
  sincePat,
  within,
  type RoomLiveSet,
  type RoomMoment,
} from './live'

const C = rgbPalette({
  leafA: '#eeb03c',
  leafAShade: '#c9602a',
  leafB: '#c94a2c',
  leafBShade: '#7a2f1a',
  poolLight: '#c9f0fa',
  poolMid: '#8fd8f0',
  boatHull: '#2f5596',
  boatHullDark: '#1d3767',
  boatFlag: '#e8483c',
  boatSail: '#fdfbf2',
  boatSailShade: '#d5dbe2',
  boatMast: '#6b4a33',
  boatWake: '#3a9fcc',
  springLight: '#e2f9f2',
  springMid: '#b0e6da',
  steam: '#ffffff',
  drop: '#d9f6f0',
  dropLight: '#ffffff',
  gold: '#f1b92e',
  goldLight: '#fff0a8',
  goldDark: '#a8721a',
  petal: '#f08db0',
  petalLight: '#ffd0e0',
  petalWhite: '#fff6f8',
  body: '#2f2420',
  wingYellow: '#ffd83d',
  wingYellowEdge: '#c9781a',
  wingBlue: '#7fb2f5',
  wingBlueEdge: '#2f5fb0',
  wingOrange: '#f28a2e',
  wingOrangeEdge: '#3a2a20',
})

const wrap = (t: number, period: number): number =>
  ((t % period) + period) % period

interface FallingLeaf {
  readonly x: number
  readonly period: number
  readonly offset: number
  readonly phase: number
  readonly tone: Rgb
  readonly shade: Rgb
}

const FALLING: readonly FallingLeaf[] = [
  {
    x: 44,
    period: 6400,
    offset: 4700,
    phase: 0.4,
    tone: C.leafA,
    shade: C.leafAShade,
  },
  {
    x: 92,
    period: 8200,
    offset: 2500,
    phase: 2.2,
    tone: C.leafB,
    shade: C.leafBShade,
  },
]

function drawFallingLeaves(layer: PixelBuffer, m: RoomMoment): void {
  for (const leaf of FALLING) {
    const t = m.tMs + leaf.offset
    const round = Math.floor(t / leaf.period)
    const age = t - round * leaf.period
    const p = age / leaf.period
    const home = leaf.x + ((((round * 7) % 5) + 5) % 5) - 2
    const land = leafPileTop(home) + 1
    const x = Math.round(
      home + Math.sin(age * 0.0019 + leaf.phase) * 6 * (1 - p * p)
    )
    const y = Math.round(-3 + (land + 3) * p)
    if (Math.floor(age / 320) % 2 === 0) {
      plot(layer, x, y, leaf.tone)
      plot(layer, x + 1, y, leaf.tone)
      plot(layer, x + 1, y + 1, leaf.shade)
      plot(layer, x + 2, y + 1, leaf.tone)
    } else {
      plot(layer, x + 1, y, leaf.tone)
      plot(layer, x + 2, y, leaf.tone)
      plot(layer, x + 1, y + 1, leaf.shade)
      plot(layer, x, y + 1, leaf.tone)
    }
  }
}

interface Rings {
  readonly bed: WaterBed
  readonly cy: number
  readonly cut: number
  readonly reach: number
  readonly period: number
  readonly light: Rgb
  readonly mid: Rgb
}

function drawRing(
  target: PixelBuffer,
  rings: Rings,
  p: number,
  front: boolean,
  seed: number
): void {
  if (p < 0 || p >= 0.92) return
  const rx = 9 + p * (rings.reach - 9)
  const ry = rx * 0.15 + 0.5
  const tone = p < 0.5 ? rings.light : rings.mid
  for (let x = Math.ceil(68 - rx); x <= 68 + rx; x++) {
    if ((((x * 7 + seed * 3) % 5) + 5) % 5 >= 3) continue
    const a = (x + 0.5 - 68) / rx
    const s = ry * Math.sqrt(Math.max(0, 1 - a * a))
    for (const side of [-1, 1]) {
      const y = Math.round(rings.cy + side * s - 0.5)
      if (y >= rings.cut !== front) continue
      if (isBedWater(rings.bed, x, y)) plot(target, x, y, tone)
    }
  }
}

function drawRings(
  target: PixelBuffer,
  m: RoomMoment,
  rings: Rings,
  front: boolean
): void {
  for (let k = 0; k < 2; k++) {
    const age = wrap(m.tMs + (k * rings.period) / 2, rings.period)
    drawRing(target, rings, age / rings.period, front, k)
  }
}

const POOL_RINGS: Rings = {
  bed: 'pool',
  cy: 81,
  cut: 81,
  reach: 26,
  period: 2800,
  light: C.poolLight,
  mid: C.poolMid,
}

const SPRING_RINGS: Rings = {
  bed: 'hotspring',
  cy: 81,
  cut: 82,
  reach: 25,
  period: 3400,
  light: C.springLight,
  mid: C.springMid,
}

const BOAT = [
  '...f...',
  '...w...',
  '...ws..',
  '...wws.',
  '...wwws',
  '...m...',
  'hhhhhhh',
  '.ddddd.',
]

const BOAT_TONES: Readonly<Record<string, Rgb>> = {
  f: C.boatFlag,
  w: C.boatSail,
  s: C.boatSailShade,
  m: C.boatMast,
  h: C.boatHull,
  d: C.boatHullDark,
}

function drawBoat(buf: PixelBuffer, m: RoomMoment): void {
  const bob = Math.round(Math.sin(m.tMs / 520) * 0.9)
  const x = 46 + Math.round(Math.sin(m.tMs / 2300) * 1.2)
  const y = 73 + bob
  BOAT.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const tone = BOAT_TONES[row[i]]
      if (tone !== undefined) plot(buf, x + i, y + j, tone)
    }
  })
  if (bob <= 0) {
    for (let i = 1; i < 6; i++)
      if (isBedWater('pool', x + i, y + 8)) plot(buf, x + i, y + 8, C.boatWake)
  }
}

function puff(
  buf: PixelBuffer,
  cx: number,
  cy: number,
  r: number,
  a: number,
  subject: PixelMask
): void {
  const x0 = Math.max(0, Math.floor(cx - r))
  const x1 = Math.min(buf.width - 1, Math.ceil(cx + r))
  const y0 = Math.max(0, Math.floor(cy - r))
  const y1 = Math.min(buf.height - 1, Math.ceil(cy + r))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r
      if (d >= 1) continue
      const pet = subject.data[y * subject.width + x] ? 0.4 : 1
      blend(buf, x, y, C.steam, a * (1 - d * d) * pet)
    }
  }
}

const STEAM_COUNT = 8
const STEAM_LIFE_MS = 4600
const BURST_COUNT = 6
const BURST_LIFE_MS = 2000

function drawSteam(buf: PixelBuffer, m: RoomMoment, subject: PixelMask): void {
  for (let i = 0; i < STEAM_COUNT; i++) {
    const t = m.tMs + (i * STEAM_LIFE_MS) / STEAM_COUNT
    const round = Math.floor(t / STEAM_LIFE_MS)
    const age = t - round * STEAM_LIFE_MS
    const p = age / STEAM_LIFE_MS
    const pick = (((round * 13 + i * 7) % 17) + 17) % 17
    const side = (i + round) % 2 === 0 ? 1 : -1
    const x0 = 68 + side * (7 + pick)
    const x = x0 + Math.sin(age * 0.0012 + i) * 3 + p * 5
    const y = 79 - p * 36
    puff(
      buf,
      Math.round(x),
      Math.round(y),
      1.8 + p * 4.2,
      0.62 * Math.sin(Math.PI * p) ** 0.8,
      subject
    )
  }
  const since = sincePat(m)
  if (!within(since, BURST_LIFE_MS + 400)) return
  for (let i = 0; i < BURST_COUNT; i++) {
    const age = since - i * 70
    if (age < 0 || age >= BURST_LIFE_MS) continue
    const p = age / BURST_LIFE_MS
    const x =
      68 + (i - (BURST_COUNT - 1) / 2) * 7 + Math.sin(age * 0.002 + i) * 2
    const y = 76 - (1 - (1 - p) * (1 - p)) * 30
    puff(buf, Math.round(x), Math.round(y), 2 + p * 3.5, 0.6 * (1 - p), subject)
  }
}

const DROPS = 12
const DROP_MS = 1300
const DROP_GRAVITY = 0.00017

function drawSplash(layer: PixelBuffer, m: RoomMoment): void {
  const since = sincePat(m)
  if (!within(since, DROP_MS)) return
  if (since < 240) {
    for (let x = 57; x <= 79; x++) {
      if ((x + Math.floor(since / 80)) % 3 === 0) continue
      const rise = since < 120 ? 1 : 2
      plot(layer, x, 81 - (x % 2 ? rise : 0), C.dropLight)
    }
  }
  for (let i = 0; i < DROPS; i++) {
    const lane = i - (DROPS - 1) / 2
    const vx = lane * 0.0052
    const vy = -(0.055 + ((i * 37) % 5) * 0.0065)
    const x = 68 + lane * 1.8 + vx * since
    const y = 81 + vy * since + 0.5 * DROP_GRAVITY * since * since
    if (y > 82) continue
    const tone = i % 3 === 0 ? C.dropLight : C.drop
    plot(layer, x, y, tone)
    if (i % 2 === 0) plot(layer, x + 1, y, C.dropLight)
    if (since < 480) plot(layer, x - vx * 40, y + 1, C.drop)
  }
}

const BUBBLES = 10
const BUBBLE_MS = 1500
const BUBBLE_GAP_MS = 100
const COINS_MS = BUBBLE_MS + BUBBLES * BUBBLE_GAP_MS

function drawGoldBubbles(
  buf: PixelBuffer,
  m: RoomMoment,
  subject: PixelMask
): void {
  const since = sinceCoins(m)
  if (!within(since, COINS_MS)) return
  const fade = Math.min(1, since / 200, (COINS_MS - since) / 500)
  const tick = Math.floor(since / 150)
  for (let y = 76; y <= 85; y++) {
    for (let x = 42; x <= 94; x++) {
      if ((x * 13 + y * 29 + tick * 7) % 11 !== 0) continue
      if (!isBedWater('hotspring', x, y)) continue
      if (subject.data[y * subject.width + x]) continue
      blend(buf, x, y, C.goldLight, 0.8 * fade)
    }
  }
  for (let i = 0; i < BUBBLES; i++) {
    const age = since - i * BUBBLE_GAP_MS
    if (age < 0 || age >= BUBBLE_MS) continue
    const p = age / BUBBLE_MS
    const x0 = 68 + ((i * 29) % 49) - 24
    const x = Math.round(x0 + Math.sin(age * 0.004 + i) * 1.5)
    const y = Math.round(80 - (1 - (1 - p) * (1 - p)) * (18 + ((i * 13) % 20)))
    if (age > BUBBLE_MS - 170) {
      for (const [dx, dy] of [
        [-2, -2],
        [2, -2],
        [-2, 2],
        [2, 2],
        [0, 0],
      ])
        blend(buf, x + dx, y + dy, C.goldLight, 0.95)
      continue
    }
    if (i % 3 === 0) {
      blend(buf, x, y - 1, C.gold, 1)
      blend(buf, x - 1, y, C.gold, 1)
      blend(buf, x + 1, y, C.goldDark, 1)
      blend(buf, x, y + 1, C.goldDark, 1)
      blend(buf, x, y, C.goldLight, 1)
      continue
    }
    for (const [dx, dy, tone] of BUBBLE_RING)
      blend(buf, x + dx, y + dy, tone, 1)
  }
}

const BUBBLE_RING: readonly (readonly [number, number, Rgb])[] = [
  [-1, -2, C.gold],
  [0, -2, C.gold],
  [1, -2, C.gold],
  [-2, -1, C.gold],
  [-2, 0, C.gold],
  [-2, 1, C.gold],
  [2, -1, C.goldDark],
  [2, 0, C.goldDark],
  [2, 1, C.goldDark],
  [-1, 2, C.goldDark],
  [0, 2, C.goldDark],
  [1, 2, C.goldDark],
  [-1, -1, C.goldLight],
  [0, -1, C.goldLight],
  [-1, 0, C.goldLight],
]

interface Butterfly {
  readonly cx: number
  readonly cy: number
  readonly rx: number
  readonly ry: number
  readonly wx: number
  readonly wy: number
  readonly px: number
  readonly py: number
  readonly flapMs: number
  readonly wing: Rgb
  readonly edge: Rgb
}

const BUTTERFLIES: readonly Butterfly[] = [
  {
    cx: 43,
    cy: 59,
    rx: 11,
    ry: 8,
    wx: 0.00071,
    wy: 0.00113,
    px: 0.3,
    py: 1.1,
    flapMs: 130,
    wing: C.wingYellow,
    edge: C.wingYellowEdge,
  },
  {
    cx: 97,
    cy: 56,
    rx: 12,
    ry: 10,
    wx: 0.00059,
    wy: 0.00097,
    px: 2.1,
    py: 0.2,
    flapMs: 150,
    wing: C.wingBlue,
    edge: C.wingBlueEdge,
  },
  {
    cx: 70,
    cy: 34,
    rx: 46,
    ry: 11,
    wx: 0.00037,
    wy: 0.00089,
    px: 4,
    py: 2.6,
    flapMs: 140,
    wing: C.wingOrange,
    edge: C.wingOrangeEdge,
  },
]

const SCATTER_MS = 2800
const SCATTER_OUT_MS = 260

function scatter(since: number): number {
  if (!within(since, SCATTER_MS)) return 0
  if (since < SCATTER_OUT_MS) {
    const u = since / SCATTER_OUT_MS
    return 1 - (1 - u) * (1 - u)
  }
  const u = (since - SCATTER_OUT_MS) / (SCATTER_MS - SCATTER_OUT_MS)
  return 1 - u * u * (3 - 2 * u)
}

function drawButterflies(layer: PixelBuffer, m: RoomMoment): void {
  const since = sincePat(m)
  const away = scatter(since)
  BUTTERFLIES.forEach((b, i) => {
    let x =
      b.cx +
      b.rx * Math.sin(m.tMs * b.wx + b.px) +
      2 * Math.sin(m.tMs * b.wx * 3.1 + b.py)
    let y = b.cy + b.ry * Math.sin(m.tMs * b.wy + b.py)
    if (away > 0) {
      const dx = x - 68
      const dy = y - 66
      const len = Math.hypot(dx, dy) || 1
      const turn = away * 1.3 * (i % 2 ? 1 : -1)
      const cos = Math.cos(turn)
      const sin = Math.sin(turn)
      const reach = 26 * away
      x += ((dx * cos - dy * sin) / len) * reach
      y += ((dx * sin + dy * cos) / len) * reach * 0.7
    }
    const flapMs = away > 0.05 ? 70 : b.flapMs
    const flap = Math.floor((m.tMs + i * 90) / flapMs) % 4
    drawWings(
      layer,
      Math.max(4, Math.min(175, Math.round(x))),
      Math.max(9, Math.min(92, Math.round(y))) - (flap === 0 ? 1 : 0),
      flap,
      b.wing,
      b.edge
    )
  })
}

interface Flutter {
  readonly x: number
  readonly y: number
  readonly lean: number
  readonly wing: Rgb
  readonly edge: Rgb
}

const FLUTTERS: readonly Flutter[] = [
  { x: 49, y: 77, lean: -0.012, wing: C.petalWhite, edge: C.petal },
  { x: 60, y: 80, lean: -0.004, wing: C.wingYellow, edge: C.wingYellowEdge },
  { x: 77, y: 80, lean: 0.005, wing: C.wingBlue, edge: C.wingBlueEdge },
  { x: 89, y: 77, lean: 0.013, wing: C.petalLight, edge: C.petal },
]

const FLUTTER_MS = 3000

function drawWings(
  layer: PixelBuffer,
  px: number,
  py: number,
  flap: number,
  wing: Rgb,
  edge: Rgb
): void {
  if (flap === 2) {
    plot(layer, px, py - 2, edge)
    plot(layer, px, py - 1, wing)
    plot(layer, px + 1, py - 1, edge)
  } else {
    plot(layer, px - 1, py - 1, wing)
    plot(layer, px + 1, py - 1, wing)
    plot(layer, px - 1, py, wing)
    plot(layer, px + 1, py, wing)
    if (flap === 0) {
      plot(layer, px - 2, py - 2, edge)
      plot(layer, px + 2, py - 2, edge)
      plot(layer, px - 2, py - 1, wing)
      plot(layer, px + 2, py - 1, wing)
      plot(layer, px - 2, py, edge)
      plot(layer, px + 2, py, edge)
    } else {
      plot(layer, px - 1, py - 2, edge)
      plot(layer, px + 1, py - 2, edge)
    }
  }
  plot(layer, px, py, C.body)
  plot(layer, px, py - 1, C.body)
}

function drawFlutters(layer: PixelBuffer, m: RoomMoment): void {
  const since = sincePat(m)
  if (!within(since, FLUTTER_MS)) return
  FLUTTERS.forEach((f, i) => {
    const age = since - i * 90
    if (age < 0) return
    const x = f.x + f.lean * age + Math.sin(age * 0.006 + i * 2) * 3
    const y = f.y - age * 0.031 - Math.sin(age * 0.004 + i) * 2
    if (y < -3) return
    drawWings(
      layer,
      Math.round(x),
      Math.round(y),
      Math.floor((age + i * 40) / 70) % 4,
      f.wing,
      f.edge
    )
  })
}

const BLOOM_MS = 3000
const BLOOM_GAP_MS = 130

function bloomStage(since: number, i: number): 0 | 1 | 2 {
  const age = since - i * BLOOM_GAP_MS
  if (age < 0 || age >= BLOOM_MS) return 0
  return age < 140 || age >= BLOOM_MS - 260 ? 1 : 2
}

function drawBlooms(target: PixelBuffer, m: RoomMoment, front: boolean): void {
  const since = sinceCoins(m)
  if (!within(since, BLOOM_MS + GARDEN_BUDS.length * BLOOM_GAP_MS)) return
  GARDEN_BUDS.forEach(([x, y, inFront], i) => {
    if (inFront !== front) return
    const stage = bloomStage(since, i)
    if (stage === 0) return
    const cy = y - 1
    plot(target, x, cy - 1, C.petalLight)
    plot(target, x - 1, cy, C.petalLight)
    plot(target, x + 1, cy, C.petal)
    plot(target, x, cy + 1, C.petal)
    plot(target, x, cy, C.gold)
    if (stage === 1) return
    plot(target, x, cy - 2, C.petalWhite)
    plot(target, x - 2, cy, C.petalWhite)
    plot(target, x + 2, cy, C.petalLight)
    plot(target, x, cy + 2, C.petalLight)
    plot(target, x - 1, cy - 1, C.petalWhite)
    plot(target, x + 1, cy - 1, C.petalLight)
    plot(target, x - 1, cy + 1, C.petalLight)
    plot(target, x + 1, cy + 1, C.petal)
  })
}

const POLLEN = 7
const POLLEN_MS = 1500

function drawPollen(buf: PixelBuffer, m: RoomMoment): void {
  const since = sinceCoins(m)
  if (!within(since, BLOOM_MS)) return
  GARDEN_BUDS.forEach(([bx, by], i) => {
    const open = since - i * BLOOM_GAP_MS
    if (open < 0) return
    if (open < BLOOM_MS - 260)
      glow(buf, bx + 0.5, by - 0.5, 4.5, C.goldLight, 0.45)
    for (let j = 0; j < POLLEN; j++) {
      const age = open - 120 - j * 190
      if (age < 0 || age >= POLLEN_MS) continue
      const p = age / POLLEN_MS
      const x = Math.round(
        bx +
          (j - (POLLEN - 1) / 2) * 2.2 * p * 2 +
          Math.sin(age * 0.005 + j) * 1.2
      )
      const y = Math.round(by - 2 - p * (12 + j * 3))
      const a = Math.min(1, (1 - p) * 2)
      blend(buf, x, y, j % 2 ? C.gold : C.goldLight, a)
      if (j % 2 === 0 && p > 0.3 && p < 0.7) {
        blend(buf, x - 1, y, C.goldLight, a * 0.6)
        blend(buf, x + 1, y, C.goldLight, a * 0.6)
        blend(buf, x, y - 1, C.goldLight, a * 0.6)
        blend(buf, x, y + 1, C.goldLight, a * 0.6)
      }
    }
  })
}

export const BED_LIVE: RoomLiveSet<BedId> = {
  leafpile: {
    front: drawFallingLeaves,
  },
  pool: {
    back(buf, m) {
      drawRings(buf, m, POOL_RINGS, false)
      drawBoat(buf, m)
    },
    front(layer, m) {
      drawRings(layer, m, POOL_RINGS, true)
    },
  },
  hotspring: {
    back(buf, m) {
      drawRings(buf, m, SPRING_RINGS, false)
    },
    front(layer, m) {
      drawRings(layer, m, SPRING_RINGS, true)
      const since = sincePat(m)
      if (within(since, 900))
        drawRing(layer, SPRING_RINGS, 0.1 + (since / 900) * 0.8, true, 2)
      drawSplash(layer, m)
    },
    fx(buf, m, subject) {
      drawSteam(buf, m, subject)
      drawGoldBubbles(buf, m, subject)
    },
  },
  flowerbed: {
    back(buf, m) {
      drawBlooms(buf, m, false)
    },
    front(layer, m) {
      drawBlooms(layer, m, true)
      drawButterflies(layer, m)
      drawFlutters(layer, m)
    },
    fx(buf, m) {
      drawPollen(buf, m)
    },
  },
}
