import {
  createRng,
  rgbPalette,
  type PixelBuffer,
  type PixelMask,
} from '@/lib/pixelArt'
import type { LampId } from '@/types/pet'

import { blend, isDarkTime } from '../fx'
import { FLAME_HEIGHT, LAMPS } from './lamp'
import {
  isOpen,
  sinceCoins,
  sincePat,
  within,
  type RoomLiveSet,
  type RoomMoment,
} from './live'
import { isWindowPane } from './window'

const FX = rgbPalette({
  warm: '#ffb65a',
  spark: '#ffb02e',
  sparkCool: '#f0621e',
  flameOuter: '#ff8f2a',
  flameMid: '#ffd04a',
  flameCore: '#fff6cf',
  gold: '#f1b92e',
  goldLight: '#fff0a8',
  goldDark: '#c98a16',
  bird: '#3a2a20',
  halo: '#ffe2a0',
})

const WALL_TOP = 7
const WALL_BOTTOM = 52

const smooth = (p: number): number => {
  const u = Math.max(0, Math.min(1, p))
  return u * u * (3 - 2 * u)
}

const free = (subject: PixelMask, x: number, y: number): boolean =>
  x >= 0 &&
  y >= 0 &&
  x < subject.width &&
  y < subject.height &&
  subject.data[y * subject.width + x] === 0

function stamp(
  radiusX: number,
  radiusY: number,
  power: number
): readonly (readonly [number, number, number])[] {
  const out: [number, number, number][] = []
  for (let dy = -Math.ceil(radiusY); dy <= radiusY; dy++) {
    for (let dx = -Math.ceil(radiusX); dx <= radiusX; dx++) {
      const d = Math.hypot(dx / radiusX, dy / radiusY)
      if (d < 1) out.push([dx, dy, Math.pow(1 - d, power)])
    }
  }
  return out
}

const CAMP = LAMPS.campfire
const FIRE_X = CAMP.ox + 16
const FIRE_BASE = CAMP.oy + 26
const FIRE_GLOW = stamp(30, 24, 2)

const flameTop = (level: number): number =>
  FIRE_BASE - FLAME_HEIGHT[level] * 1.4 * 2

const SPARK_LIFE_MS = 2600

const hash = (a: number, b: number): number => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return v - Math.floor(v)
}

function drawSparks(buf: PixelBuffer, m: RoomMoment): void {
  const count = 3 + m.lampLevel
  const top = flameTop(m.lampLevel) + 3
  for (let i = 0; i < count; i++) {
    const clock = m.tMs + (i * SPARK_LIFE_MS) / count
    const age = ((clock % SPARK_LIFE_MS) + SPARK_LIFE_MS) % SPARK_LIFE_MS
    const round = Math.floor(clock / SPARK_LIFE_MS)
    const p = age / SPARK_LIFE_MS
    const dx = (hash(round, i) - 0.5) * 9
    const drift = (hash(i, round) - 0.5) * 16
    const x = FIRE_X + dx + drift * p + Math.sin(age * 0.004 + i * 1.9) * 2
    const y = top - age * (0.016 + hash(round + 3, i) * 0.008)
    if (y < 6) continue
    const flick = Math.floor(clock / 200 + i) % 3 === 0 ? 0.55 : 1
    blend(
      buf,
      x,
      y,
      p < 0.45 ? FX.spark : FX.sparkCool,
      Math.min(1, (1 - p) * 1.5) * flick
    )
  }
}

const PAT_FLARE_MS = 1100
const PAT_BURST_MS = 1500

const BURST: readonly (readonly [number, number, number])[] = (() => {
  const r = createRng(77)
  return Array.from({ length: 14 }, () => {
    const angle = (-150 + r() * 120) * (Math.PI / 180)
    const speed = 0.028 + r() * 0.034
    return [Math.cos(angle) * speed, Math.sin(angle) * speed, r()] as const
  })
})()

