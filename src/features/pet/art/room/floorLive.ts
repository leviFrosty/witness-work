import {
  createRng,
  rgbPalette,
  type PixelBuffer,
  type PixelMask,
} from '@/lib/pixelArt'
import type { FloorId } from '@/types/pet'

import { blend, isDarkTime, showStrength } from '../fx'
import { SCENE_H, SCENE_W } from '../layout'
import { FLOOR_TOP, LAWN_FLOWERS } from './floor'
import {
  sinceCoins,
  sincePat,
  within,
  type RoomLiveSet,
  type RoomMoment,
} from './live'
import { isWindowPane } from './window'

const TAU = Math.PI * 2

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

const smooth = (v: number): number => {
  const u = clamp01(v)
  return u * u * (3 - 2 * u)
}

const easeOut = (v: number): number => {
  const u = 1 - clamp01(v)
  return 1 - u * u * u
}

function put(
  buf: PixelBuffer,
  open: PixelMask,
  px: number,
  py: number,
  c: number
): void {
  const x = Math.round(px)
  const y = Math.round(py)
  if (x < 0 || x >= SCENE_W || y < FLOOR_TOP || y >= SCENE_H) return
  const p = y * SCENE_W + x
  if (open.data[p] !== 1) return
  const k = p * 4
  const d = buf.data
  d[k] = (c >> 16) & 255
  d[k + 1] = (c >> 8) & 255
  d[k + 2] = c & 255
}

function tint(
  buf: PixelBuffer,
  open: PixelMask,
  px: number,
  py: number,
  c: number,
  a: number
): void {
  const x = Math.round(px)
  const y = Math.round(py)
  if (a <= 0 || x < 0 || x >= SCENE_W || y < FLOOR_TOP || y >= SCENE_H) return
  const p = y * SCENE_W + x
  if (open.data[p] !== 1) return
  const k = p * 4
  const d = buf.data
  const v = a > 1 ? 1 : a
  d[k] += (((c >> 16) & 255) - d[k]) * v
  d[k + 1] += (((c >> 8) & 255) - d[k + 1]) * v
  d[k + 2] += ((c & 255) - d[k + 2]) * v
}

function ring(
  buf: PixelBuffer,
  open: PixelMask,
  cx: number,
  cy: number,
  r: number,
  c: number,
  a: number
): void {
  if (a <= 0 || r <= 0) return
  const n = Math.max(6, Math.ceil(r * 4))
  let lastX = NaN
  let lastY = NaN
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU
    const x = Math.round(cx + Math.cos(th) * r)
    const y = Math.round(cy + Math.sin(th) * r * 0.45)
    if (x === lastX && y === lastY) continue
    lastX = x
    lastY = y
    tint(buf, open, x, y, c, a)
  }
}

const GRASS = rgbPalette({
  root: '#4d7f31',
  blade: '#63993b',
  mid: '#93c858',
  tip: '#cdee8c',
})

interface Blade {
  readonly dx: number
  readonly h: number
  readonly lean: number
}

interface Tuft {
  readonly x: number
  readonly y: number
  readonly phase: number
  readonly blades: readonly Blade[]
}

const nearFlower = (x: number, y: number): boolean =>
  LAWN_FLOWERS.some(
    ([fx, fy]) => Math.abs(x - fx) < 5 && y - fy > -2 && y - fy < 8
  )

