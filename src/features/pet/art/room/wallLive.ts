import {
  createRng,
  mix,
  rgbPalette,
  setPixel,
  type PixelBuffer,
  type PixelMask,
  type Rgb,
} from '@/lib/pixelArt'
import type { WallColor, WallPattern } from '@/types/pet'

import { blend, isDarkTime, showStrength } from '../fx'
import { SCENE_W } from '../layout'
import { FLOOR_TOP } from './floor'
import {
  sinceCoins,
  sincePat,
  within,
  type RoomLiveSet,
  type RoomMoment,
} from './live'
import {
  MOUNTAIN_FAR,
  WALL_BOTTOM,
  WALL_RGB,
  WALL_TOP,
  wallTones,
} from './wall'

type Tones = ReturnType<typeof wallTones>

const tonesByColor = new Map<WallColor, Tones>()

function tonesOf(color: WallColor): Tones {
  let tones = tonesByColor.get(color)
  if (!tones) {
    tones = wallTones(WALL_RGB[color])
    tonesByColor.set(color, tones)
  }
  return tones
}

const mod = (n: number, m: number): number => ((n % m) + m) % m

const onWall = (open: PixelMask, x: number, y: number): boolean =>
  y >= WALL_TOP &&
  y < WALL_BOTTOM &&
  x >= 0 &&
  x < SCENE_W &&
  open.data[y * SCENE_W + x] === 1

function put(
  buf: PixelBuffer,
  open: PixelMask,
  px: number,
  py: number,
  c: Rgb
): void {
  const x = Math.round(px)
  const y = Math.round(py)
  if (onWall(open, x, y)) setPixel(buf, x, y, c)
}

function shine(
  buf: PixelBuffer,
  open: PixelMask,
  subject: PixelMask | null,
  px: number,
  py: number,
  c: Rgb,
  a: number
): void {
  const x = Math.round(px)
  const y = Math.round(py)
  if (!onWall(open, x, y)) return
  if (subject && subject.data[y * SCENE_W + x]) return
  blend(buf, x, y, c, a)
}

const CLOUD_BIG = [
  '.........hhhh...........',
  '.......hhxxxxhh.........',
  '....hhhxxxxxxxxh..hhh...',
  '...hxxxxxxxxxxxxhhxxxh..',
  '..hxxxxxxxxxxxxxxxxxxxh.',
  '.hxxxxxxxxxxxxxxxxxxxxxh',
  '.xxxxxxxxxxxxxxxxxxxxxxx',
  '..sxxxxxxxxxxxxxxxxxxxs.',
  '....sssssssssssssssss...',
] as const

const CLOUD_MID = [
  '.....hhhh.......',
  '...hhxxxxhhhh...',
  '..hxxxxxxxxxxh..',
  '.hxxxxxxxxxxxxh.',
  '.xxxxxxxxxxxxxx.',
  '..ssssssssssss..',
] as const

const CLOUD_SMALL = [
  '...hhh....',
  '.hhxxxhh..',
  'hxxxxxxxh.',
  '.sssssss..',
] as const

interface Cloud {
  readonly rows: readonly string[]
  readonly y: number
  readonly x0: number
  readonly speed: number
}

const CLOUD_SPAN = SCENE_W + 56

function drawCloud(
  buf: PixelBuffer,
  open: PixelMask,
  cloud: Cloud,
  tMs: number,
  tones: Tones
): void {
  const left =
    Math.floor(mod(cloud.x0 + 28 + (cloud.speed * tMs) / 1000, CLOUD_SPAN)) - 28
  for (let j = 0; j < cloud.rows.length; j++) {
    const row = cloud.rows[j]
    const y = cloud.y + j
    for (let i = 0; i < row.length; i++) {
      const cell = row[i]
      if (cell === '.') continue
      const x = left + i
      if (!onWall(open, x, y)) continue
      setPixel(
        buf,
        x,
        y,
        cell === 'h' ? tones.bright : cell === 's' ? tones.shade : tones.light
      )
    }
  }
}

