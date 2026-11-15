import {
  createRng,
  mix,
  rgbPalette,
  type PixelBuffer,
  type PixelMask,
} from '@/lib/pixelArt'
import type { FloorId } from '@/types/pet'

import { blend, isDarkTime, showStrength } from '../fx'
import { SCENE_H, SCENE_W } from '../layout'
import { FLOOR_TOP, LAWN_FLOWERS } from './floor'
import { drawForestLife, hash01, wander } from './forestLife'
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

type Point = readonly [x: number, y: number]

type Patch = readonly [from: number, to: number, side: -1 | 0 | 1, c: number]

interface KoiPath {
  readonly x: Float32Array
  readonly z: Float32Array
  readonly length: number
}

const POND_TILT = 0.62
const BODY_SQUASH = 0.82
const PATH_STEP = 0.5
const PATH_FINE = 32

function koiPath(points: readonly Point[]): KoiPath {
  const n = points.length
  const fx: number[] = []
  const fz: number[] = []
  for (let i = 0; i < n; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % n]
    const [x2, y2] = points[(i + 2) % n]
    const [x3, y3] = points[(i + 3) % n]
    for (let k = 0; k < PATH_FINE; k++) {
      const u = k / PATH_FINE
      const v = 1 - u
      const b0 = (v * v * v) / 6
      const b1 = (3 * u * u * u - 6 * u * u + 4) / 6
      const b2 = (-3 * u * u * u + 3 * u * u + 3 * u + 1) / 6
      const b3 = (u * u * u) / 6
      fx.push(b0 * x0 + b1 * x1 + b2 * x2 + b3 * x3)
      fz.push((b0 * y0 + b1 * y1 + b2 * y2 + b3 * y3) / POND_TILT)
    }
  }
  const m = fx.length
  const at = new Float64Array(m + 1)
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m
    at[i + 1] = at[i] + Math.hypot(fx[j] - fx[i], fz[j] - fz[i])
  }
  const length = at[m]
  const count = Math.ceil(length / PATH_STEP)
  const x = new Float32Array(count)
  const z = new Float32Array(count)
  let seg = 0
  for (let i = 0; i < count; i++) {
    const s = (i / count) * length
    while (seg < m - 1 && at[seg + 1] < s) seg++
    const u = (s - at[seg]) / (at[seg + 1] - at[seg] || 1)
    const j = (seg + 1) % m
    x[i] = fx[seg] + (fx[j] - fx[seg]) * u
    z[i] = fz[seg] + (fz[j] - fz[seg]) * u
  }
  return { x, z, length }
}

const AT = new Float32Array(2)

function pathAt(path: KoiPath, s: number): void {
  const count = path.x.length
  const lap = s / path.length
  const f = (lap - Math.floor(lap)) * count
  const i = Math.min(count - 1, Math.floor(f))
  const j = i + 1 === count ? 0 : i + 1
  const u = f - i
  AT[0] = path.x[i] + (path.x[j] - path.x[i]) * u
  AT[1] = path.z[i] + (path.z[j] - path.z[i]) * u
}

interface Koi {
  readonly path: KoiPath
  readonly start: number
  readonly speed: number
  readonly size: number
  readonly seed: number
  readonly coat: number
  readonly patches: readonly Patch[]
  readonly fin: number
}

