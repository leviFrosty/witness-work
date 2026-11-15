import {
  plot,
  readRgb,
  rgbPalette,
  type PixelBuffer,
  type PixelMask,
} from '@/lib/pixelArt'
import type { StudyId, TimeOfDay } from '@/types/pet'

import { blend, glow } from '../fx'
import {
  sinceCoins,
  sincePat,
  within,
  type RoomLiveSet,
  type RoomMoment,
} from './live'
import {
  FORT_BOX,
  FORT_BULBS,
  FORT_BUNNY_HOME,
  FORT_DOORSTEP,
  FORT_LANTERN,
  FORT_REST,
  fortBulbColor,
  inFort,
  inFortDoor,
  paintFort,
  paintFortBunnyOut,
  paintFortInside,
  type BunnyLook,
  type FortBunny,
  type FortPut,
  type FortPose,
} from './fort'
import {
  PAGE_TURN_STEPS,
  paintLampdeskPage,
  paintRocker,
  paintTypewriterCarriage,
  STUDY_SHIFT_X,
} from './study'

const FX = rgbPalette({
  warm: '#ffd889',
  bright: '#fff2c2',
  amber: '#ffb858',
  coin: '#f1b92e',
  coinLight: '#fff0a8',
  glass: '#8fe6b0',
})

const ROCK_MS = 1400
const ROCK_TILT = 0.12
const ROCK_PUSH_EVERY = 6
const ROCK_SETTLED = 0.45
const ROCK_LOSS = -Math.log(ROCK_SETTLED) / (ROCK_PUSH_EVERY - 1)

function rockerTilt(tMs: number): number {
  const rocks = Math.max(0, tMs) / ROCK_MS
  const since = rocks % ROCK_PUSH_EVERY
  const swing =
    since < 1
      ? ROCK_SETTLED + (1 - ROCK_SETTLED) * since * since * (3 - 2 * since)
      : Math.exp(-(since - 1) * ROCK_LOSS)
  return ROCK_TILT * swing * Math.sin(rocks * 2 * Math.PI)
}

const TYPE_STEP_MS = 200
const TYPE_STEPS = 7
const TYPE_LINE_MS = TYPE_STEP_MS * (TYPE_STEPS + 2)
const TYPE_LINES = 4

function typewriter(buf: PixelBuffer, m: RoomMoment): void {
  const t = m.tMs + TYPE_LINE_MS * 2
  const line = Math.floor(t / TYPE_LINE_MS) % TYPE_LINES
  const step = Math.floor((t % TYPE_LINE_MS) / TYPE_STEP_MS)
  if (step < TYPE_STEPS) {
    paintTypewriterCarriage(buf, 3 - step, 2 + line, line, step + 1)
    return
  }
  const last = line === TYPE_LINES - 1
  const fed = last ? 0 : line + 1
  paintTypewriterCarriage(
    buf,
    step === TYPE_STEPS ? 0 : 3,
    last ? (step === TYPE_STEPS ? 2 + line : 0) : 2 + fed,
    fed,
    0
  )
}

const PAGE_EVERY_MS = 7000
const PAGE_AT_MS = 3400
const PAGE_STEP_MS = 100
const FLUTTER_MS = 1500

function pageStep(m: RoomMoment): number {
  const pat = sincePat(m)
  if (within(pat, FLUTTER_MS))
    return Math.floor(pat / PAGE_STEP_MS) % PAGE_TURN_STEPS
  const idle = (m.tMs % PAGE_EVERY_MS) - PAGE_AT_MS
  return within(idle, PAGE_STEP_MS * PAGE_TURN_STEPS)
    ? Math.floor(idle / PAGE_STEP_MS)
    : -1
}

const LIGHT: Readonly<Record<TimeOfDay, number>> = {
  day: 0.4,
  dawn: 0.75,
  dusk: 0.85,
  night: 1,
}

const swell = (since: number, riseMs: number, fallMs: number): number =>
  since < 0 || since >= riseMs + fallMs
    ? 0
    : since < riseMs
      ? since / riseMs
      : 1 - (since - riseMs) / fallMs

const breath = (tMs: number, periodMs: number): number =>
  Math.round(Math.sin((tMs / periodMs) * 2 * Math.PI) * 4) / 4