const CLOUDS: readonly Cloud[] = [
  { rows: CLOUD_SMALL, y: 19, x0: 64, speed: 1.4 },
  { rows: CLOUD_SMALL, y: 11, x0: 146, speed: 1.2 },
  { rows: CLOUD_SMALL, y: 27, x0: 120, speed: 1.6 },
  { rows: CLOUD_SMALL, y: 45, x0: 122, speed: 1.3 },
  { rows: CLOUD_SMALL, y: 34, x0: 18, speed: 1.5 },
  { rows: CLOUD_MID, y: 14, x0: 108, speed: 2.1 },
  { rows: CLOUD_MID, y: 41, x0: 82, speed: 2.3 },
  { rows: CLOUD_MID, y: 28, x0: 164, speed: 2 },
  { rows: CLOUD_MID, y: 22, x0: 206, speed: 2.2 },
  { rows: CLOUD_BIG, y: 8, x0: 74, speed: 3 },
  { rows: CLOUD_BIG, y: 40, x0: 148, speed: 3.2 },
  { rows: CLOUD_BIG, y: 30, x0: 222, speed: 2.8 },
]

interface Leaf {
  readonly x: number
  readonly lifeMs: number
  readonly bornMs: number
  readonly sway: number
  readonly swayMs: number
  readonly drift: number
  readonly phase: number
}

const LEAVES: readonly Leaf[] = (() => {
  const r = createRng(733)
  return Array.from({ length: 16 }, (_, i) => {
    const lifeMs = 7000 + Math.floor(r() * 4500)
    return {
      x: (i * 180) / 16 + r() * 9,
      lifeMs,
      bornMs: Math.floor(r() * lifeMs),
      sway: 2.5 + r() * 3,
      swayMs: 1900 + r() * 1100,
      drift: (r() - 0.5) * 9,
      phase: r() * Math.PI * 2,
    }
  })
})()

const leafShape = (
  rows: readonly string[]
): readonly (readonly [number, number, 0 | 1])[] =>
  rows.flatMap((row, y) =>
    [...row].flatMap((cell, x) =>
      cell === '.'
        ? []
        : [[x - 1, y - 1, cell === 'v' ? 1 : 0] as [number, number, 0 | 1]]
    )
  )

const LEAF_SHAPES = {
  flat: leafShape(['.....', '.xxx.', 'xvvvx', '.xxx.']),
  right: leafShape(['...xx', '..xvx', '.xvx.', 'xx...']),
  left: leafShape(['xx...', 'xvx..', '.xvx.', '...xx']),
} as const

const WALL_ROWS = WALL_BOTTOM - WALL_TOP

const SKY = rgbPalette({
  sun: '#ffe9a0',
  sunCore: '#fff8d8',
  dawn: '#ffc98a',
  dusk: '#ff9f5a',
  moon: '#f4f1de',
  moonShade: '#cfd2d8',
  star: '#f2f4ff',
  gold: '#ffd24a',
  goldLight: '#fff3b0',
})

const CELESTIAL = {
  day: [104, 13],
  dawn: [118, 27],
  dusk: [173, 27],
  night: [104, 13],
} as const

const STARS: readonly (readonly [number, number, number])[] = (() => {
  const r = createRng(1213)
  const out: [number, number, number][] = []
  while (out.length < 22) {
    const x = Math.floor(r() * SCENE_W)
    const y = WALL_TOP + 1 + Math.floor(r() * 20)
    const [mx, my] = CELESTIAL.night
    if (y > MOUNTAIN_FAR[x] - 3 || Math.hypot(x - mx, y - my) < 8) continue
    out.push([x, y, r() * Math.PI * 2])
  }
  return out
})()

