import {
  blit,
  createBuffer,
  readRgb,
  rgbPalette,
  setPixel,
  type PixelBuffer,
  type PixelMask,
  type Rgb,
} from '@/lib/pixelArt'
import type { ShelfId } from '@/types/pet'

import { blend, glow, isDarkTime, square } from '../fx'
import {
  sinceCoins,
  sincePat,
  within,
  type RoomLiveSet,
  type RoomMoment,
} from './live'
import { SHELF_SHIFT_X } from './shelf'

const S = SHELF_SHIFT_X

const SHELF_Y = 32

const mod = (n: number, m: number): number => ((n % m) + m) % m

const HG = rgbPalette({
  wood: '#8a5a36',
  woodLight: '#b98654',
  woodDark: '#6e4529',
  glass: '#d9eaec',
  rim: '#8fb0b8',
  shine: '#ffffff',
  sand: '#e3b85a',
  sandShade: '#c9973c',
  sandLight: '#f6dc92',
})

const HG_W = 13
const HG_H = 20
const HG_X = 136
const HG_Y = 12
const HG_CX = 6
const HG_CY = 9.5
const HG_BULB = [7, 7, 7, 7, 5, 5, 3, 1] as const
const HG_TOP_ROWS = 8
const HG_BOTTOM_ROWS = 7

const hgWidth = (row: number): number =>
  row < 2 || row > 17 ? 0 : row <= 9 ? HG_BULB[row - 2] : HG_BULB[17 - row]

type Put = (x: number, y: number, c: Rgb) => void

function drawHourglass(
  put: Put,
  top: number,
  bottom: number,
  stream: number | null
): void {
  for (let x = 0; x < HG_W; x++) {
    put(x, 0, HG.woodLight)
    put(x, 1, HG.wood)
    put(x, 18, HG.woodLight)
    put(x, 19, HG.woodDark)
  }
  for (let row = 2; row <= 17; row++) {
    put(1, row, HG.woodLight)
    put(11, row, HG.woodDark)
    const w = hgWidth(row)
    const x0 = HG_CX - (w - 1) / 2
    const upper = row <= 9
    const filled = upper ? row > 9 - top : row > 17 - bottom
    const surface = upper ? row === 10 - top : row === 18 - bottom
    for (let x = x0; x < x0 + w; x++) {
      const edge = w > 1 && (x === x0 || x === x0 + w - 1)
      let c = edge ? HG.rim : HG.glass
      if (filled && !edge) {
        const off = Math.abs(x - HG_CX)
        const dimple = upper && surface && top < HG_TOP_ROWS && off === 0
        const mound = !upper && surface && off > 1
        if (!dimple && !mound) c = off > 1 && !surface ? HG.sandShade : HG.sand
        if (surface && !dimple && !mound && off === 0 && !upper)
          c = HG.sandLight
      }
      put(x, row, c)
    }
  }
  put(4, 3, HG.shine)
  put(4, 4, HG.shine)
  put(4, 15, HG.shine)
  if (stream === null) return
  for (let row = 10; row < 18 - bottom; row++)
    put(HG_CX, row, mod(row - stream, 3) === 0 ? HG.sandLight : HG.sand)
}

const HG_RUN_MS = 16000
const HG_REST_MS = 1200
const HG_FLIP_MS = 1200
const HG_SETTLE_MS = 600
const HG_CYCLE_MS = HG_RUN_MS + HG_REST_MS + HG_FLIP_MS + HG_SETTLE_MS
const HG_START_MS = 5600
const HG_TURNS = 12
const HG_SPIN = 27
const HG_SPIN_C = 13

let hourglassTurns: PixelBuffer[] | null = null

function hourglassTurn(step: number): PixelBuffer {
  if (!hourglassTurns) {
    const upright = createBuffer(HG_W, HG_H)
    drawHourglass(
      (x, y, c) => setPixel(upright, x, y, c),
      0,
      HG_BOTTOM_ROWS,
      null
    )
    hourglassTurns = []
    for (let k = 1; k < HG_TURNS; k++) {
      const out = createBuffer(HG_SPIN, HG_SPIN)
      const a = (k / HG_TURNS) * Math.PI
      const cos = Math.cos(a)
      const sin = Math.sin(a)
      for (let y = 0; y < HG_SPIN; y++) {
        for (let x = 0; x < HG_SPIN; x++) {
          const dx = x - HG_SPIN_C
          const dy = y - HG_SPIN_C
          const sx = Math.round(cos * dx + sin * dy + HG_CX)
          const sy = Math.round(-sin * dx + cos * dy + HG_CY)
          if (sx < 0 || sy < 0 || sx >= HG_W || sy >= HG_H) continue
          const k4 = (sy * HG_W + sx) * 4
          if (upright.data[k4 + 3] === 0) continue
          const o = (y * HG_SPIN + x) * 4
          out.data[o] = upright.data[k4]
          out.data[o + 1] = upright.data[k4 + 1]
          out.data[o + 2] = upright.data[k4 + 2]
          out.data[o + 3] = 255
        }
      }
      hourglassTurns.push(out)
    }
  }
  return hourglassTurns[step - 1]
}