const KOI: readonly Koi[] = [
  {
    path: koiPath([
      [3, 82],
      [10, 73],
      [30, 71],
      [50, 73],
      [56, 80],
      [46, 92],
      [28, 96],
      [10, 93],
    ]),
    start: 0.14,
    speed: 8.5,
    size: 1.15,
    seed: 0.6,
    coat: POND.white,
    patches: [
      [0.03, 0.2, 0, POND.orange],
      [0.34, 0.6, 0, POND.orange],
      [0.74, 0.88, 1, POND.orange],
    ],
    fin: POND.cream,
  },
  {
    path: koiPath([
      [82, 72],
      [98, 71],
      [110, 79],
      [120, 90],
      [130, 96],
      [142, 94],
      [147, 84],
      [142, 74],
      [130, 71],
      [121, 76],
      [112, 86],
      [100, 95],
      [84, 96],
      [74, 90],
      [72, 80],
    ]),
    start: 0.2,
    speed: 9.5,
    size: 1.25,
    seed: 2.1,
    coat: POND.orange,
    patches: [
      [0.28, 0.52, 0, POND.red],
      [0.7, 0.84, -1, POND.red],
    ],
    fin: POND.butter,
  },
  {
    path: koiPath([
      [-28, 71],
      [30, 70.5],
      [80, 71.5],
      [130, 70.5],
      [180, 71],
      [206, 71],
      [210, 77],
      [180, 77.5],
      [130, 76.5],
      [80, 78],
      [30, 77],
      [-28, 77],
      [-32, 74],
    ]),
    start: 0.07,
    speed: 10,
    size: 1.05,
    seed: 4.4,
    coat: POND.white,
    patches: [[0.04, 0.24, 0, POND.red]],
    fin: POND.cream,
  },
  {
    path: koiPath([
      [-28, 95.5],
      [40, 96],
      [100, 95],
      [150, 96],
      [180, 95.5],
      [206, 95],
      [210, 89],
      [180, 84],
      [150, 83.5],
      [110, 85],
      [60, 87],
      [20, 85],
      [-28, 87],
      [-32, 91],
    ]),
    start: 0.06,
    speed: 9,
    size: 1.25,
    seed: 1.3,
    coat: POND.white,
    patches: [
      [0.1, 0.4, 0, POND.orange],
      [0.4, 0.56, -1, POND.ink],
      [0.62, 0.8, 1, POND.ink],
      [0.8, 0.96, 0, POND.orange],
    ],
    fin: POND.cream,
  },
  {
    path: koiPath([
      [118, 88],
      [122, 79],
      [144, 78.5],
      [170, 80],
      [178, 88],
      [172, 95],
      [146, 95.5],
      [124, 95],
    ]),
    start: 0.62,
    speed: 7.5,
    size: 1.05,
    seed: 5.2,
    coat: POND.butter,
    patches: [[0.42, 0.66, 0, POND.white]],
    fin: POND.white,
  },
  {
    path: koiPath([
      [2, 87],
      [8, 95],
      [26, 96],
      [42, 93],
      [40, 82],
      [22, 77],
      [6, 79],
    ]),
    start: 0.6,
    speed: 7,
    size: 0.95,
    seed: 3.3,
    coat: POND.red,
    patches: [
      [0.44, 0.7, 0, POND.white],
      [0.86, 1, 0, POND.white],
    ],
    fin: POND.cream,
  },
]

const KOI_RADII = [1.6, 2.2, 2.45, 2.4, 2.2, 1.9, 1.5, 1.15, 0.8] as const
const KOI_SWAY = [0.16, 0.07, 0.05, 0.12, 0.24, 0.4, 0.6, 0.8, 1] as const
const KOI_JOINTS = KOI_RADII.length
const KOI_SEGMENT = 1.5
const KOI_SWAY_PX = 1.5
const KOI_WAVE_LAG = 0.55
const KOI_BEAT_PER_PX = TAU / 8.5
const GLIDE_MS = 6400
const GLIDE = 0.3
const DART_RISE_MS = 300
const DART_FALL_MS = 2600
const DART_AHEAD_MS = 900

function dart(since: number): number {
  if (since < 0 || since >= DART_RISE_MS + DART_FALL_MS) return 0
  if (since < DART_RISE_MS) return smooth(since / DART_RISE_MS)
  return 1 - smooth((since - DART_RISE_MS) / DART_FALL_MS)
}

function koiTravel(koi: Koi, tMs: number, since: number): number {
  const t = tMs + DART_AHEAD_MS * dart(since)
  const glide =
    ((GLIDE * GLIDE_MS) / TAU) * Math.sin((t * TAU) / GLIDE_MS + koi.seed)
  return (koi.speed * (t + glide)) / 1000
}

const CAPS = KOI_JOINTS + 4
const BODY_CAPS = KOI_JOINTS - 1
const capAx = new Float32Array(CAPS)
const capAy = new Float32Array(CAPS)
const capBx = new Float32Array(CAPS)
const capBy = new Float32Array(CAPS)
const capRa = new Float32Array(CAPS)
const capRb = new Float32Array(CAPS)
const jointX = new Float32Array(KOI_JOINTS)
const jointY = new Float32Array(KOI_JOINTS)
const FIELD = { cap: 0, along: 0 }

function setCap(
  i: number,
  ax: number,
  ay: number,
  ra: number,
  bx: number,
  by: number,
  rb: number
): void {
  capAx[i] = ax
  capAy[i] = ay
  capRa[i] = ra
  capBx[i] = bx
  capBy[i] = by
  capRb[i] = rb
}