const MURAL_CLOUDS: readonly Cloud[] = [
  { rows: CLOUD_SMALL, y: 9, x0: 70, speed: 1.1 },
  { rows: CLOUD_SMALL, y: 15, x0: 160, speed: 1.4 },
  { rows: CLOUD_MID, y: 11, x0: 122, speed: 1.8 },
]

const GLIDERS: readonly (readonly [number, number, number])[] = [
  [84, 12, 4.2],
  [92, 15, 4.2],
  [168, 10, 5],
]

const FLOCK_MS = 4200

const FLOCK: readonly (readonly [number, number, number, number, number])[] = [
  [66, 46, 20, -9, 0],
  [78, 44, 24, -11, 120],
  [92, 47, 18, -8, 60],
  [108, 45, 26, -12, 240],
  [120, 46, 21, -10, 180],
  [134, 44, 23, -9, 320],
  [150, 46, 19, -11, 90],
  [100, 43, 28, -10, 400],
  [142, 47, 25, -8, 260],
]

function drawBird(
  buf: PixelBuffer,
  open: PixelMask,
  x: number,
  y: number,
  up: boolean,
  c: Rgb
): void {
  const wing = up ? -1 : 1
  put(buf, open, x, y, c)
  put(buf, open, x - 1, y + wing, c)
  put(buf, open, x + 1, y + wing, c)
  if (up) {
    put(buf, open, x - 2, y - 1, c)
    put(buf, open, x + 2, y - 1, c)
  }
}

function celestial(
  m: RoomMoment,
  paint: (x: number, y: number, c: Rgb, a: number) => void
): void {
  const [cx, cy] = CELESTIAL[m.time]
  const hidden = (x: number, y: number) =>
    m.time !== 'day' &&
    m.time !== 'night' &&
    y >= MOUNTAIN_FAR[Math.max(0, Math.min(SCENE_W - 1, x))]
  if (m.time === 'night') {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        if (Math.hypot(dx, dy) > 4.2) continue
        if (Math.hypot(dx - 2.2, dy + 1.4) <= 3.6) continue
        paint(cx + dx, cy + dy, dx < -2 ? SKY.moon : SKY.moonShade, 1)
      }
    }
    return
  }
  const body =
    m.time === 'day' ? SKY.sun : m.time === 'dawn' ? SKY.dawn : SKY.dusk
  const radius = m.time === 'day' ? 4.3 : 5.4
  for (let dy = -6; dy <= 6; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      const d = Math.hypot(dx, dy)
      if (d > radius || hidden(cx + dx, cy + dy)) continue
      paint(cx + dx, cy + dy, d < radius - 2.1 ? SKY.sunCore : body, 1)
    }
  }
  const turn = Math.floor(m.tMs / 900) % 2
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    const long = i % 2 === turn
    for (let k = 0; k < (long ? 2 : 1); k++) {
      const x = Math.round(cx + Math.cos(a) * (radius + 2.1 + k))
      const y = Math.round(cy + Math.sin(a) * (radius + 2.1 + k))
      if (!hidden(x, y)) paint(x, y, body, 0.85)
    }
  }
}

const SIN = (() => {
  const table = new Float32Array(1024)
  for (let i = 0; i < 1024; i++) table[i] = Math.sin((i / 1024) * 2 * Math.PI)
  return table
})()

const wave = (turns: number): number =>
  SIN[Math.floor(mod(turns, 1) * 1024) & 1023]

const AURORA = rgbPalette({
  green: '#62f5a4',
  teal: '#58dccf',
  violet: '#b58cff',
  rose: '#f08ad0',
  gold: '#ffd76a',
})

const RAYS = (() => {
  const r = createRng(4099)
  const rays = new Float32Array(256)
  let v = 0.8
  for (let i = 0; i < 256; i++) {
    v = Math.max(0.45, Math.min(1, v + (r() - 0.5) * 0.5))
    rays[i] = v
  }
  for (let i = 0; i < 24; i++) {
    const k = i / 24
    rays[232 + i] = rays[232 + i] * (1 - k) + rays[i] * k
  }
  return rays
})()

