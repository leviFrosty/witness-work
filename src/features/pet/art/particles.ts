import {
  nextState,
  rgbPalette,
  seedFrom,
  setPixel,
  stateValue,
  type PixelBuffer,
  type Rgb,
  type StampPattern,
} from '@/lib/pixelArt'

import { PET_X, PET_Y } from './layout'
import type { PetMood } from './types'

export type ParticleKind = 'heart' | 'zzz' | 'sparkle'

export interface Particle {
  readonly kind: ParticleKind
  readonly x: number
  readonly y: number
  readonly bornMs: number
  readonly lifeMs: number
}

export interface Dust {
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly bornMs: number
  readonly lifeMs: number
}

export interface ParticleState {
  readonly particles: readonly Particle[]
  readonly dust: readonly Dust[]

  readonly nextZzzMs: number
  readonly nextHeartMs: number
  readonly nextSparkleMs: number

  readonly seed: number
}

export interface ParticleFlags {
  readonly gold?: boolean
}

export function createParticles(seed = 1): ParticleState {
  return {
    particles: [],
    dust: [],
    nextZzzMs: 0,
    nextHeartMs: 0,
    nextSparkleMs: 0,
    seed: seedFrom(seed),
  }
}

function random(seed: number, count: number): [number[], number] {
  let s = seed
  const values: number[] = []
  for (let i = 0; i < count; i++) {
    s = nextState(s)
    values.push(stateValue(s))
  }
  return [values, s]
}

export function step(
  state: ParticleState,
  tMs: number,
  mood: PetMood,
  flags: ParticleFlags = {}
): ParticleState {
  const particles =
    mood === 'nap'
      ? [...state.particles]
      : state.particles.filter((p) => p.kind !== 'zzz')
  let { nextZzzMs, nextHeartMs, nextSparkleMs, seed } = state
  if (mood === 'nap' && tMs > nextZzzMs) {
    particles.push({ kind: 'zzz', x: 20, y: -3, bornMs: tMs, lifeMs: 2200 })
    nextZzzMs = tMs + 1100
  }
  if (mood === 'joy' && tMs > nextHeartMs) {
    const [[r], s] = random(seed, 1)
    seed = s
    particles.push({
      kind: 'heart',
      x: 2 + r * 20,
      y: -1,
      bornMs: tMs,
      lifeMs: 1400,
    })
    nextHeartMs = tMs + 700
  }
  if (flags.gold && tMs > nextSparkleMs) {
    const [[rx, ry], s] = random(seed, 2)
    seed = s
    particles.push({
      kind: 'sparkle',
      x: -2 + rx * 32,
      y: 2 + ry * 24,
      bornMs: tMs,
      lifeMs: 900,
    })
    nextSparkleMs = tMs + 380
  }
  return {
    particles: particles.filter((p) => tMs - p.bornMs < p.lifeMs),
    dust: state.dust.filter((p) => tMs - p.bornMs < p.lifeMs),
    nextZzzMs,
    nextHeartMs,
    nextSparkleMs,
    seed,
  }
}

export function emitPatHeart(state: ParticleState, tMs: number): ParticleState {
  const [[r], seed] = random(state.seed, 1)
  return {
    ...state,
    seed,
    particles: [
      ...state.particles,
      { kind: 'heart', x: 2 + r * 16, y: -2, bornMs: tMs, lifeMs: 1300 },
    ],
  }
}

export function emitHeartBurst(
  state: ParticleState,
  tMs: number
): ParticleState {
  const burst: Particle[] = [0, 1, 2, 3].map((i) => ({
    kind: 'heart',
    x: i * 6,
    y: -1 - i,
    bornMs: tMs + i * 120,
    lifeMs: 1300,
  }))
  return { ...state, particles: [...state.particles, ...burst] }
}