function capField(x: number, y: number, from: number, to: number): number {
  let best = Infinity
  for (let i = from; i < to; i++) {
    const ex = capBx[i] - capAx[i]
    const ey = capBy[i] - capAy[i]
    const px = x - capAx[i]
    const py = y - capAy[i]
    const ee = ex * ex + ey * ey
    const h = ee > 0 ? clamp01((px * ex + py * ey) / ee) : 0
    const qx = px - ex * h
    const qy = py - ey * h
    const d =
      Math.sqrt(qx * qx + qy * qy) - (capRa[i] + (capRb[i] - capRa[i]) * h)
    if (d < best) {
      best = d
      FIELD.cap = i
      FIELD.along = h
    }
  }
  return best
}

function poseKoi(koi: Koi, tMs: number, since: number): void {
  const travel = koiTravel(koi, tMs, since)
  const pace =
    (travel - koiTravel(koi, tMs - 100, since - 100)) / (koi.speed * 0.1)
  const effort = Math.max(0.6, Math.min(1.7, 0.5 + 0.5 * pace))
  const beat = koi.seed + (travel * KOI_BEAT_PER_PX) / koi.size
  const head = koi.start * koi.path.length + travel
  const rows = POND_TILT / BODY_SQUASH
  for (let j = 0; j < KOI_JOINTS; j++) {
    const s = head - j * KOI_SEGMENT * koi.size
    pathAt(koi.path, s + 0.75)
    const ax = AT[0]
    const ay = AT[1] * rows
    pathAt(koi.path, s - 0.75)
    const tx = ax - AT[0]
    const ty = ay - AT[1] * rows
    const tl = Math.hypot(tx, ty) || 1
    pathAt(koi.path, s)
    const sway =
      KOI_SWAY_PX *
      koi.size *
      effort *
      KOI_SWAY[j] *
      Math.sin(beat - j * KOI_WAVE_LAG)
    jointX[j] = AT[0] - (ty / tl) * sway
    jointY[j] = AT[1] * rows + (tx / tl) * sway
  }
  for (let j = 0; j < BODY_CAPS; j++)
    setCap(
      j,
      jointX[j],
      jointY[j],
      KOI_RADII[j] * koi.size,
      jointX[j + 1],
      jointY[j + 1],
      KOI_RADII[j + 1] * koi.size
    )

  const end = KOI_JOINTS - 1
  const rx = jointX[end]
  const ry = jointY[end]
  const back = Math.atan2(ry - jointY[end - 1], rx - jointX[end - 1])
  const trail = back - 0.5 * effort * Math.cos(beat - end * KOI_WAVE_LAG)
  for (let k = 0; k < 2; k++) {
    const a = trail + (k ? 0.5 : -0.5)
    const reach = 3.2 * koi.size
    setCap(
      BODY_CAPS + k,
      rx,
      ry,
      0.5 * koi.size,
      rx + Math.cos(a) * reach,
      ry + Math.sin(a) * reach,
      0.85 * koi.size
    )
  }
  setCap(
    BODY_CAPS + 2,
    rx,
    ry,
    0.5 * koi.size,
    rx + Math.cos(trail) * 2.1 * koi.size,
    ry + Math.sin(trail) * 2.1 * koi.size,
    0.8 * koi.size
  )

  const hx = jointX[1] - jointX[3]
  const hy = jointY[1] - jointY[3]
  const hl = Math.hypot(hx, hy) || 1
  const fx = hx / hl
  const fy = hy / hl
  for (let k = 0; k < 2; k++) {
    const side = k ? 1 : -1
    const sweep = 0.85 + 0.25 * Math.sin(beat * 0.5 + k * 1.7)
    const out = Math.cos(sweep) * side
    const aft = Math.sin(sweep)
    const root = KOI_RADII[2] * koi.size * 0.7 * side
    const px = jointX[2] - fy * root
    const py = jointY[2] + fx * root
    const reach = 3.2 * koi.size
    setCap(
      BODY_CAPS + 3 + k,
      px,
      py,
      0.8 * koi.size,
      px + (-fy * out - fx * aft) * reach,
      py + (fx * out - fy * aft) * reach,
      0.4 * koi.size
    )
  }
}