interface Ribbon {
  readonly y: number
  readonly height: number
  readonly swing: number
  readonly a: number
  readonly b: number
  readonly drift: number
  readonly low: Rgb
  readonly high: Rgb
}

const RIBBONS: readonly Ribbon[] = [
  {
    y: 21,
    height: 13,
    swing: 3.4,
    a: 0.13,
    b: 0.61,
    drift: 1,
    low: AURORA.green,
    high: AURORA.violet,
  },
  {
    y: 34,
    height: 14,
    swing: 4.2,
    a: 0.47,
    b: 0.07,
    drift: -1,
    low: AURORA.teal,
    high: AURORA.rose,
  },
  {
    y: 47,
    height: 12,
    swing: 3,
    a: 0.81,
    b: 0.33,
    drift: 1,
    low: AURORA.green,
    high: AURORA.teal,
  },
]

const FLARE_MS = 2600
const SHIMMER_MS = 1900

const edges = RIBBONS.map(() => new Float32Array(SCENE_W))
const strengths = RIBBONS.map(() => new Float32Array(SCENE_W))
const gilt = new Float32Array(SCENE_W)
const spill = new Float32Array(SCENE_W)
let columnsFor: RoomMoment | null = null

function auroraColumns(m: RoomMoment): void {
  if (columnsFor === m) return
  columnsFor = m
  const s = m.tMs / 1000
  const pat = sincePat(m)
  const flare = within(pat, FLARE_MS) ? 1 - pat / FLARE_MS : 0
  const coins = sinceCoins(m)
  const head = within(coins, SHIMMER_MS)
    ? (coins / SHIMMER_MS) * (SCENE_W + 60) - 30
    : NaN
  for (let x = 0; x < SCENE_W; x++) {
    const d = Math.abs(x - head)
    gilt[x] = d < 22 ? 1 - d / 22 : 0
    spill[x] = 0
  }
  RIBBONS.forEach((ribbon, i) => {
    const edge = edges[i]
    const strength = strengths[i]
    const slide = Math.floor(s * 2.2 * ribbon.drift + i * 71)
    for (let x = 0; x < SCENE_W; x++) {
      const ripple =
        flare > 0 ? 3 * flare * wave(x / 26 - (pat / 1000) * 1.9 + i * 0.3) : 0
      edge[x] =
        ribbon.y +
        ribbon.swing * wave(x / 140 + s * 0.045 * ribbon.drift + ribbon.a) +
        1.6 * wave(x / 57 - s * 0.07 + ribbon.b) +
        ripple
      const swell =
        0.62 + 0.38 * wave(x / 96 + s * 0.06 * ribbon.drift + ribbon.b)
      const v =
        swell * RAYS[mod(x * 2 + slide, 256)] * (1 + 0.7 * flare) +
        gilt[x] * 0.5
      strength[x] = v
      spill[x] += v / RIBBONS.length
    }
  })
}

const RIBBON_FALL = RIBBONS.map((ribbon) =>
  Float32Array.from({ length: ribbon.height }, (_, k) =>
    k === 0 ? 1 : Math.pow(1 - k / ribbon.height, 1.4) * 0.86 + 0.07
  )
)

const RIBBON_TINT = RIBBONS.map((ribbon) =>
  Array.from({ length: ribbon.height }, (_, k) => {
    const f = k / ribbon.height
    return f < 0.25
      ? ribbon.low
      : f < 0.55
        ? mix(ribbon.low, ribbon.high, 0.5)
        : ribbon.high
  })
)