function sparkle(
  buf: PixelBuffer,
  x: number,
  y: number,
  a: number,
  big: boolean
): void {
  blend(buf, x, y, FX.coinLight, a)
  if (!big) return
  blend(buf, x - 1, y, FX.coin, a * 0.8)
  blend(buf, x + 1, y, FX.coin, a * 0.8)
  blend(buf, x, y - 1, FX.coin, a * 0.8)
  blend(buf, x, y + 1, FX.coin, a * 0.8)
}

const SPARKLE_MS = 420

function sparkles(
  buf: PixelBuffer,
  since: number,
  spots: readonly (readonly [number, number])[],
  staggerMs: number,
  rise: number
): void {
  spots.forEach(([x, y], i) => {
    for (const round of [0, 1]) {
      const age = since - i * staggerMs - round * (spots.length * staggerMs)
      if (!within(age, SPARKLE_MS)) continue
      const p = age / SPARKLE_MS
      sparkle(
        buf,
        x + STUDY_SHIFT_X,
        y - Math.round(p * rise),
        Math.min(1, 2.4 * (1 - p)),
        p > 0.12 && p < 0.8
      )
    }
  })
}

const LAMP_X = 23 + STUDY_SHIFT_X
const DESK_GLINTS: readonly (readonly [number, number])[] = [
  [29, 59],
  [43, 56],
  [36, 61],
  [48, 57],
  [21, 62],
  [40, 60],
]
const COIN_MS = 2400

function lampdeskFx(buf: PixelBuffer, m: RoomMoment): void {
  const pat = sincePat(m)
  const coins = sinceCoins(m)
  const flash = within(coins, 220) || (coins >= 420 && coins < 640) ? 1 : 0
  const lift = Math.max(swell(pat, 160, 1500), flash)
  const base = LIGHT[m.time] * (1 + 0.06 * breath(m.tMs, 4200))
  const a = base * (1 + 0.9 * lift)
  glow(buf, LAMP_X, 57, 17 + 6 * lift, FX.warm, 0.24 * a)
  for (let y = 55; y <= 61; y++) {
    const half = 4 + (y - 54) * (1.5 + 0.4 * lift)
    for (let x = Math.round(LAMP_X - half); x <= LAMP_X + half; x++) {
      const d = (x - LAMP_X) / half
      blend(buf, x, y, FX.warm, Math.min(0.7, 0.42 * a * (1 - d * d)))
    }
  }
  for (let y = 50; y < 53; y++)
    for (let x = 18; x < 28; x++)
      blend(buf, x + STUDY_SHIFT_X, y, FX.glass, Math.min(0.5, 0.26 * a))
  for (let x = 19; x < 27; x++)
    blend(buf, x + STUDY_SHIFT_X, 54, FX.bright, Math.min(1, 0.5 + 0.5 * a))
  if (within(coins, COIN_MS)) sparkles(buf, coins, DESK_GLINTS, 170, 0)
}

const [HOME_X, HOME_Y] = FORT_BUNNY_HOME
const HOME: Spot = [HOME_X, HOME_Y]
const DOORSTEP: Spot = [HOME_X - 1, HOME_Y + 3]
const OUTSIDE: Spot = [HOME_X - 3, HOME_Y + 6]

type Spot = readonly [x: number, y: number]

const TRIP: readonly (readonly [
  endMs: number,
  to: Spot,
  hop: number,
  look: BunnyLook,
])[] = [
  [200, HOME, 0, 'sit'],
  [500, DOORSTEP, 3, 'sit'],
  [800, OUTSIDE, 3, 'sit'],
  [1200, OUTSIDE, 4, 'joy'],
  [1600, OUTSIDE, 4, 'joy'],
  [1750, OUTSIDE, 0, 'sit'],
  [2050, DOORSTEP, 3, 'sit'],
  [2350, HOME, 3, 'sit'],
]
export const FORT_TRIP_MS = 2350
const CHEER_MS = 1200
const BLINK_EVERY_MS = 4300
const EAR_EVERY_MS = 6100
const PEEK_EVERY_MS = 11000
const BULB_STEP_MS = 420