const TUFTS: readonly Tuft[] = (() => {
  const r = createRng(1207)
  const out: Tuft[] = []
  for (let row = 0; row * 5 + 67 < SCENE_H + 3; row++) {
    const rowY = Math.min(SCENE_H - 1, 67 + row * 5)
    for (let col = (row % 2) * 5 - 3; col < SCENE_W + 3; col += 10) {
      const x = col + Math.floor(r() * 6)
      const y = Math.min(SCENE_H - 1, rowY - Math.floor(r() * 3))
      const count = 3 + Math.floor(r() * 2)
      const tall = 5 + Math.floor(r() * 3)
      const blades: Blade[] = []
      for (let i = 0; i < count; i++) {
        const side = i - (count - 1) / 2
        blades.push({
          dx: Math.round(side * 2),
          h: tall - Math.round(Math.abs(side)) - Math.floor(r() * 2),
          lean: side * 1.2 + (r() - 0.5) * 0.8,
        })
      }
      const phase = r() * 0.8
      if (r() < 0.14 || nearFlower(x, y)) continue
      out.push({ x, y, phase, blades })
    }
  }
  return out
})()

function drawGrass(buf: PixelBuffer, m: RoomMoment, open: PixelMask): void {
  const t = m.tMs
  for (const tuft of TUFTS) {
    const sway =
      1.5 * Math.sin(t * 0.0019 + tuft.x * 0.045 + tuft.y * 0.09 + tuft.phase) +
      0.6 * Math.sin(t * 0.0041 + tuft.x * 0.11)
    for (const blade of tuft.blades) {
      const top = blade.h - 1
      let last = tuft.x + blade.dx
      for (let k = 0; k <= top; k++) {
        const u = k / top
        const x = tuft.x + blade.dx + Math.round((blade.lean + sway) * u * u)
        const c =
          k === top
            ? GRASS.tip
            : u > 0.4
              ? GRASS.mid
              : k === 0
                ? GRASS.root
                : GRASS.blade
        if (x - last > 1) put(buf, open, x - 1, tuft.y - k, c)
        else if (last - x > 1) put(buf, open, x + 1, tuft.y - k, c)
        put(buf, open, x, tuft.y - k, c)
        last = x
      }
    }
  }
}

const SEA = rgbPalette({
  foam: '#ffffff',
  foamSoft: '#e4f6f4',
  shallow: '#8fd8d4',
  deep: '#3f9fb8',
  wet: '#b9995f',
  glint: '#d9f6f2',
})

const WAVE_MS = 5600
const WAVE_IN = 0.3
const WAVE_OUT_Y = 95.4
const WAVE_REACH = 7.6

const wavePhase = (tMs: number): number => {
  const p = (tMs / WAVE_MS + 0.27) % 1
  return p < 0 ? p + 1 : p
}

const PEAK_ROW = new Int16Array(SCENE_W)
for (let x = 0; x < SCENE_W; x++)
  PEAK_ROW[x] = Math.round(
    WAVE_OUT_Y -
      WAVE_REACH +
      1.1 * Math.sin(x * 0.085 + 0.9) +
      0.7 * Math.sin(x * 0.21 + 2)
  )

function drawShore(buf: PixelBuffer, m: RoomMoment, open: PixelMask): void {
  const t = m.tMs
  const ph = wavePhase(t)
  const reach =
    ph < WAVE_IN
      ? easeOut(ph / WAVE_IN)
      : 1 - smooth((ph - WAVE_IN) / (1 - WAVE_IN))
  const drying = ph < WAVE_IN ? 0.12 : 1 - 0.88 * ((ph - WAVE_IN) / 0.7)
  const lace = ph < WAVE_IN ? 0 : 1 - (ph - WAVE_IN) / 0.4
  const froth = Math.floor(t / 500)
  for (let x = 0; x < SCENE_W; x++) {
    const wobble =
      1.1 * Math.sin(x * 0.085 + 0.9 + t * 0.0005) +
      0.7 * Math.sin(x * 0.21 + 2 - t * 0.0008)
    const edge = Math.round(WAVE_OUT_Y - WAVE_REACH * reach + wobble)
    const peak = PEAK_ROW[x]
    for (let y = peak; y < edge; y++)
      tint(buf, open, x, y, SEA.wet, 0.5 * drying)
    if (lace > 0 && edge > peak && (x * 7 + (x >> 3)) % 5 < 2)
      tint(buf, open, x, peak, SEA.foam, 0.75 * lace)
    for (let y = Math.max(edge, FLOOR_TOP); y < SCENE_H; y++) {
      const d = y - edge
      if (d === 0) {
        tint(buf, open, x, y, SEA.foam, 0.96)
      } else if (d === 1) {
        const frothy = (x + froth * 3 + (x >> 2)) % 4 < 2
        tint(buf, open, x, y, frothy ? SEA.foamSoft : SEA.shallow, 0.78)
      } else {
        const depth = Math.min(1, (d - 2) / 6)
        tint(buf, open, x, y, SEA.shallow, 0.72)
        tint(buf, open, x, y, SEA.deep, depth * 0.7)
      }
    }
  }
  for (let i = 0; i < 6; i++) {
    const x = (i * 37 + t * 0.006 * (i % 2 ? 1 : -1)) % SCENE_W
    const gx = Math.round(x < 0 ? x + SCENE_W : x)
    const gy = 97 + (i % 3)
    for (let k = 0; k < 3 + (i % 2); k++)
      tint(buf, open, gx + k, gy, SEA.glint, 0.55)
  }
}