export const KOI_COUNT = KOI.length

export function koiSpine(index: number, tMs: number, patMs: number): Point[] {
  poseKoi(KOI[index], tMs, tMs - patMs)
  return Array.from(jointX, (x, j): Point => [x, jointY[j] * BODY_SQUASH])
}

const FIELD_W = 48
const FIELD_H = 36
const FIELD_PAD = 1.6
const FAR = 9
const SHADOW_DX = 1
const SHADOW_DY = 2
const FIN_ALPHA = 0.8

interface KoiField {
  left: number
  top: number
  width: number
  height: number
  readonly body: Float32Array
  readonly fin: Float32Array
  readonly along: Float32Array
  readonly deep: Float32Array
  readonly side: Int8Array
}

const KOI_FIELDS: readonly KoiField[] = KOI.map(() => ({
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  body: new Float32Array(FIELD_W * FIELD_H),
  fin: new Float32Array(FIELD_W * FIELD_H),
  along: new Float32Array(FIELD_W * FIELD_H),
  deep: new Float32Array(FIELD_W * FIELD_H),
  side: new Int8Array(FIELD_W * FIELD_H),
}))

function fillKoiField(field: KoiField): void {
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (let i = 0; i < CAPS; i++) {
    const r = Math.max(capRa[i], capRb[i]) + FIELD_PAD
    x0 = Math.min(x0, capAx[i] - r, capBx[i] - r)
    x1 = Math.max(x1, capAx[i] + r, capBx[i] + r)
    y0 = Math.min(y0, capAy[i] - r, capBy[i] - r)
    y1 = Math.max(y1, capAy[i] + r, capBy[i] + r)
  }
  const left = Math.floor(x0)
  const top = Math.floor(y0 * BODY_SQUASH)
  const width = Math.min(FIELD_W, Math.ceil(x1) - left + 1)
  const height = Math.min(FIELD_H, Math.ceil(y1 * BODY_SQUASH) - top + 1)
  field.left = left
  field.top = top
  field.width = width
  field.height = height
  field.body.fill(FAR, 0, width * height)
  field.fin.fill(FAR, 0, width * height)
  for (let i = 0; i < CAPS; i++) {
    const ax = capAx[i]
    const ay = capAy[i]
    const ex = capBx[i] - ax
    const ey = capBy[i] - ay
    const ra = capRa[i]
    const grow = capRb[i] - ra
    const ee = ex * ex + ey * ey
    const r = Math.max(ra, capRb[i]) + FIELD_PAD
    const fromX = Math.max(0, Math.floor(Math.min(ax, capBx[i]) - r) - left)
    const toX = Math.min(
      width - 1,
      Math.ceil(Math.max(ax, capBx[i]) + r) - left
    )
    const fromY = Math.max(
      0,
      Math.floor((Math.min(ay, capBy[i]) - r) * BODY_SQUASH) - top
    )
    const toY = Math.min(
      height - 1,
      Math.ceil((Math.max(ay, capBy[i]) + r) * BODY_SQUASH) - top
    )
    for (let y = fromY; y <= toY; y++) {
      const py = (y + top) / BODY_SQUASH - ay
      for (let x = fromX; x <= toX; x++) {
        const px = x + left - ax
        const h = ee > 0 ? clamp01((px * ex + py * ey) / ee) : 0
        const qx = px - ex * h
        const qy = py - ey * h
        const radius = ra + grow * h
        const d = Math.sqrt(qx * qx + qy * qy) - radius
        const k = y * width + x
        if (i >= BODY_CAPS) {
          if (d < field.fin[k]) field.fin[k] = d
        } else if (d < field.body[k]) {
          field.body[k] = d
          field.along[k] = (i + h) / BODY_CAPS
          field.deep[k] = clamp01(-d / radius)
          field.side[k] = ex * py - ey * px >= 0 ? 1 : -1
        }
      }
    }
  }
}