const lerp = (a: number, b: number, p: number): number =>
  Math.round(a + (b - a) * p)

function bunnyTrip(since: number): FortBunny {
  let from = HOME
  let startMs = 0
  for (const [endMs, to, hop, look] of TRIP) {
    if (since < endMs) {
      const p = (since - startMs) / (endMs - startMs)
      return {
        x: lerp(from[0], to[0], p),
        y: lerp(from[1], to[1], p),
        hop: Math.round(hop * 4 * p * (1 - p)),
        look,
        blink: false,
        ear: false,
        page: false,
      }
    }
    from = to
    startMs = endMs
  }
  return FORT_REST.bunny
}

function fortBunny(m: RoomMoment): FortBunny {
  const pat = sincePat(m)
  if (within(pat, FORT_TRIP_MS)) return bunnyTrip(pat)
  const coins = sinceCoins(m)
  if (within(coins, CHEER_MS))
    return {
      ...FORT_REST.bunny,
      look: 'joy',
      hop: Math.floor(coins / 150) % 2,
    }
  const t = m.tMs
  return {
    ...FORT_REST.bunny,
    look: within((t % PEEK_EVERY_MS) - 8200, 1400) ? 'peek' : 'read',
    blink: within((t % BLINK_EVERY_MS) - 2900, 160),
    ear: within((t % EAR_EVERY_MS) - 2000, 350),
    page: within((t % PAGE_EVERY_MS) - PAGE_AT_MS, 300),
  }
}

const FORT_W = FORT_BOX.x1 - FORT_BOX.x0 + 1
const FORT_H = FORT_BOX.y1 - FORT_BOX.y0 + 1
const fortAt = (x: number, y: number): number =>
  x < FORT_BOX.x0 || x > FORT_BOX.x1 || y < FORT_BOX.y0 || y > FORT_BOX.y1
    ? -1
    : (y - FORT_BOX.y0) * FORT_W + (x - FORT_BOX.x0)

let fortRest: Int32Array | null = null

function restFort(): Int32Array {
  if (!fortRest) {
    const rest = new Int32Array(FORT_W * FORT_H).fill(-1)
    paintFort((x, y, c) => {
      const at = fortAt(x, y)
      if (at >= 0) rest[at] = c
    })
    fortRest = rest
  }
  return fortRest
}

const fortCovered = new Uint8Array(FORT_W * FORT_H)

function markFortShown(buf: PixelBuffer): void {
  const rest = restFort()
  for (let y = FORT_BOX.y0; y <= FORT_BOX.y1; y++) {
    for (let x = FORT_BOX.x0; x <= FORT_BOX.x1; x++) {
      const at = fortAt(x, y)
      fortCovered[at] = rest[at] >= 0 && readRgb(buf, x, y) !== rest[at] ? 1 : 0
    }
  }
}

const fortShown = (x: number, y: number): boolean => {
  const at = fortAt(x, y)
  return at < 0 || fortCovered[at] === 0
}

const BULB_HALO: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [-1, 1],
  [1, 1],
  [0, -1],
  [0, 2],
]

const ALL_BULBS = (1 << FORT_BULBS.length) - 1

function fortBulbsLit(m: RoomMoment): number {
  const n = FORT_BULBS.length
  const pat = sincePat(m)
  if (within(pat, FORT_TRIP_MS))
    return Math.floor(pat / 200) % 2 ? 0 : ALL_BULBS
  const coins = sinceCoins(m)
  if (within(coins, COIN_MS)) {
    const i = Math.floor(coins / 90) % n
    return (1 << i) | (1 << (n - 1 - i))
  }
  const i = Math.floor(m.tMs / BULB_STEP_MS) % (n + 4)
  return i < n ? 1 << i : 0
}

export function fortPose(m: RoomMoment): FortPose {
  const pat = sincePat(m)
  return {
    door: !within(pat, FORT_TRIP_MS + 150)
      ? 0
      : pat < 120 || pat >= FORT_TRIP_MS
        ? 1
        : 2,
    bunny: fortBunny(m),
    lit: fortBulbsLit(m),
  }
}