function drawRibbons(
  buf: PixelBuffer,
  open: PixelMask,
  subject: PixelMask | null,
  amount: number
): void {
  if (amount <= 0.01) return
  const data = buf.data
  RIBBONS.forEach((ribbon, i) => {
    const edge = edges[i]
    const strength = strengths[i]
    const fall = RIBBON_FALL[i]
    const tint = RIBBON_TINT[i]
    for (let x = 0; x < SCENE_W; x++) {
      const bottom = Math.round(edge[x])
      const gold = gilt[x]
      const a = amount * strength[x]
      for (let k = 0; k < ribbon.height; k++) {
        const y = bottom - k
        if (y < WALL_TOP || y >= WALL_BOTTOM) continue
        const p = y * SCENE_W + x
        if (open.data[p] !== 1 || (subject && subject.data[p])) continue
        const c = gold > 0 ? mix(tint[k], AURORA.gold, gold) : tint[k]
        const v = Math.min(1, a * fall[k])
        const q = p * 4
        data[q] += (((c >> 16) & 255) - data[q]) * v
        data[q + 1] += (((c >> 8) & 255) - data[q + 1]) * v
        data[q + 2] += ((c & 255) - data[q + 2]) * v
      }
    }
  })
}

const SPILL_ROWS = 18

function drawSpill(buf: PixelBuffer, subject: PixelMask, amount: number): void {
  if (amount <= 0.01) return
  const data = buf.data
  for (let x = 0; x < SCENE_W; x++) {
    const c =
      gilt[x] > 0 ? mix(AURORA.green, AURORA.gold, gilt[x]) : AURORA.green
    const r = (c >> 16) & 255
    const g = (c >> 8) & 255
    const b = c & 255
    const a = amount * Math.min(1.4, spill[x])
    for (let k = 0; k < SPILL_ROWS; k++) {
      const y = WALL_BOTTOM + k
      const p = y * SCENE_W + x
      if (subject.data[p]) continue
      const v = a * (1 - k / SPILL_ROWS) * (y < FLOOR_TOP ? 0.6 : 1)
      const q = p * 4
      data[q] += (r - data[q]) * v
      data[q + 1] += (g - data[q + 1]) * v
      data[q + 2] += (b - data[q + 2]) * v
    }
  }
}