function hourglassBack(buf: PixelBuffer, m: RoomMoment): void {
  const put: Put = (x, y, c) => setPixel(buf, HG_X + S + x, HG_Y + y, c)
  const u = mod(m.tMs + HG_START_MS, HG_CYCLE_MS)
  if (u < HG_RUN_MS) {
    const q = u / HG_RUN_MS
    drawHourglass(
      put,
      Math.round((1 - q) * HG_TOP_ROWS),
      Math.round(q * HG_BOTTOM_ROWS),
      Math.floor(u / 100)
    )
    return
  }
  const flip = u - HG_RUN_MS - HG_REST_MS
  if (flip < 0) {
    drawHourglass(put, 0, HG_BOTTOM_ROWS, null)
    return
  }
  if (flip >= HG_FLIP_MS) {
    drawHourglass(put, HG_TOP_ROWS, 0, null)
    return
  }
  const p = flip / HG_FLIP_MS
  const step = Math.floor(p * HG_TURNS)
  if (step === 0) {
    drawHourglass(put, 0, HG_BOTTOM_ROWS, null)
    return
  }
  const lift = Math.round(4 * Math.sin(p * Math.PI))
  const oy = HG_Y + Math.round(HG_CY) - HG_SPIN_C - lift
  blit(
    buf,
    hourglassTurn(step),
    HG_X + S + HG_CX - HG_SPIN_C,
    oy,
    (c, _x, y) => (y + oy < SHELF_Y ? c : null)
  )
}

const STEAM = rgbPalette({ white: '#ffffff', shade: '#9fb2bd' })

function wisp(
  buf: PixelBuffer,
  tMs: number,
  x0: number,
  y0: number,
  rise: number,
  seed: number,
  strength: number
): void {
  const k = tMs * 0.0042
  for (let j = 0; j < rise; j++) {
    const p = j / rise
    const x = Math.round(x0 + Math.sin(j * 0.8 - k + seed) * (0.35 + 1.7 * p))
    const gap = 0.55 + 0.45 * Math.sin(j * 0.55 - k * 0.7 + seed * 2.3)
    const a = strength * (1 - p) * gap
    blend(buf, x + 1, y0 - j, STEAM.shade, a * 0.42)
    blend(buf, x, y0 - j, STEAM.white, a)
  }
}

function teaBack(buf: PixelBuffer, m: RoomMoment): void {
  wisp(buf, m.tMs, 154 + S, 18, 11, 1, 1)
  wisp(buf, m.tMs, 158 + S, 23, 8, 2.4, 0.85)
  wisp(buf, m.tMs, 167 + S, 23, 7, 4.1, 0.7)
}

const NOTE = rgbPalette({
  ink: '#2d2a32',
  pale: '#fff4d6',
  gold: '#f1b92e',
  goldLight: '#fff0a8',
  goldDark: '#8a5a12',
  shine: '#fff6cf',
  glint: '#8a847a',
  glintDim: '#57524b',
})

const SINGLE = ['.XX', '.X.', '.X.', 'XX.', 'XX.'] as const
const PAIR = ['.XXXX', '.X..X', '.X..X', 'XX.XX', 'XX.XX'] as const

const HORN_X = 143 + S
const HORN_Y = 16

const WALL_FLOOR_Y = 52

function luma(buf: PixelBuffer, x: number, y: number): number {
  const c = readRgb(buf, x, y)
  return (
    0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)
  )
}

function onDark(buf: PixelBuffer, x: number, y: number): boolean {
  let dark = 0
  if (luma(buf, x, y) < 105) dark++
  if (luma(buf, x - 4, y) < 105) dark++
  if (luma(buf, x + 5, y) < 105) dark++
  if (luma(buf, x, y - 4) < 105) dark++
  if (luma(buf, x, y + 6) < 105) dark++
  return dark >= 3
}