const FORT_SPARKS: readonly (readonly [number, number])[] = [
  [22, 60],
  [52, 58],
  [38, 46],
  [17, 71],
  [56, 69],
  [30, 54],
  [46, 53],
]

function fortBulbLevel(m: RoomMoment, i: number): number {
  const coins = sinceCoins(m)
  if (within(coins, COIN_MS)) {
    const wave = Math.cos(((coins / 110 - i) * Math.PI) / 3)
    return 0.4 + 0.9 * Math.max(0, wave)
  }
  const flash = swell(sincePat(m), 160, 1500)
  const twinkle = Math.sin((m.tMs / 1100) * 2 * Math.PI + i * 2.4)
  return 0.7 + 0.3 * (Math.round(twinkle * 2) / 2) + 0.5 * flash
}

function fortFx(buf: PixelBuffer, m: RoomMoment, subject: PixelMask): void {
  const pose = fortPose(m)
  const coins = sinceCoins(m)
  const grow = swell(sincePat(m), 220, 1600)
  const s = LIGHT[m.time] * (1 + 0.1 * breath(m.tMs, 3200)) * (1 + 0.6 * grow)
  const free = (x: number, y: number) =>
    fortShown(x, y) && !subject.data[y * buf.width + x]
  const [lx, ly] = FORT_LANTERN

  const inner = Math.min(1, Math.max(0, (s - 0.3) / 0.6))
  const lit =
    (a: number): FortPut =>
    (x, y, c) => {
      if (free(x, y)) blend(buf, x, y, c, a)
    }
  paintFortInside(lit(inner), pose)
  paintFortBunnyOut(lit(Math.max(inner, 0.55)), pose)
  glow(buf, lx, ly, 6, FX.bright, 0.45 * s)

  for (let y = FORT_BOX.y0; y <= FORT_BOX.y1; y++) {
    for (let x = FORT_BOX.x0; x <= FORT_BOX.x1; x++) {
      if (!inFort(x, y) || inFortDoor(x, y, pose.door) || !free(x, y)) continue
      const d = Math.hypot(x - lx, (y - ly) * 1.2) / 26
      if (d < 1) blend(buf, x, y, FX.amber, 0.55 * s * (1 - d))
    }
  }
  glow(buf, lx - 4, ly - 4, 20 + 5 * grow, FX.amber, 0.16 * s)

  const rx = 13 + 4 * grow
  const ry = 4.5 + grow
  const [cx, cy] = FORT_DOORSTEP
  for (let y = cy - 2; y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (x < 0 || x >= buf.width || y >= buf.height) continue
      if (inFort(x, y) || !free(x, y)) continue
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry)
      if (d < 1) blend(buf, x, y, FX.warm, 0.42 * s * (1 - d) * (1 - d))
    }
  }

  FORT_BULBS.forEach(([x, y], i) => {
    const on = pose.lit & (1 << i) ? 0.6 : 0
    const a = Math.min(1.4, LIGHT[m.time] * fortBulbLevel(m, i) + on)
    const c = fortBulbColor(i)
    glow(buf, x, y + 0.5, 5.5, c, 0.3 * a)
    for (const [dx, dy] of BULB_HALO) blend(buf, x + dx, y + dy, c, 0.45 * a)
    blend(buf, x, y, FX.bright, 0.9 * a)
    blend(buf, x, y + 1, c, a)
  })
  if (within(coins, COIN_MS)) sparkles(buf, coins, FORT_SPARKS, 150, 3)
}

export const STUDY_LIVE: RoomLiveSet<StudyId> = {
  rocker: {
    back(buf, m) {
      paintRocker(buf, rockerTilt(m.tMs))
    },
  },
  typewriter: {
    back(buf, m) {
      typewriter(buf, m)
    },
  },
  lampdesk: {
    back(buf, m) {
      const step = pageStep(m)
      if (step >= 0) paintLampdeskPage(buf, step)
    },
    fx(buf, m) {
      lampdeskFx(buf, m)
    },
  },
  fort: {
    back(buf, m) {
      markFortShown(buf)
      paintFort((x, y, c) => {
        if (fortShown(x, y)) plot(buf, x, y, c)
      }, fortPose(m))
    },
    fx: fortFx,
  },
}