function paintKoiShadow(
  buf: PixelBuffer,
  open: PixelMask,
  field: KoiField
): void {
  const d = buf.data
  const r = (POND.shadow >> 16) & 255
  const g = (POND.shadow >> 8) & 255
  const b = POND.shadow & 255
  for (let fy = 0; fy < field.height; fy++) {
    const y = field.top + fy + SHADOW_DY
    if (y < FLOOR_TOP || y >= SCENE_H) continue
    for (let fx = 0; fx < field.width; fx++) {
      const x = field.left + fx + SHADOW_DX
      if (x < 0 || x >= SCENE_W) continue
      const f = fy * field.width + fx
      const a =
        0.34 *
        clamp01(1 - (Math.min(field.body[f], field.fin[f]) + 0.2) / FIELD_PAD)
      if (a <= 0) continue
      const p = y * SCENE_W + x
      if (open.data[p] !== 1) continue
      const k = p * 4
      d[k] += (r - d[k]) * a
      d[k + 1] += (g - d[k + 1]) * a
      d[k + 2] += (b - d[k + 2]) * a
    }
  }
}

function paintKoi(
  buf: PixelBuffer,
  open: PixelMask,
  koi: Koi,
  field: KoiField
): void {
  const d = buf.data
  for (let fy = 0; fy < field.height; fy++) {
    const y = field.top + fy
    if (y < FLOOR_TOP || y >= SCENE_H) continue
    for (let fx = 0; fx < field.width; fx++) {
      const x = field.left + fx
      if (x < 0 || x >= SCENE_W) continue
      const f = fy * field.width + fx
      const fin = FIN_ALPHA * clamp01(0.5 - field.fin[f])
      const body = clamp01(0.5 - field.body[f])
      if (fin <= 0 && body <= 0) continue
      const p = y * SCENE_W + x
      if (open.data[p] !== 1) continue
      const k = p * 4
      if (fin > 0) {
        d[k] += (((koi.fin >> 16) & 255) - d[k]) * fin
        d[k + 1] += (((koi.fin >> 8) & 255) - d[k + 1]) * fin
        d[k + 2] += ((koi.fin & 255) - d[k + 2]) * fin
      }
      if (body <= 0) continue
      const at = field.along[f]
      const side = field.side[f]
      let c = koi.coat
      for (const [from, to, on, tone] of koi.patches)
        if (at >= from && at < to && (on === 0 || on === side)) c = tone
      const deep = field.deep[f]
      const flank = 0.3 * (1 - smooth(deep / 0.6))
      const ridge = at < 0.8 ? 0.2 * smooth((deep - 0.55) / 0.45) : 0
      let r = (c >> 16) & 255
      let g = (c >> 8) & 255
      let b = c & 255
      r += (((POND.shadow >> 16) & 255) - r) * flank
      g += (((POND.shadow >> 8) & 255) - g) * flank
      b += ((POND.shadow & 255) - b) * flank
      r += (255 - r) * ridge
      g += (255 - g) * ridge
      b += (255 - b) * ridge
      d[k] += (r - d[k]) * body
      d[k + 1] += (g - d[k + 1]) * body
      d[k + 2] += (b - d[k + 2]) * body
    }
  }
}