const POND = rgbPalette({
  shadow: '#2f7f86',
  ripple: '#d2f5ea',
  light: '#d6f6ff',
  splash: '#e6fbf7',
  gold: '#f1b92e',
  goldLight: '#fff0a8',
  goldDark: '#b0761a',
  eye: '#2a2018',
  white: '#fbf6ea',
  cream: '#f1e3c4',
  orange: '#ee7b28',
  red: '#d9482f',
  ink: '#34313a',
  butter: '#f4cf6a',
})

interface Koi {
  readonly cx: number
  readonly cy: number
  readonly ax: number
  readonly ay: number
  readonly n: 1 | 2
  readonly phase: number
  readonly lapMs: number
  readonly dir: 1 | -1
  readonly size: number
  readonly coat: readonly number[]
  readonly fin: number
}

const KOI: readonly Koi[] = [
  {
    cx: 36,
    cy: 82,
    ax: 30,
    ay: 11,
    n: 1,
    phase: 2.5,
    lapMs: 17000,
    dir: 1,
    size: 1.15,
    coat: [POND.white, POND.orange, POND.white, POND.orange, POND.white],
    fin: POND.cream,
  },
  {
    cx: 118,
    cy: 81,
    ax: 46,
    ay: 12,
    n: 2,
    phase: 0.4,
    lapMs: 26000,
    dir: 1,
    size: 1.25,
    coat: [POND.orange, POND.orange, POND.red, POND.orange, POND.orange],
    fin: POND.butter,
  },
  {
    cx: 92,
    cy: 71,
    ax: 82,
    ay: 4,
    n: 1,
    phase: 2.2,
    lapMs: 34000,
    dir: -1,
    size: 1.05,
    coat: [POND.white, POND.white, POND.red, POND.white, POND.white],
    fin: POND.cream,
  },
  {
    cx: 96,
    cy: 95,
    ax: 78,
    ay: 3,
    n: 1,
    phase: 3.9,
    lapMs: 30000,
    dir: 1,
    size: 1.25,
    coat: [POND.ink, POND.orange, POND.ink, POND.white, POND.orange],
    fin: POND.cream,
  },
  {
    cx: 150,
    cy: 86,
    ax: 22,
    ay: 10,
    n: 1,
    phase: 5.1,
    lapMs: 15000,
    dir: -1,
    size: 1.05,
    coat: [POND.butter, POND.butter, POND.white, POND.butter, POND.butter],
    fin: POND.white,
  },
  {
    cx: 30,
    cy: 92,
    ax: 26,
    ay: 5,
    n: 2,
    phase: 1.3,
    lapMs: 21000,
    dir: -1,
    size: 0.95,
    coat: [POND.red, POND.white, POND.white, POND.red, POND.white],
    fin: POND.cream,
  },
]