function drawNote(
  buf: PixelBuffer,
  subject: PixelMask,
  px: number,
  py: number,
  pair: boolean,
  gold: boolean,
  a: number
): void {
  if (a <= 0.02) return
  const x0 = Math.round(px)
  const y0 = Math.round(py)
  const rows = pair ? PAIR : SINGLE
  const ink = gold
    ? NOTE.gold
    : onDark(buf, x0 + 1, y0 + 2)
      ? NOTE.pale
      : NOTE.ink
  for (let pass = gold ? 0 : 1; pass < 2; pass++) {
    const shift = pass === 0 ? 1 : 0
    const c = pass === 0 ? NOTE.goldDark : ink
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j]
      for (let i = 0; i < row.length; i++) {
        if (row[i] !== 'X') continue
        const x = x0 + i + shift
        const y = y0 + j + shift
        if (x < 0 || y < 0 || x >= buf.width || y >= WALL_FLOOR_Y) continue
        if (subject.data[y * buf.width + x]) continue
        blend(buf, x, y, c, pass === 0 ? a * 0.8 : a)
      }
    }
  }
  if (gold && a > 0.5) blend(buf, x0, y0 + 3, NOTE.goldLight, a)
}

const DRIFT_MS = 5200
const DRIFT_NOTES = 3

function driftNotes(buf: PixelBuffer, m: RoomMoment, subject: PixelMask) {
  for (let i = 0; i < DRIFT_NOTES; i++) {
    const shifted = m.tMs + (i * DRIFT_MS) / DRIFT_NOTES + 900
    const age = mod(shifted, DRIFT_MS)
    const round = Math.floor(shifted / DRIFT_MS)
    const p = age / DRIFT_MS
    const lane = mod(round * 5 + i * 3, 7)
    const x = HORN_X - 11 - p * (38 + lane * 3)
    const y =
      HORN_Y -
      5 +
      (lane - 2) * 1.5 * p +
      Math.sin(p * 7 + i * 2.1 + round) * 2.2 -
      p * 2
    const a = Math.min(1, p * 8) * Math.min(1, (1 - p) * 2.6)
    drawNote(buf, subject, x, y, mod(round + i, 3) === 0, false, a)
  }
}

const BURST_MS = 2600
const BURST_GAP_MS = 130

function burstNotes(
  buf: PixelBuffer,
  subject: PixelMask,
  since: number,
  count: number,
  gold: boolean
): void {
  if (since < 0 || since >= BURST_MS + count * BURST_GAP_MS) return
  for (let i = 0; i < count; i++) {
    const age = since - i * BURST_GAP_MS
    if (age < 0 || age >= BURST_MS) continue
    const p = age / BURST_MS
    const ease = 1 - (1 - p) * (1 - p)
    const fan = (i / (count - 1) - 0.5) * 2
    const reach = 26 + mod(i * 7, 5) * 5
    const x = HORN_X - 10 - ease * reach
    const y =
      HORN_Y -
      3 +
      fan * 10 * ease +
      (gold ? -2 : 0) +
      Math.sin(p * 6 + i * 1.9) * 1.6
    const a = Math.min(1, p * 10) * Math.min(1, (1 - p) * 2.2)
    drawNote(buf, subject, x, y, i % 3 === 1, gold, a)
  }
}

const RECORD_X = 159.5 + S
const RECORD_Y = 24.6

function gramophoneBack(buf: PixelBuffer, m: RoomMoment): void {
  const fast = within(sincePat(m), 2400) || within(sinceCoins(m), 2400)
  const step = Math.floor(m.tMs / 100)
  const turn = (step * (fast ? 5 : 3) * Math.PI) / 16
  const gx = Math.round(RECORD_X - 0.5 + Math.cos(turn) * 6.4)
  const gy = Math.round(RECORD_Y - 0.6 + Math.sin(turn) * 1.3)
  setPixel(buf, gx, gy, NOTE.glint)
  setPixel(
    buf,
    Math.round(RECORD_X - 0.5 - Math.cos(turn) * 6.4),
    Math.round(RECORD_Y - 0.6 - Math.sin(turn) * 1.3),
    NOTE.glintDim
  )
}

const HORN_SHINE_MS = 1300

