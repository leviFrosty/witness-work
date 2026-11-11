import { rgbPalette, type PixelBuffer, type PixelMask } from '@/lib/pixelArt'
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
  FORT_APEX,
  FORT_GLOW,
  fortOpening,
  PAGE_TURN_STEPS,
  paintFortOpening,
  paintLampdeskPage,
  paintRocker,
  paintTypewriterCarriage,
  STUDY_FLOOR_Y,
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

const ROCK_MS = 2800

const rockerLean = (tMs: number): number =>
  Math.round(2 * Math.sin((tMs / ROCK_MS) * 2 * Math.PI))

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

const FORT_X = FORT_GLOW[0] + STUDY_SHIFT_X
const FORT_Y = FORT_GLOW[1]
const FLAP_MS = 1900

const fortLift = (m: RoomMoment): number => {
  const pat = sincePat(m)
  if (!within(pat, FLAP_MS)) return 0
  if (pat < 120 || pat >= FLAP_MS - 150) return 1
  return 2
}

const FORT_SPARKS: readonly (readonly [number, number])[] = [
  [27, 62],
  [40, 60],
  [33, 56],
  [24, 69],
  [43, 67],
  [30, 58],
  [37, 57],
]

function fortFx(buf: PixelBuffer, m: RoomMoment, subject: PixelMask): void {
  const pat = sincePat(m)
  const coins = sinceCoins(m)
  const lift = fortLift(m)
  const grow = swell(pat, 220, 1600)
  const s = LIGHT[m.time] * (1 + 0.1 * breath(m.tMs, 3200)) * (1 + 0.8 * grow)
  const inner = Math.max(0, s - 0.3)
  for (let y = FORT_APEX; y < STUDY_FLOOR_Y; y++) {
    const [left, right, flap] = fortOpening(lift, y)
    const reach = lift > 0 && flap === 0 ? right + 3 : right
    for (let x = left; x <= reach; x++) {
      const d = Math.hypot(x - FORT_GLOW[0], (y - FORT_Y) * 0.9)
      blend(
        buf,
        x + STUDY_SHIFT_X,
        y,
        d < 3.5 ? FX.bright : FX.amber,
        Math.min(0.6, inner * (d < 3.5 ? 0.6 : 0.4))
      )
    }
  }
  glow(buf, FORT_X, FORT_Y - 2, 17 + 5 * grow, FX.amber, 0.2 * s)
  const rx = 13 + 5 * grow
  const ry = 4.5 + grow
  const cx = FORT_X + 1
  const cy = STUDY_FLOOR_Y + 2
  for (let y = STUDY_FLOOR_Y; y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (x < 0 || x >= buf.width || y >= buf.height) continue
      if (subject.data[y * buf.width + x]) continue
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry)
      if (d < 1) blend(buf, x, y, FX.warm, 0.42 * s * (1 - d) * (1 - d))
    }
  }
  if (within(coins, COIN_MS)) sparkles(buf, coins, FORT_SPARKS, 150, 3)
}

export const STUDY_LIVE: RoomLiveSet<StudyId> = {
  rocker: {
    back(buf, m) {
      paintRocker(buf, rockerLean(m.tMs))
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
      const lift = fortLift(m)
      if (lift > 0) paintFortOpening(buf, lift)
    },
    fx: fortFx,
  },
}