const KOI_RADII = [1.5, 2.2, 2.4, 2.1, 1.6, 1.1, 0.7] as const
const KOI_COAT = [0, 1, 1, 2, 3, 4, 4] as const
const KOI_JOINTS = KOI_RADII.length
const KOI_STEP = 1.7
const DART_RISE_MS = 320
const DART_FALL_MS = 2600
const DART_TURN = 0.55

function dart(since: number): number {
  if (since < 0 || since >= DART_RISE_MS + DART_FALL_MS) return 0
  if (since < DART_RISE_MS) return easeOut(since / DART_RISE_MS)
  return 1 - (since - DART_RISE_MS) / DART_FALL_MS
}

const koiAngle = (koi: Koi, tMs: number, since: number): number =>
  koi.phase + koi.dir * ((tMs / koi.lapMs) * TAU + DART_TURN * dart(since))

const koiX = (koi: Koi, th: number): number => koi.cx + koi.ax * Math.cos(th)

const koiY = (koi: Koi, th: number): number =>
  koi.cy + koi.ay * Math.sin(koi.n * th)

const koiSpeed = (koi: Koi, th: number): number =>
  Math.hypot(koi.ax * Math.sin(th), koi.ay * koi.n * Math.cos(koi.n * th)) || 1

function stamp(
  buf: PixelBuffer,
  open: PixelMask,
  cx: number,
  cy: number,
  r: number,
  c: number,
  a: number
): void {
  const x0 = Math.round(cx)
  const y0 = Math.round(cy)
  const rr = r * r
  const reach = Math.ceil(r)
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const v = dy / 0.82
      if (dx * dx + v * v > rr) continue
      if (a >= 1) put(buf, open, x0 + dx, y0 + dy, c)
      else tint(buf, open, x0 + dx, y0 + dy, c, a)
    }
  }
}

const spineX = new Float32Array(KOI_JOINTS + 1)
const spineY = new Float32Array(KOI_JOINTS + 1)

function drawKoiFish(
  buf: PixelBuffer,
  open: PixelMask,
  koi: Koi,
  tMs: number,
  since: number
): void {
  let th = koiAngle(koi, tMs, since)
  const wag = Math.sin(tMs * 0.007 + koi.phase * 3)
  for (let j = 0; j <= KOI_JOINTS; j++) {
    spineX[j] = koiX(koi, th)
    spineY[j] = koiY(koi, th)
    th -= (koi.dir * KOI_STEP * koi.size) / koiSpeed(koi, th)
  }
  const hx = spineX[0] - spineX[2]
  const hy = spineY[0] - spineY[2]
  const hl = Math.hypot(hx, hy) || 1
  const nx = -hy / hl
  const ny = hx / hl
  const bend = (j: number) => (j >= 4 ? wag * (j - 3) * 0.4 : 0)
  for (let j = 0; j < KOI_JOINTS; j++)
    stamp(
      buf,
      open,
      spineX[j] + nx * bend(j) + 1,
      spineY[j] + ny * bend(j) + 2,
      KOI_RADII[j] * koi.size + 0.5,
      POND.shadow,
      0.5
    )
  const reach = KOI_RADII[2] * koi.size + 0.7
  for (const side of [1, -1]) {
    const fx = spineX[2] + nx * reach * side - (hx / hl) * 0.8
    const fy = spineY[2] + ny * reach * side * 0.82 - (hy / hl) * 0.8
    tint(buf, open, fx, fy, koi.fin, 0.9)
    tint(buf, open, fx - hx / hl, fy - hy / hl, koi.fin, 0.7)
  }
  const tx = spineX[KOI_JOINTS] + nx * bend(KOI_JOINTS)
  const ty = spineY[KOI_JOINTS] + ny * bend(KOI_JOINTS)
  for (const side of [1, -1]) {
    tint(buf, open, tx + nx * side, ty + ny * side, koi.fin, 0.9)
    tint(
      buf,
      open,
      tx + nx * side * 2 - hx / hl,
      ty + ny * side * 2 - hy / hl,
      koi.fin,
      0.85
    )
  }
  tint(buf, open, tx, ty, koi.fin, 0.9)
  for (let j = KOI_JOINTS - 1; j >= 0; j--)
    stamp(
      buf,
      open,
      spineX[j] + nx * bend(j),
      spineY[j] + ny * bend(j),
      KOI_RADII[j] * koi.size,
      koi.coat[KOI_COAT[j]],
      1
    )
}