function drawFlare(
  buf: PixelBuffer,
  m: RoomMoment,
  since: number,
  subject: PixelMask
): void {
  const s = 1 - since / PAT_FLARE_MS
  const rise = Math.sin(Math.min(1, since / 160) * (Math.PI / 2))
  const height = FLAME_HEIGHT[m.lampLevel] * 2.8 * (1 + 0.55 * s * rise) + 5 * s
  const half = 3 + Math.round(m.lampLevel * 0.6 + 2 * s)
  for (let dx = -half; dx <= half; dx++) {
    const u = dx / (half + 0.5)
    const lick = 0.82 + 0.18 * Math.sin(m.tMs * 0.021 + dx * 1.7)
    const column = height * (1 - u * u) * lick
    for (let j = 0; j < column; j++) {
      const x = FIRE_X + dx
      const y = FIRE_BASE - 1 - j
      if (!free(subject, x, y)) continue
      const v = j / column
      const c =
        Math.abs(u) < 0.3 && v < 0.45
          ? FX.flameCore
          : Math.abs(u) < 0.62 && v < 0.72
            ? FX.flameMid
            : FX.flameOuter
      blend(buf, x, y, c, Math.min(1, s * 2.2))
    }
  }
}

function drawBurst(buf: PixelBuffer, m: RoomMoment, since: number): void {
  const top = flameTop(m.lampLevel) + 4
  for (let i = 0; i < BURST.length; i++) {
    const [vx, vy, seed] = BURST[i]
    const life = PAT_BURST_MS * (0.6 + seed * 0.4)
    if (since >= life) continue
    const p = since / life
    const travel = since * (1 - p * 0.45)
    const x = FIRE_X + vx * travel
    const y = top + vy * travel
    const a = Math.min(1, (1 - p) * 1.6)
    blend(buf, x, y, p < 0.35 ? FX.flameMid : FX.spark, a)
    blend(buf, x - vx * 30, y - vy * 30, FX.sparkCool, a * 0.7)
  }
}

const SHOWER_MS = 2200
const SHOWER: readonly (readonly [number, number, number])[] = (() => {
  const r = createRng(191)
  return Array.from(
    { length: 20 },
    () => [(r() - 0.5) * 0.07, 0.07 + r() * 0.04, r()] as const
  )
})()
const GRAVITY = 0.00013

function drawShower(buf: PixelBuffer, m: RoomMoment, since: number): void {
  const top = flameTop(m.lampLevel) + 5
  for (let i = 0; i < SHOWER.length; i++) {
    const [vx, vy, seed] = SHOWER[i]
    const age = since - i * 32
    const life = 1300 + seed * 260
    if (age < 0 || age >= life) continue
    const p = age / life
    const x = Math.round(FIRE_X + vx * age)
    const y = Math.round(top - vy * age + 0.5 * GRAVITY * age * age)
    if (y > 96) continue
    const a = Math.min(1, (1 - p) * 2.4)
    const twinkle = Math.floor((age + seed * 400) / 110) % 3 === 0
    blend(buf, x, y, twinkle ? FX.goldLight : FX.gold, a)
    if (twinkle) {
      blend(buf, x - 1, y, FX.gold, a * 0.6)
      blend(buf, x + 1, y, FX.gold, a * 0.6)
      blend(buf, x, y - 1, FX.gold, a * 0.6)
      blend(buf, x, y + 1, FX.goldDark, a * 0.6)
    } else {
      blend(buf, x, y + 1, FX.goldDark, a * 0.5)
    }
  }
}

function campfireFx(buf: PixelBuffer, m: RoomMoment, subject: PixelMask): void {
  if (!m.lampLevel) return
  const pat = sincePat(m)
  const coins = sinceCoins(m)
  const flare = within(pat, PAT_FLARE_MS) ? 1 - pat / PAT_FLARE_MS : 0
  const gilt = within(coins, 900) ? 1 - coins / 900 : 0
  const flicker =
    0.5 + 0.3 * Math.sin(m.tMs * 0.0131) + 0.2 * Math.sin(m.tMs * 0.0317 + 1)
  const strength =
    (0.025 + 0.05 * flicker) * (0.4 + m.lampLevel * 0.12) +
    0.16 * flare +
    0.1 * gilt
  const cy = FIRE_BASE - 8
  const tint = gilt > flare ? FX.gold : FX.warm
  for (const [dx, dy, a] of FIRE_GLOW)
    blend(buf, FIRE_X + dx, cy + dy, tint, a * strength)
  if (flare > 0) drawFlare(buf, m, pat, subject)
  drawSparks(buf, m)
  if (within(pat, PAT_BURST_MS)) drawBurst(buf, m, pat)
  if (within(coins, SHOWER_MS)) drawShower(buf, m, coins)
}