export function emitDust(
  state: ParticleState,
  tMs: number,
  dx: number,
  flip: boolean,
  land: boolean
): ParticleState {
  const feetY = PET_Y + 29
  const puffs: Dust[] = [
    {
      x: PET_X + 16 + dx + (flip ? -8 : 8),
      y: feetY,
      vx: flip ? -1 : 1,
      bornMs: tMs,
      lifeMs: 500,
    },
  ]
  if (land)
    puffs.push({
      x: PET_X + 16 + dx - 10,
      y: feetY,
      vx: -1,
      bornMs: tMs,
      lifeMs: 500,
    })
  return { ...state, dust: [...state.dust, ...puffs] }
}

export function clearDust(state: ParticleState): ParticleState {
  return { ...state, dust: [] }
}

export function clearParticles(state: ParticleState): ParticleState {
  return { ...state, particles: [], dust: [] }
}

const HEART: StampPattern = ['.r.r.', 'rrrrr', '.rrr.', '..r..']
const ZED: StampPattern = ['zzzz', '..z.', '.z..', 'zzzz']
const SPARK_SMALL: StampPattern = ['y']
const SPARK_STAR: StampPattern = ['.y.', 'ywy', '.y.']
const SPARK_FADE: StampPattern = ['w']

const COLORS = rgbPalette({
  heart: '#ff5470',
  heartFade: '#ffa1b1',
  zzz: '#6c7cc4',
  zzzFade: '#a9b6e6',
  gold: '#ffd34a',
  goldLight: '#fffbe6',
  dust: '#e9dccb',
  dustFade: '#cbbfae',
})

function stampAt(
  buf: PixelBuffer,
  pattern: StampPattern,
  x: number,
  y: number,
  colors: Readonly<Record<string, Rgb>>
): void {
  for (let j = 0; j < pattern.length; j++) {
    const row = pattern[j]
    for (let i = 0; i < row.length; i++) {
      const c = colors[row[i]]
      if (c !== undefined) setPixel(buf, x + i, y + j, c)
    }
  }
}

export interface DrawParticleOptions {
  readonly frozen?: boolean
}

export function draw(
  buf: PixelBuffer,
  state: ParticleState,
  tMs: number,
  origin: readonly [number, number],
  options: DrawParticleOptions = {}
): void {
  const [ox, oy] = origin
  for (const p of state.particles) {
    if (tMs < p.bornMs) continue
    const a = (tMs - p.bornMs) / p.lifeMs
    const drift = options.frozen ? 0 : a
    if (p.kind === 'sparkle') {
      const k = Math.floor(a * 3)
      const pattern = k === 1 ? SPARK_STAR : k === 0 ? SPARK_SMALL : SPARK_FADE
      const centre = k === 1 ? 1 : 0
      stampAt(
        buf,
        pattern,
        Math.round(p.x) - centre + ox,
        Math.round(p.y) - centre + oy,
        {
          y: COLORS.gold,
          w: COLORS.goldLight,
        }
      )
      continue
    }
    const y = Math.round(p.y - drift * 10)
    const x = Math.round(
      p.x + (p.kind === 'zzz' ? drift * 4 : Math.sin(drift * 6) * 1.2)
    )
    if (p.kind === 'heart') {
      stampAt(buf, HEART, x + ox, y + oy, {
        r: a > 0.7 ? COLORS.heartFade : COLORS.heart,
      })
    } else {
      stampAt(buf, ZED, x + ox, y + oy, {
        z: a > 0.7 ? COLORS.zzzFade : COLORS.zzz,
      })
    }
  }
  for (const p of state.dust) {
    if (tMs < p.bornMs) continue
    const a = (tMs - p.bornMs) / p.lifeMs
    const X = Math.round(p.x + p.vx * a * 6)
    const Y = Math.round(p.y - a * 3)
    const c = a < 0.5 ? COLORS.dust : COLORS.dustFade
    setPixel(buf, X, Y, c)
    setPixel(buf, X + 1, Y, c)
    setPixel(buf, X, Y - 1, c)
    setPixel(buf, X + 1, Y - 1, c)
  }
}