const RIPPLE_SPOTS: readonly (readonly [number, number, number, number])[] = [
  [20, 74, 5200, 0],
  [86, 68, 6400, 2100],
  [132, 92, 5800, 900],
  [164, 76, 7000, 3300],
  [58, 97, 6100, 4200],
  [108, 76, 7600, 5200],
]

const GLINTS: readonly (readonly [number, number, number, number])[] = [
  [10, 68, 4, 0.004],
  [64, 72, 5, -0.003],
  [120, 70, 3, 0.005],
  [150, 96, 5, -0.004],
  [30, 98, 4, 0.003],
  [92, 90, 3, -0.005],
  [170, 84, 4, 0.004],
  [44, 80, 3, -0.003],
]

const PAT_RING_MS = 1500
const KOI_LEAP_MS = 1500
const LEAP_START_MS = 140
const LEAP_FLIGHT_MS = 760
const LEAP_FROM: readonly [number, number] = [24, 96]
const LEAP_TO: readonly [number, number] = [47, 97]
const LEAP_RISE = 17

function drawKoi(buf: PixelBuffer, m: RoomMoment, open: PixelMask): void {
  const t = m.tMs
  const pat = sincePat(m)
  for (const koi of KOI) drawKoiFish(buf, open, koi, t, pat)
  for (const [x, y, len, drift] of GLINTS) {
    const gx = (((x + t * drift) % SCENE_W) + SCENE_W) % SCENE_W
    const a = 0.3 + 0.25 * Math.sin(t * 0.0013 + x)
    for (let k = 0; k < len; k++) tint(buf, open, gx + k, y, POND.ripple, a)
  }
  for (const [x, y, period, offset] of RIPPLE_SPOTS) {
    const age = (((t + offset) % period) + period) % period
    if (age > 2600) continue
    const p = age / 2600
    ring(buf, open, x, y, 1.5 + p * 7, POND.ripple, 0.55 * (1 - p))
    if (p > 0.3)
      ring(buf, open, x, y, (p - 0.3) * 7, POND.ripple, 0.4 * (1 - p))
  }
  if (within(pat, PAT_RING_MS)) {
    const p = pat / PAT_RING_MS
    for (const koi of KOI) {
      const th = koiAngle(koi, m.patMs, -1)
      const x = koiX(koi, th)
      const y = koiY(koi, th)
      ring(buf, open, x, y, 2 + p * 11, POND.ripple, 0.8 * (1 - p))
      if (p > 0.25)
        ring(buf, open, x, y, (p - 0.25) * 11, POND.ripple, 0.55 * (1 - p))
    }
  }
  const coins = sinceCoins(m)
  if (within(coins, KOI_LEAP_MS)) {
    for (const [at, from] of [
      [LEAP_FROM, 0],
      [LEAP_TO, LEAP_START_MS + LEAP_FLIGHT_MS],
    ] as const) {
      const age = coins - from
      if (age < 0 || age >= 600) continue
      const p = age / 600
      ring(buf, open, at[0], at[1], 1.5 + p * 8, POND.ripple, 0.85 * (1 - p))
      if (p > 0.3)
        ring(buf, open, at[0], at[1], (p - 0.3) * 8, POND.ripple, 0.6 * (1 - p))
    }
  }
}