const LANTERN = LAMPS.shadows
const SHADE_X = LANTERN.ox + 11
const SHADE_TOP = LANTERN.oy + 12
const SHADE_BOTTOM = LANTERN.oy + 23
const SHADE_RADIUS = 6.3

const BIRD_COUNT = 5
const BIRD_LOOP = 230
const BIRD_ROWS = [42, 10, 40, 11, 41] as const
const BIRD_HALO = stamp(11, 6.5, 1.3)
const RACE_MS = 1800

type Glyph = readonly (readonly [number, number])[]

const glyph = (rows: readonly string[], cx: number, cy: number): Glyph =>
  rows.flatMap((row, y) =>
    [...row].flatMap((ch, x): [number, number][] =>
      ch === '#' ? [[x - cx, y - cy]] : []
    )
  )

const BIRD_UP = glyph(
  ['#.......#', '.##...##.', '...###...', '....#....'],
  4,
  2
)
const BIRD_LEVEL = glyph(['.##...##.', '#..###..#', '....#....'], 4, 1)
const BIRD_DOWN = glyph(['...###...', '.##.#.##.', '#.......#'], 4, 0)
const BIRD_POSES: readonly Glyph[] = [
  BIRD_UP,
  BIRD_LEVEL,
  BIRD_DOWN,
  BIRD_LEVEL,
]

const SHADE_BIRD = glyph(['#...#', '.#.#.', '..#..'], 2, 1)
const SHADE_BIRD_ROWS = [3, 8, 4, 7] as const

const FLECKS: readonly (readonly [number, number, number])[] = (() => {
  const r = createRng(313)
  return Array.from(
    { length: 34 },
    () =>
      [
        4 + Math.floor(r() * 172),
        WALL_TOP + 3 + Math.floor(r() * (WALL_BOTTOM - WALL_TOP - 8)),
        r() * 6,
      ] as const
  )
})()
const SWEEP_MS = 1800

type Wall = { readonly subject: PixelMask; readonly open: PixelMask }

const onWall = ({ subject, open }: Wall, x: number, y: number): boolean =>
  y >= WALL_TOP &&
  y < WALL_BOTTOM &&
  free(subject, x, y) &&
  isOpen(open, x, y) &&
  !isWindowPane(x, y)

function drawWallBirds(
  buf: PixelBuffer,
  m: RoomMoment,
  race: number,
  wall: Wall
): void {
  const dark = isDarkTime(m.time)
  const level = 0.4 + m.lampLevel * 0.12
  const haloA = (dark ? 0.5 : 0.22) * level
  const birdA = (dark ? 0.62 : 0.5) * level
  const travel = m.tMs * 0.009 + race * BIRD_LOOP
  for (let i = 0; i < BIRD_COUNT; i++) {
    const along = (i * BIRD_LOOP) / BIRD_COUNT - travel
    const x = Math.round(((along % BIRD_LOOP) + BIRD_LOOP) % BIRD_LOOP) - 24
    const y = BIRD_ROWS[i] + Math.round(Math.sin(m.tMs * 0.0012 + i * 1.7))
    for (const [dx, dy, a] of BIRD_HALO)
      if (onWall(wall, x + dx, y + dy))
        blend(buf, x + dx, y + dy, FX.halo, a * haloA)
    const pose =
      BIRD_POSES[
        (((Math.floor(m.tMs / (race > 0 && race < 1 ? 110 : 240)) + i) % 4) +
          4) %
          4
      ]
    for (const [dx, dy] of pose)
      if (onWall(wall, x + dx, y + dy))
        blend(buf, x + dx, y + dy, FX.bird, birdA)
  }
}