function gramophoneFx(
  buf: PixelBuffer,
  m: RoomMoment,
  subject: PixelMask
): void {
  driftNotes(buf, m, subject)
  burstNotes(buf, subject, sincePat(m), 7, false)
  const coins = sinceCoins(m)
  burstNotes(buf, subject, coins, 6, true)
  if (!within(coins, HORN_SHINE_MS)) return
  const p = coins / HORN_SHINE_MS
  const env = Math.min(1, p * 8) * (1 - p)
  glow(buf, HORN_X, HORN_Y, 11, NOTE.gold, 0.7 * env)
  const a = Math.min(1, env * 2.2)
  const sx = HORN_X - 4
  const sy = HORN_Y - 4
  const arm = p < 0.5 ? 3 : 2
  blend(buf, sx, sy, NOTE.shine, a)
  for (let i = 1; i <= arm; i++) {
    const f = a * (1 - i / (arm + 1))
    blend(buf, sx - i, sy, NOTE.shine, f)
    blend(buf, sx + i, sy, NOTE.shine, f)
    blend(buf, sx, sy - i, NOTE.shine, f)
    blend(buf, sx, sy + i, NOTE.shine, f)
  }
}

const VOLC = rgbPalette({
  rock: '#8f5f3c',
  rockLight: '#ad7a52',
  rockDark: '#6c4429',
  rockDeep: '#553420',
  rim: '#4a2c1a',
  lava: '#f0622a',
  lavaHot: '#ffb347',
  lavaCore: '#ffe27a',
  lavaDeep: '#c9401c',
  smoke: '#a9a299',
  smokeLight: '#d9d3c8',
  smokeDim: '#8b857d',
  spark: '#f1b92e',
  sparkLight: '#fff0a8',
  glow: '#ffa544',
})

const CONE_W = 29
const CONE_H = 14
const CONE_X = 136
const CONE_Y = 16
const CRATER_X = 150 + S
const CRATER_Y = 17

const LAVA_RUNS: readonly (readonly [number, number, 0 | 1])[] = [
  [12, 2, 1],
  [11, 3, 0],
  [11, 4, 0],
  [10, 5, 0],
  [10, 6, 0],
  [9, 7, 0],
  [16, 2, 1],
  [17, 3, 0],
  [17, 4, 0],
  [18, 5, 0],
  [14, 2, 1],
  [14, 3, 1],
  [15, 4, 0],
  [15, 5, 0],
  [15, 6, 0],
  [14, 7, 0],
  [14, 8, 0],
]

let coneSprite: PixelBuffer | null = null

function cone(): PixelBuffer {
  if (coneSprite) return coneSprite
  const out = createBuffer(CONE_W, CONE_H)
  const cx = 14
  for (let row = 1; row < CONE_H; row++) {
    const u = (row - 1) / (CONE_H - 2)
    const half = Math.round(3 + 10 * Math.pow(u, 1.2))
    for (let x = cx - half; x <= cx + half; x++) {
      const side = (x - cx) / (half + 0.5)
      const ridge = mod(x * 7 + row * 13, 11) === 0
      let c = VOLC.rock
      if (side < -0.42) c = VOLC.rockLight
      else if (side > 0.5) c = VOLC.rockDark
      if (ridge) c = side > 0.5 ? VOLC.rockDeep : VOLC.rockDark
      if (x === cx - half) c = VOLC.rockLight
      if (x === cx + half) c = VOLC.rockDeep
      setPixel(out, x, row, c)
    }
  }
  for (const x of [cx - 3, cx - 2, cx + 2, cx + 3])
    setPixel(out, x, 0, VOLC.rim)
  setPixel(out, cx - 3, 1, VOLC.rim)
  setPixel(out, cx + 3, 1, VOLC.rim)
  for (let x = cx - 2; x <= cx + 2; x++) setPixel(out, x, 1, VOLC.lavaDeep)
  for (const [x, y, hot] of LAVA_RUNS)
    setPixel(out, x, y, hot ? VOLC.lavaHot : VOLC.lava)
  coneSprite = out
  return out
}

const RUMBLE_MS = 640
const RING_FROM_MS = 180
const RING_MS = 1900
const ERUPT_MS = 2300
const FOUNTAIN_MS = 1300

function smokeRing(buf: PixelBuffer, since: number): void {
  const age = since - RING_FROM_MS
  if (age < 0 || age >= RING_MS) return
  const p = age / RING_MS
  const ease = 1 - (1 - p) * (1 - p)
  const cy = CRATER_Y - 3 - ease * 8
  const rx = 2.5 + ease * 6.5
  const ry = 1 + ease * 1.8
  const a = Math.min(1, p * 8) * Math.min(1, (1 - p) * 1.8)
  const steps = 48
  for (let i = 0; i < steps; i++) {
    const th = (i / steps) * Math.PI * 2
    const x = Math.round(CRATER_X + Math.cos(th) * rx)
    const y = Math.round(cy + Math.sin(th) * ry)
    const near = Math.sin(th) > 0
    blend(buf, x, y, near ? VOLC.smoke : VOLC.smokeLight, a)
    if (near) blend(buf, x, y + 1, VOLC.smokeDim, a * 0.6)
  }
}