const CAUSTIC = {
  x: new Float32Array(SCENE_W),
  y: new Float32Array(FLOOR_TOP),
  mix: new Float32Array(SCENE_W + FLOOR_TOP),
}

function drawPondLight(
  buf: PixelBuffer,
  m: RoomMoment,
  subject: PixelMask
): void {
  const k = m.tMs * 0.0009
  for (let x = 0; x < SCENE_W; x++) CAUSTIC.x[x] = Math.sin(x * 0.27 + k)
  for (let y = 0; y < FLOOR_TOP; y++)
    CAUSTIC.y[y] = Math.sin(y * 0.41 - k * 0.7)
  for (let i = 0; i < CAUSTIC.mix.length; i++)
    CAUSTIC.mix[i] = Math.sin(i * 0.17 + k * 0.45)
  const base = isDarkTime(m.time) ? 0.22 : 0.16
  const d = buf.data
  const r = (POND.light >> 16) & 255
  const g = (POND.light >> 8) & 255
  const b = POND.light & 255
  for (let y = 8; y < FLOOR_TOP; y++) {
    const a = base * (0.3 + (0.7 * (y - 8)) / (FLOOR_TOP - 8))
    const row = CAUSTIC.y[y]
    const lean = Math.round(y * 0.6)
    for (let x = 0; x < SCENE_W; x++) {
      const v = CAUSTIC.x[x] + row + CAUSTIC.mix[x + lean]
      if (v < 1.1 || v > 1.45) continue
      if (isWindowPane(x, y)) continue
      const p = y * SCENE_W + x
      if (subject.data[p]) continue
      const i = p * 4
      d[i] += (r - d[i]) * a
      d[i + 1] += (g - d[i + 1]) * a
      d[i + 2] += (b - d[i + 2]) * a
    }
  }
}

const LEAP_RADII = [1.7, 2.4, 2.3, 1.8, 1.3, 0.8] as const
const LEAP_STEP = 0.042

function goldStamp(
  buf: PixelBuffer,
  subject: PixelMask,
  cx: number,
  cy: number,
  r: number,
  c: number
): void {
  const x0 = Math.round(cx)
  const y0 = Math.round(cy)
  const reach = Math.ceil(r)
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      if (dx * dx + dy * dy > r * r) continue
      const x = x0 + dx
      const y = y0 + dy
      if (x < 0 || y < 0 || x >= SCENE_W || y >= SCENE_H) continue
      if (subject.data[y * SCENE_W + x]) continue
      blend(buf, x, y, c, 1)
    }
  }
}

const leapX = (p: number): number =>
  LEAP_FROM[0] + (LEAP_TO[0] - LEAP_FROM[0]) * p

const leapY = (p: number): number =>
  LEAP_FROM[1] + (LEAP_TO[1] - LEAP_FROM[1]) * p - 4 * LEAP_RISE * p * (1 - p)