export const WALL_LIVE: RoomLiveSet<WallPattern> = {
  clouds: {
    back(buf, m, open) {
      const tones = tonesOf(m.wallColor)
      for (const cloud of CLOUDS) drawCloud(buf, open, cloud, m.tMs, tones)
    },
  },
  leaves: {
    back(buf, m, open) {
      const tones = tonesOf(m.wallColor)
      for (const leaf of LEAVES) {
        const age = mod(m.tMs + leaf.bornMs, leaf.lifeMs)
        const p = age / leaf.lifeMs
        const swing = (age / leaf.swayMs) * 2 * Math.PI + leaf.phase
        const x = Math.round(
          mod(leaf.x + leaf.drift * p + Math.sin(swing) * leaf.sway, SCENE_W)
        )
        const y = Math.round(WALL_TOP + 4 + p * (WALL_ROWS - 2))
        const speed = Math.cos(swing)
        const shape =
          LEAF_SHAPES[speed > 0.35 ? 'right' : speed < -0.35 ? 'left' : 'flat']
        for (const [dx, dy, vein] of shape)
          put(buf, open, x + dx, y + dy, vein ? tones.far : tones.near)
      }
    },
  },
  mountains: {
    back(buf, m, open) {
      const tones = tonesOf(m.wallColor)
      celestial(m, (x, y, c, a) => {
        if (onWall(open, x, y)) blend(buf, x, y, c, a)
      })
      for (const cloud of MURAL_CLOUDS)
        drawCloud(buf, open, cloud, m.tMs, tones)
      GLIDERS.forEach(([x0, y0, speed], i) => {
        const x = mod(x0 + (speed * m.tMs) / 1000, SCENE_W + 12) - 6
        const y = y0 + Math.round(1.4 * Math.sin(m.tMs * 0.0011 + i * 2))
        drawBird(
          buf,
          open,
          Math.round(x),
          y,
          Math.floor(m.tMs / 420 + i) % 2 === 0,
          tones.deep
        )
      })
      const pat = sincePat(m)
      if (within(pat, FLOCK_MS)) {
        for (const [x0, y0, vx, vy, delay] of FLOCK) {
          const age = pat - delay
          if (age < 0) continue
          const s = age / 1000
          drawBird(
            buf,
            open,
            Math.round(x0 + vx * s),
            Math.round(y0 + vy * s + 1.2 * Math.sin(s * 5 + x0)),
            Math.floor(age / 140) % 2 === 0,
            tones.deep
          )
        }
      }
    },
    fx(buf, m, subject, open) {
      const dark = isDarkTime(m.time)
      celestial(m, (x, y, c, a) =>
        shine(buf, open, subject, x, y, c, a * (m.time === 'day' ? 0.55 : 0.92))
      )
      if (dark) {
        const count = m.time === 'night' ? STARS.length : 9
        for (let i = 0; i < count; i++) {
          const [x, y, phase] = STARS[i]
          const glow = 0.55 + 0.45 * Math.sin(m.tMs * 0.0019 + phase)
          shine(buf, open, subject, x, y, SKY.star, glow)
          if (i % 5 === 0 && glow > 0.8) {
            shine(buf, open, subject, x - 1, y, SKY.star, 0.3)
            shine(buf, open, subject, x + 1, y, SKY.star, 0.3)
          }
        }
        const [mx, my] = CELESTIAL[m.time]
        for (let dy = -7; dy <= 7; dy++)
          for (let dx = -7; dx <= 7; dx++) {
            const d = Math.hypot(dx, dy)
            if (d < 7.2)
              shine(
                buf,
                open,
                subject,
                mx + dx,
                my + dy,
                m.time === 'night' ? SKY.moon : SKY.dusk,
                0.16 * (1 - d / 7.2)
              )
          }
      }
      const coins = sinceCoins(m)
      if (!within(coins, 2000)) return
      const [cx, cy] = CELESTIAL[m.time]
      const ring = coins / 650
      if (ring < 1) {
        for (let i = 0; i < 16; i++) {
          const a = (i * Math.PI) / 8
          const reach = 5.5 + ring * 6
          shine(
            buf,
            open,
            subject,
            cx + Math.cos(a) * reach,
            cy + Math.sin(a) * reach,
            i % 2 ? SKY.gold : SKY.goldLight,
            1 - ring
          )
        }
      }
      const head = (coins / 1800) * (SCENE_W + 50)
      const fade = Math.min(1, (2000 - coins) / 300)
      for (let k = 0; k < 18; k++) {
        const x = Math.round(head - k * 3)
        if (x < 0 || x >= SCENE_W) continue
        const y = Math.round(MOUNTAIN_FAR[x]) - 1
        const a = (1 - k / 18) * fade
        shine(buf, open, subject, x, y, SKY.gold, a)
        shine(buf, open, subject, x, y + 1, SKY.gold, a * 0.7)
        if (k % 3 !== 0) continue
        shine(buf, open, subject, x, y - 2, SKY.goldLight, a)
        shine(buf, open, subject, x - 1, y - 1, SKY.goldLight, a * 0.8)
        shine(buf, open, subject, x + 1, y - 1, SKY.goldLight, a * 0.8)
        shine(buf, open, subject, x, y - 1, SKY.goldLight, a)
      }
    },
  },
  aurora: {
    back(buf, m, open) {
      auroraColumns(m)
      drawRibbons(buf, open, null, 0.74 * (1 - showStrength(m)))
    },
    fx(buf, m, subject, open) {
      auroraColumns(m)
      const show = showStrength(m)
      drawRibbons(buf, open, subject, 0.8 * show)
      drawSpill(buf, subject, 0.2 * show)
    },
    dim: (m) => 0.6 * showStrength(m),
  },
}