function volcanoBack(buf: PixelBuffer, m: RoomMoment): void {
  const pat = sincePat(m)
  const coins = sinceCoins(m)
  const erupting = within(coins, ERUPT_MS)
  let dx = 0
  if (within(pat, RUMBLE_MS)) dx = Math.floor(pat / 80) % 2 === 0 ? -1 : 1
  else if (within(coins, 400)) dx = Math.floor(coins / 80) % 2 === 0 ? 1 : -1
  blit(buf, cone(), CONE_X + S + dx, CONE_Y)

  const beat = Math.floor(m.tMs / 300)
  for (let i = -2; i <= 2; i++) {
    const hot = erupting || mod(beat + i * 2, 5) < 2
    setPixel(
      buf,
      CRATER_X + dx + i,
      CRATER_Y,
      erupting ? VOLC.lavaCore : hot ? VOLC.lavaHot : VOLC.lava
    )
  }

  if (within(coins, FOUNTAIN_MS)) {
    const p = coins / FOUNTAIN_MS
    const height = Math.round(5 * Math.sin(Math.min(1, p * 1.25) * Math.PI))
    for (let j = 1; j <= height; j++) {
      const wide = j < height - 1
      setPixel(buf, CRATER_X + dx, CRATER_Y - j, VOLC.lavaCore)
      if (wide) {
        setPixel(buf, CRATER_X + dx - 1, CRATER_Y - j, VOLC.lavaHot)
        setPixel(buf, CRATER_X + dx + 1, CRATER_Y - j, VOLC.spark)
      }
    }
  }

  const puffs = 3
  const lifeMs = 3000
  for (let i = 0; i < puffs; i++) {
    const age = mod(m.tMs + (i * lifeMs) / puffs + 700, lifeMs)
    const p = age / lifeMs
    const x = Math.round(CRATER_X - 1 + p * 4 + Math.sin(p * 6 + i) * 1.2)
    const y = Math.round(CRATER_Y - 3 - p * 9)
    const a = Math.min(1, p * 6) * (1 - p) * 0.9
    const size = p < 0.6 ? 2 : 1
    square(buf, x, y, size, VOLC.smoke, a)
    blend(buf, x, y, VOLC.smokeLight, a)
  }
  smokeRing(buf, pat)
}

const SPARKS = 16
const SPARK_MS = 1800

function volcanoFx(buf: PixelBuffer, m: RoomMoment, subject: PixelMask): void {
  const coins = sinceCoins(m)
  const erupting = within(coins, ERUPT_MS)
  const dark = isDarkTime(m.time)
  const breathe = 0.5 + 0.5 * Math.sin(m.tMs * 0.0021)
  let lit = (dark ? 0.34 : 0.08) * (0.7 + 0.3 * breathe)
  let radius = dark ? 14 : 9
  if (erupting) {
    const p = coins / ERUPT_MS
    const env = Math.min(1, p * 14) * (1 - p) * (1 - p)
    lit += (dark ? 0.8 : 0.62) * env
    radius += 22 * Math.min(1, p * 10)
  }
  glow(buf, CRATER_X, CRATER_Y - 1, radius, VOLC.glow, lit)
  if (!erupting) return
  for (let i = 0; i < SPARKS; i++) {
    const age = coins - i * 40
    if (age < 0 || age >= SPARK_MS) continue
    const side = mod(i * 7, SPARKS) / (SPARKS - 1) - 0.5
    const vx = side * 0.05
    const vy = 0.019 + mod(i * 5, 4) * 0.003
    const x = Math.round(CRATER_X + vx * age)
    const y = Math.round(CRATER_Y - 2 - vy * age + 0.00003 * age * age)
    if (x < 0 || y < 1 || x >= buf.width || y >= WALL_FLOOR_Y) continue
    if (subject.data[y * buf.width + x]) continue
    const a = Math.min(1, (1 - age / SPARK_MS) * 2.6)
    const rising = vy > 0.00006 * age
    blend(buf, x, y, i % 3 === 0 ? VOLC.sparkLight : VOLC.spark, a)
    blend(buf, x, y + (rising ? 1 : -1), VOLC.lava, a * 0.7)
  }
}

export const SHELF_LIVE: RoomLiveSet<ShelfId> = {
  hourglass: { back: hourglassBack },
  tea: { back: teaBack },
  gramophone: { back: gramophoneBack, fx: gramophoneFx },
  volcano: { back: volcanoBack, fx: volcanoFx },
}