function drawKoiLeap(
  buf: PixelBuffer,
  m: RoomMoment,
  subject: PixelMask
): void {
  const since = sinceCoins(m)
  if (!within(since, KOI_LEAP_MS)) return
  const flight = (since - LEAP_START_MS) / LEAP_FLIGHT_MS
  const joints = LEAP_RADII.length
  if (flight > 0 && flight < 1 + joints * LEAP_STEP) {
    const tail = flight - joints * LEAP_STEP
    if (tail > 0 && tail < 1) {
      const tx = leapX(tail)
      const ty = leapY(tail)
      const ax = leapX(tail + 0.02) - tx
      const ay = leapY(tail + 0.02) - ty
      const al = Math.hypot(ax, ay) || 1
      for (const side of [1, -1]) {
        const fx = tx + (-ay / al) * side * 1.6 - (ax / al) * 0.6
        const fy = ty + (ax / al) * side * 1.6 - (ay / al) * 0.6
        goldStamp(buf, subject, fx, fy, 1, POND.goldDark)
        blend(buf, fx, fy, POND.goldLight, 0.8)
      }
    }
    for (let j = joints - 1; j >= 0; j--) {
      const p = flight - j * LEAP_STEP
      if (p <= 0 || p >= 1) continue
      goldStamp(buf, subject, leapX(p), leapY(p), LEAP_RADII[j], POND.goldDark)
    }
    for (let j = joints - 1; j >= 0; j--) {
      const p = flight - j * LEAP_STEP
      if (p <= 0 || p >= 1) continue
      const x = leapX(p)
      const y = leapY(p)
      goldStamp(buf, subject, x, y - 0.5, LEAP_RADII[j] - 0.6, POND.gold)
      if (j === 1 || j === 2) {
        blend(buf, x, y - 1, POND.goldLight, 1)
        blend(buf, x - 1, y - 1, POND.goldLight, 0.7)
      }
    }
    if (flight < 1) {
      const up = leapY(flight + 0.02) < leapY(flight) ? -1 : 1
      blend(buf, leapX(flight) + 1, leapY(flight) + up * 0.4, POND.eye, 1)
    }
  }
  for (const [at, from, count] of [
    [LEAP_FROM, LEAP_START_MS - 80, 7],
    [LEAP_TO, LEAP_START_MS + LEAP_FLIGHT_MS - 20, 9],
  ] as const) {
    const age = since - from
    if (age < 0 || age >= 600) continue
    const a = Math.min(1, (1 - age / 600) * 1.6)
    for (let i = 0; i < count; i++) {
      const side = i - (count - 1) / 2
      const vx = side * 0.013
      const vy = -0.036 - (i % 3) * 0.01
      const x = at[0] + vx * age
      const y = at[1] + vy * age + 0.0001 * age * age
      if (y > at[1] + 1) continue
      blend(buf, x, y, POND.splash, a)
      blend(buf, x, y - 1, POND.splash, a * (i % 2 ? 0.5 : 0.9))
    }
  }
}

const FLY = rgbPalette({
  core: '#f6ff9a',
  halo: '#c8ea5c',
  gold: '#ffd34a',
  goldCore: '#fff6c2',
  day: '#f4f7c8',
})

interface Firefly {
  readonly cx: number
  readonly low: number
  readonly high: number
  readonly ax: number
  readonly ay: number
  readonly wx: number
  readonly wy: number
  readonly px: number
  readonly py: number
  readonly blink: number
  readonly behind: boolean
  readonly early: boolean
}

const FIREFLIES: readonly Firefly[] = (() => {
  const r = createRng(9091)
  const out: Firefly[] = []
  const count = 18
  for (let i = 0; i < count; i++) {
    const cx = 8 + ((i * 53) % 164) + r() * 6
    out.push({
      cx,
      low: 66 + r() * 30,
      high: 10 + r() * 46,
      ax: 5 + r() * 9,
      ay: 2 + r() * 4,
      wx: 0.00045 + r() * 0.0005,
      wy: 0.0007 + r() * 0.0007,
      px: r() * TAU,
      py: r() * TAU,
      blink: r() * TAU,
      behind: i % 3 === 0,
      early: i % 3 === 1,
    })
  }
  return out
})()

const SWIRL_MS = 2600
const SWIRL_AT: readonly [number, number] = [68, 62]
const GATHER_MS = 2000
const GATHER_AT: readonly [number, number] = [101, 43]

const forestShow = (m: RoomMoment): number => showStrength(m)