function drawShadeBirds(
  buf: PixelBuffer,
  m: RoomMoment,
  turn: number,
  gilt: number,
  subject: PixelMask
): void {
  const lit = m.lampLevel > 0
  if (gilt > 0) {
    for (let y = SHADE_TOP - 1; y <= SHADE_BOTTOM; y++)
      for (let x = SHADE_X - 6; x <= SHADE_X + 6; x++)
        if (free(subject, x, y)) blend(buf, x, y, FX.gold, gilt * 0.5)
  }
  for (let i = 0; i < SHADE_BIRD_ROWS.length; i++) {
    const theta = turn + (i * Math.PI) / 2
    const facing = Math.cos(theta)
    if (facing < 0.3) continue
    const cx = SHADE_X + SHADE_RADIUS * Math.sin(theta)
    const cy = SHADE_TOP - 1 + SHADE_BIRD_ROWS[i]
    for (const [dx, dy] of SHADE_BIRD) {
      const x = Math.round(cx + dx * facing)
      if (free(subject, x, cy + dy))
        blend(buf, x, cy + dy, FX.bird, (lit ? 0.8 : 0.5) * facing)
    }
  }
}

function drawSweep(
  buf: PixelBuffer,
  m: RoomMoment,
  since: number,
  wall: Wall
): void {
  const p = since / SWEEP_MS
  const front = SHADE_X + 34 - p * 250
  for (const [x, y, phase] of FLECKS) {
    const near = 1 - Math.abs(x - front) / 34
    if (near <= 0 || !onWall(wall, x, y)) continue
    const a = Math.min(1, near * 1.6)
    const big = Math.floor(m.tMs / 130 + phase) % 3 !== 0
    if (onWall(wall, x, y + 1)) blend(buf, x, y + 1, FX.goldDark, a * 0.8)
    blend(buf, x, y, big ? FX.goldLight : FX.gold, a)
    if (!big) continue
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
    ] as const)
      if (onWall(wall, x + dx, y + dy))
        blend(buf, x + dx, y + dy, FX.gold, a * 0.9)
  }
}

function shadowsFx(
  buf: PixelBuffer,
  m: RoomMoment,
  subject: PixelMask,
  open: PixelMask
): void {
  if (!m.lampLevel) {
    drawShadeBirds(buf, m, 0.4, 0, subject)
    return
  }
  const race = smooth(sincePat(m) / RACE_MS)
  const coins = sinceCoins(m)
  const gilt = within(coins, SWEEP_MS) ? 1 - coins / SWEEP_MS : 0
  const wall = { subject, open }
  drawWallBirds(buf, m, race, wall)
  drawShadeBirds(
    buf,
    m,
    0.4 + m.tMs * 0.0009 + race * 4 * Math.PI,
    gilt,
    subject
  )
  if (gilt > 0) drawSweep(buf, m, coins, wall)
}

const STOVE = LAMPS.stove
const STOVE_X = STOVE.ox + 14
const STOVE_SPILL_Y = STOVE.oy + 47
const STOVE_SPILL = stamp(11, 3.6, 1.2)

function stoveFx(buf: PixelBuffer, m: RoomMoment, subject: PixelMask): void {
  if (!m.lampLevel) return
  const frame = Math.floor((m.tMs / 1000) * 6) % 8
  const flicker = 0.6 + 0.4 * Math.sin((frame / 8) * 2 * Math.PI * 3 + 0.8)
  const strength = (0.1 + 0.14 * flicker) * (0.3 + m.lampLevel * 0.14)
  for (const [dx, dy, a] of STOVE_SPILL)
    if (free(subject, STOVE_X + dx, STOVE_SPILL_Y + dy))
      blend(buf, STOVE_X + dx, STOVE_SPILL_Y + dy, FX.warm, a * strength)
}

export const LAMP_LIVE: RoomLiveSet<LampId> = {
  stove: { fx: stoveFx },
  shadows: { fx: shadowsFx },
  campfire: { fx: campfireFx },
}