function koiHead(koi: Koi, tMs: number): void {
  pathAt(koi.path, koi.start * koi.path.length + koiTravel(koi, tMs, -1))
  AT[1] *= POND_TILT
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
const KOI_LEAP_MS = 1700
const LEAP_START_MS = 140
const LEAP_FLIGHT_MS = 900
const LEAP_FROM: readonly [number, number] = [24, 96]
const LEAP_TO: readonly [number, number] = [47, 97]
const LEAP_RISE = 17

function drawKoi(buf: PixelBuffer, m: RoomMoment, open: PixelMask): void {
  const t = m.tMs
  const pat = sincePat(m)
  for (let i = 0; i < KOI.length; i++) {
    poseKoi(KOI[i], t, pat)
    fillKoiField(KOI_FIELDS[i])
    paintKoiShadow(buf, open, KOI_FIELDS[i])
  }
  for (let i = 0; i < KOI.length; i++)
    paintKoi(buf, open, KOI[i], KOI_FIELDS[i])
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
      koiHead(koi, m.patMs)
      const x = AT[0]
      const y = AT[1]
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

const LEAP_RADII = [1.6, 2.3, 2.4, 2, 1.5, 1, 0.7] as const
const LEAP_FLICK = [0.1, 0.1, 0.2, 0.4, 0.6, 0.8, 1] as const
const LEAP_JOINTS = LEAP_RADII.length
const LEAP_SEGMENT = 1.9
const leapAt = new Float32Array(LEAP_JOINTS)
const leapCapJoint = new Uint8Array(CAPS)

const leapX = (p: number): number =>
  LEAP_FROM[0] + (LEAP_TO[0] - LEAP_FROM[0]) * p

const leapY = (p: number): number =>
  LEAP_FROM[1] + (LEAP_TO[1] - LEAP_FROM[1]) * p - 4 * LEAP_RISE * p * (1 - p)

const leapSlope = (p: number): number =>
  LEAP_TO[1] - LEAP_FROM[1] - 4 * LEAP_RISE * (1 - 2 * p)

function poseLeap(flight: number, tMs: number): [body: number, all: number] {
  const run = LEAP_TO[0] - LEAP_FROM[0]
  let p = flight
  for (let j = 0; j < LEAP_JOINTS; j++) {
    leapAt[j] = p
    p -= LEAP_SEGMENT / Math.hypot(run, leapSlope(p))
  }
  for (let j = 0; j < LEAP_JOINTS; j++) {
    const u = clamp01(leapAt[j])
    const slope = leapSlope(u)
    const tl = Math.hypot(run, slope)
    const flick =
      leapAt[j] > 0 && leapAt[j] < 1
        ? 0.8 * LEAP_FLICK[j] * Math.sin(tMs * 0.019 - j * 0.7)
        : 0
    jointX[j] = leapX(u) - (slope / tl) * flick
    jointY[j] = leapY(u) + (run / tl) * flick
  }
  let body = 0
  for (let j = 0; j < LEAP_JOINTS - 1; j++) {
    const a = leapAt[j]
    const b = leapAt[j + 1]
    if (a <= 0 || b >= 1) continue
    const span = a - b || 1
    const ua = a > 1 ? (a - 1) / span : 0
    const ub = b < 0 ? a / span : 1
    const taper = LEAP_RADII[j + 1] - LEAP_RADII[j]
    leapCapJoint[body] = j
    setCap(
      body++,
      jointX[j],
      jointY[j],
      LEAP_RADII[j] + taper * ua,
      jointX[j + 1],
      jointY[j + 1],
      LEAP_RADII[j] + taper * ub
    )
  }
  let all = body
  const end = LEAP_JOINTS - 1
  if (leapAt[end] > 0 && leapAt[end] < 1) {
    const back = Math.atan2(
      jointY[end] - jointY[end - 1],
      jointX[end] - jointX[end - 1]
    )
    for (const spread of [0.55, -0.55])
      setCap(
        all++,
        jointX[end],
        jointY[end],
        0.5,
        jointX[end] + Math.cos(back + spread) * 3,
        jointY[end] + Math.sin(back + spread) * 3,
        0.9
      )
  }
  return [body, all]
}

function drawKoiLeap(
  buf: PixelBuffer,
  m: RoomMoment,
  subject: PixelMask
): void {
  const since = sinceCoins(m)
  if (!within(since, KOI_LEAP_MS)) return
  const flight = (since - LEAP_START_MS) / LEAP_FLIGHT_MS
  const [body, all] = flight > 0 ? poseLeap(flight, m.tMs) : [0, 0]
  if (all > 0) {
    let x0 = SCENE_W
    let x1 = 0
    let y0 = SCENE_H
    let y1 = 0
    for (let i = 0; i < all; i++) {
      const r = Math.max(capRa[i], capRb[i]) + 1
      x0 = Math.min(x0, capAx[i] - r, capBx[i] - r)
      x1 = Math.max(x1, capAx[i] + r, capBx[i] + r)
      y0 = Math.min(y0, capAy[i] - r, capBy[i] - r)
      y1 = Math.max(y1, capAy[i] + r, capBy[i] + r)
    }
    const left = Math.max(0, Math.floor(x0))
    const right = Math.min(SCENE_W - 1, Math.ceil(x1))
    const top = Math.max(0, Math.floor(y0))
    const bottom = Math.min(SCENE_H - 1, Math.ceil(y1))
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        if (subject.data[y * SCENE_W + x]) continue
        if (all > body) {
          const fin = capField(x, y, body, all)
          blend(buf, x, y, POND.goldDark, clamp01(0.5 - fin))
          blend(buf, x, y, POND.goldLight, clamp01(0.1 - fin))
        }
        if (body === 0) continue
        const edge = capField(x, y, 0, body)
        if (edge >= 0.5) continue
        const i = FIELD.cap
        const above = capAy[i] + (capBy[i] - capAy[i]) * FIELD.along - y
        const joint = leapCapJoint[i]
        blend(buf, x, y, POND.goldDark, clamp01(0.5 - edge))
        blend(
          buf,
          x,
          y,
          above < -0.6 ? mix(POND.gold, POND.goldDark, 0.3) : POND.gold,
          clamp01(-0.2 - edge)
        )
        if (above > 0.4 && joint >= 1 && joint <= 3)
          blend(buf, x, y, POND.goldLight, clamp01(-0.7 - edge))
      }
    }
    if (flight < 1) {
      const slope = leapSlope(flight)
      const tl = Math.hypot(LEAP_TO[0] - LEAP_FROM[0], slope)
      const ex = jointX[0] + ((LEAP_TO[0] - LEAP_FROM[0]) / tl) * 0.5
      const ey = jointY[0] + (slope / tl) * 0.5 - 0.6
      if (!subject.data[Math.round(ey) * SCENE_W + Math.round(ex)])
        blend(buf, ex, ey, POND.eye, 1)
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
  readonly seed: number
  readonly cx: number
  readonly low: number
  readonly high: number
  readonly roam: number
  readonly driftMs: number
  readonly flashMs: number
  readonly flashOffset: number
  readonly tone: number
  readonly behind: boolean
  readonly early: boolean
}

const FIREFLIES: readonly Firefly[] = (() => {
  const r = createRng(9091)
  const out: Firefly[] = []
  const count = 18
  for (let i = 0; i < count; i++) {
    out.push({
      seed: 1 + i * 131,
      cx: 8 + ((i * 53) % 164) + r() * 6,
      low: 66 + r() * 30,
      high: 10 + r() * 46,
      roam: 14 + r() * 18,
      driftMs: 6000 + r() * 6000,
      flashMs: 1700 + r() * 2600,
      flashOffset: r() * 5000,
      tone: r(),
      behind: i % 3 === 0,
      early: i % 3 === 1,
    })
  }
  return out
})()

const FLASH_RISE_MS = 140
const FLASH_FADE_MS = 340

const flashCurve = (dt: number): number =>
  dt < 0
    ? 0
    : dt < FLASH_RISE_MS
      ? dt / FLASH_RISE_MS
      : Math.exp(-(dt - FLASH_RISE_MS) / FLASH_FADE_MS)

function flashOf(fly: Firefly, t: number): number {
  const clock = t + fly.flashOffset
  const beat = Math.floor(clock / fly.flashMs)
  let lit = 0
  for (let b = beat - 1; b <= beat; b++) {
    if (hash01(fly.seed, b) < 0.15) continue
    const at = b * fly.flashMs + hash01(fly.seed + 7, b) * fly.flashMs * 0.6
    const peak = 0.65 + 0.35 * hash01(fly.seed + 11, b)
    lit = Math.max(lit, peak * flashCurve(clock - at))
    if (hash01(fly.seed + 13, b) < 0.25)
      lit = Math.max(lit, peak * 0.85 * flashCurve(clock - at - 420))
  }
  return lit
}

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
    const blink = flashOf(fly, t)
    const lift = fly.early ? 0.35 + 0.65 * show : show
    const cy = fly.low + (fly.high - fly.low) * lift
    let x =
      fly.cx +
      fly.roam * wander(t / fly.driftMs, fly.seed) +
      2.5 * wander(t / 900, fly.seed + 1)
    let y =
      cy +
      (4 + 6 * lift) * wander(t / (fly.driftMs * 0.8), fly.seed + 2) +
      1.5 * wander(t / 700, fly.seed + 3) -
      1.5 * blink
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
    const glowing = Math.max(show, gather, fly.early ? 0.25 : 0)
    const lit = Math.max(blink, flash, gather * 0.8, pull * 0.7)
    const gold = gather > 0.02
    const core = gold
      ? FLY.goldCore
      : glowing > 0.3
        ? mix(FLY.core, FLY.goldCore, fly.tone * 0.5)
        : FLY.day
    const halo = gold ? FLY.gold : mix(FLY.halo, FLY.gold, fly.tone * 0.35)
    const rest = 0.55 - 0.25 * glowing
    blend(buf, ix, iy, core, rest + (1 - rest) * lit)
    const a = glowing * (0.1 + 0.58 * lit)
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
    back: drawForestLife,
    fx: drawFireflies,
    dim: (m) => (isDarkTime(m.time) ? 0.35 : 0.6 * forestShow(m)),
  },
}