function drawFireflies(
  buf: PixelBuffer,
  m: RoomMoment,
  subject: PixelMask
): void {
  const t = m.tMs
  const show = forestShow(m)
  const pat = sincePat(m)
  const coins = sinceCoins(m)
  const swirl = within(pat, SWIRL_MS) ? smooth(pat / SWIRL_MS) : 1
  const pull = within(pat, SWIRL_MS) ? Math.sin(Math.PI * (pat / SWIRL_MS)) : 0
  const cos = Math.cos(swirl * TAU)
  const sin = Math.sin(swirl * TAU)
  const gather = within(coins, GATHER_MS)
    ? Math.pow(Math.sin(Math.PI * (coins / GATHER_MS)), 0.6)
    : 0
  const flash = within(coins - 800, 500)
    ? Math.sin(Math.PI * ((coins - 800) / 500))
    : 0
  const count = FIREFLIES.length
  for (let i = 0; i < count; i++) {
    const fly = FIREFLIES[i]
    const lift = fly.early ? 0.35 + 0.65 * show : show
    const cy = fly.low + (fly.high - fly.low) * lift
    let x = fly.cx + fly.ax * Math.sin(t * fly.wx + fly.px)
    let y = cy + fly.ay * Math.sin(t * fly.wy + fly.py)
    if (pull > 0) {
      const dx = (x - SWIRL_AT[0]) * (1 - 0.45 * pull)
      const dy = (y - SWIRL_AT[1]) * (1 - 0.45 * pull)
      x = SWIRL_AT[0] + dx * cos - dy * sin * 1.6
      y = SWIRL_AT[1] + dx * sin * 0.6 + dy * cos
    }
    if (gather > 0) {
      const a = i * 2.4 + t * 0.0022
      const spread = 7.5 * Math.sqrt((i + 0.5) / count) * (1 - 0.35 * flash)
      const gx = GATHER_AT[0] + Math.cos(a) * spread
      const gy = GATHER_AT[1] + Math.sin(a) * spread
      x += (gx - x) * gather
      y += (gy - y) * gather
    }
    const ix = Math.round(x)
    const iy = Math.round(y)
    if (ix < 1 || iy < 5 || ix >= SCENE_W - 1 || iy >= SCENE_H - 1) continue
    if (fly.behind && subject.data[iy * SCENE_W + ix]) continue
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.0031 + fly.blink)
    const glowing = Math.max(show, gather, fly.early ? 0.25 : 0)
    const lit = Math.max(pulse * pulse, flash, gather * 0.8)
    const gold = gather > 0.02
    const core = gold ? FLY.goldCore : glowing > 0.3 ? FLY.core : FLY.day
    const halo = gold ? FLY.gold : FLY.halo
    blend(buf, ix, iy, core, 0.45 + 0.55 * Math.max(lit, glowing * 0.5))
    const a = glowing * (0.18 + 0.5 * lit)
    if (a <= 0.02) continue
    blend(buf, ix - 1, iy, halo, a)
    blend(buf, ix + 1, iy, halo, a)
    blend(buf, ix, iy - 1, halo, a)
    blend(buf, ix, iy + 1, halo, a)
    const far = a * 0.45 * (0.4 + lit)
    blend(buf, ix - 1, iy - 1, halo, far)
    blend(buf, ix + 1, iy - 1, halo, far)
    blend(buf, ix - 1, iy + 1, halo, far)
    blend(buf, ix + 1, iy + 1, halo, far)
    if (flash > 0.2 || lit > 0.85) {
      const ray = a * 0.6
      blend(buf, ix - 2, iy, halo, ray)
      blend(buf, ix + 2, iy, halo, ray)
      blend(buf, ix, iy - 2, halo, ray)
      blend(buf, ix, iy + 2, halo, ray)
    }
  }
}

export const FLOOR_LIVE: RoomLiveSet<FloorId> = {
  grass: { back: drawGrass },
  shore: { back: drawShore },
  koi: {
    back: drawKoi,
    fx(buf, m, subject) {
      drawPondLight(buf, m, subject)
      drawKoiLeap(buf, m, subject)
    },
  },
  forest: {
    fx: drawFireflies,
    dim: (m) => (isDarkTime(m.time) ? 0.35 : 0.6 * forestShow(m)),
  },
}
