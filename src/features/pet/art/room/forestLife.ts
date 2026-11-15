import { rgbPalette, type PixelBuffer, type PixelMask } from '@/lib/pixelArt'

import { blend, isDarkTime } from '../fx'
import { PET_X, PET_Y, SCENE_H, SCENE_W, SPRITE_SIZE } from '../layout'
import { FLOOR_TOP } from './floor'
import type { RoomMoment } from './live'

export function hash01(a: number, b: number): number {
  let h =
    Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x9e3779b9, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function wander(t: number, seed: number): number {
  const i = Math.floor(t)
  const f = t - i
  const p0 = hash01(seed, i - 1) * 2 - 1
  const p1 = hash01(seed, i) * 2 - 1
  const p2 = hash01(seed, i + 1) * 2 - 1
  const p3 = hash01(seed, i + 2) * 2 - 1
  return (
    0.5 *
    (2 * p1 +
      (p2 - p0) * f +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f +
      (3 * p1 - p0 - 3 * p2 + p3) * f * f * f)
  )
}

const C = rgbPalette({
  hole: '#2e2216',
  holeRim: '#4c3a26',
  worm: '#d4857a',
  wormDark: '#ad5f58',
  wormBand: '#e8a497',
  cricket: '#241912',
  cricketLeg: '#140d09',
  cricketWing: '#c99a5e',
  hopper: '#6f9a3a',
  hopperLeg: '#4f7429',
  hopperWing: '#a6cf62',
  antenna: '#c8b088',
  lady: '#d8342b',
  ladyLight: '#f27a5c',
  ladySpot: '#1d1a18',
  beetle: '#3a5068',
  beetleSheen: '#a4c6e0',
  beetleHead: '#1b2430',
  shell: '#b07a45',
  shellDark: '#7f532c',
  shellLight: '#e3b67c',
  snail: '#cdbb98',
  snailDark: '#a2906f',
  slime: '#e9efe4',
  sparrow: '#a3744a',
  sparrowWing: '#5e3f25',
  sparrowShine: '#c9a070',
  sparrowBelly: '#e6d3ae',
  shadow: '#1c140c',
  robin: '#756a60',
  robinWing: '#4c443d',
  robinShine: '#968a7e',
  robinBelly: '#ec7a40',
  beak: '#e7b43c',
  eye: '#17120d',
  leg: '#9a6a3e',
  wingA: '#f0b43a',
  wingADark: '#c9862a',
  wingB: '#9cc4f2',
  wingBDark: '#5f8fd0',
  wingC: '#f4f0e6',
  wingCDark: '#c9c2b0',
  body: '#2a1d12',
})

type Kind =
  | 'worm'
  | 'cricket'
  | 'ladybug'
  | 'beetle'
  | 'snail'
  | 'bird'
  | 'butterfly'

type Mode = 'still' | 'walk' | 'hop' | 'fly' | 'peck' | 'look' | 'chirp'

export interface Leg {
  readonly t0: number
  readonly t1: number
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
  readonly arc: number
  readonly mode: Mode
  readonly face: 1 | -1
}

export interface Visit {
  readonly kind: Kind
  readonly startMs: number
  readonly endMs: number
  readonly variant: number
  readonly legs: readonly Leg[]
}

type Rand = () => number

const randFrom = (seed: number): Rand => {
  let k = 0
  return () => hash01(seed, k++)
}

const between = (r: Rand, lo: number, hi: number): number =>
  lo + r() * (hi - lo)

const GROUND_TOP = FLOOR_TOP + 5
const GROUND_BOTTOM = SCENE_H - 3

const groundY = (y: number): number =>
  Math.max(GROUND_TOP, Math.min(GROUND_BOTTOM, y))

const openAt = (open: PixelMask, x: number, y: number): boolean => {
  const ix = Math.round(x)
  const iy = Math.round(y)
  return (
    ix >= 0 &&
    iy >= 0 &&
    ix < SCENE_W &&
    iy < SCENE_H &&
    open.data[iy * SCENE_W + ix] === 1
  )
}

const behindPet = (x: number, y: number): boolean =>
  x > PET_X - 2 &&
  x < PET_X + SPRITE_SIZE + 2 &&
  y > PET_Y &&
  y < PET_Y + SPRITE_SIZE + 3

const clearAt = (open: PixelMask, x: number, y: number, r = 3): boolean =>
  !behindPet(x, y) &&
  openAt(open, x, y) &&
  openAt(open, x - r, y) &&
  openAt(open, x + r, y) &&
  openAt(open, x, y - 2)

function findSpot(
  r: Rand,
  open: PixelMask,
  x0: number,
  x1: number,
  y0 = GROUND_TOP + 2,
  y1 = GROUND_BOTTOM
): [number, number] | null {
  for (let tries = 0; tries < 8; tries++) {
    const x = Math.round(between(r, x0, x1))
    const y = Math.round(between(r, y0, y1))
    if (clearAt(open, x, y)) return [x, y]
  }
  return null
}

class Route {
  readonly legs: Leg[] = []
  t = 0
  x: number
  y: number
  face: 1 | -1

  constructor(x: number, y: number, face: 1 | -1) {
    this.x = x
    this.y = y
    this.face = face
  }

  move(x: number, y: number, ms: number, mode: Mode, arc = 0): this {
    if (x !== this.x) this.face = x > this.x ? 1 : -1
    this.legs.push({
      t0: this.t,
      t1: this.t + ms,
      x0: this.x,
      y0: this.y,
      x1: x,
      y1: y,
      arc,
      mode,
      face: this.face,
    })
    this.t += ms
    this.x = x
    this.y = y
    return this
  }

  stay(ms: number, mode: Mode = 'still', face = this.face): this {
    this.face = face
    return this.move(this.x, this.y, ms, mode)
  }

  walk(x: number, y: number, speed: number, mode: Mode = 'walk'): this {
    const d = Math.hypot(x - this.x, y - this.y)
    return d < 0.5 ? this : this.move(x, y, (d / speed) * 1000, mode)
  }
}

const nearestSide = (x: number): 1 | -1 => (x < SCENE_W / 2 ? -1 : 1)
const offSide = (side: 1 | -1, pad: number): number =>
  side < 0 ? -pad : SCENE_W - 1 + pad

function planWorm(r: Rand, open: PixelMask): Route | null {
  const dir: 1 | -1 = r() < 0.5 ? 1 : -1
  const dist = Math.round(between(r, 7, 13))
  const spot = findSpot(r, open, 10, SCENE_W - 10)
  if (!spot) return null
  const [x, y] = spot
  const end = x + dir * dist
  if (!clearAt(open, end, y, 1) || !clearAt(open, x + (dir * dist) / 2, y, 1))
    return null
  return new Route(x, y, dir)
    .stay(between(r, 900, 1500))
    .move(end, y, ((dist + WORM_LEN) / between(r, 1.8, 2.6)) * 1000, 'walk')
    .stay(1400)
}

function planCricket(r: Rand, open: PixelMask, day: boolean): Route | null {
  const from: 1 | -1 = r() < 0.5 ? -1 : 1
  const route = new Route(offSide(from, 6), groundY(between(r, 70, 95)), from)
  const goal = between(r, 22, SCENE_W - 22)
  while ((goal - route.x) * -from > 0) {
    const x = route.x - from * between(r, 11, 17)
    route.move(
      x,
      groundY(route.y + between(r, -4, 4)),
      400,
      'hop',
      between(r, 4, 7)
    )
    route.stay(between(r, 200, 700))
  }
  if (!clearAt(open, route.x, route.y, 2)) return null
  route.stay(between(r, 2000, 4000), day ? 'still' : 'chirp')
  if (r() < 0.6) {
    const x = route.x + between(r, -12, 12)
    route.move(x, groundY(route.y + between(r, -3, 3)), 380, 'hop', 4)
    route.stay(between(r, 1200, 2600), day ? 'still' : 'chirp')
  }
  const out = nearestSide(route.x)
  while (route.x > -6 && route.x < SCENE_W + 5) {
    const x = route.x + out * between(r, 12, 18)
    route.move(x, groundY(route.y + between(r, -3, 3)), 420, 'hop', 6)
    if (route.x > -6 && route.x < SCENE_W + 5) route.stay(between(r, 200, 600))
  }
  return route
}

function planCrawler(r: Rand, open: PixelMask, speed: number): Route | null {
  const fromBottom = r() < 0.5
  const side: 1 | -1 = r() < 0.5 ? -1 : 1
  let stop = fromBottom
    ? findSpot(r, open, 12, SCENE_W - 12, SCENE_H - 16)
    : side < 0
      ? findSpot(r, open, 8, 44)
      : findSpot(r, open, SCENE_W - 44, SCENE_W - 8)
  if (!stop) return null
  const route = fromBottom
    ? new Route(stop[0], SCENE_H + 2, side)
    : new Route(offSide(side, 4), stop[1], side === 1 ? -1 : 1)
  const stops = 2 + Math.floor(r() * 2)
  for (let i = 0; i < stops && stop; i++) {
    route.walk(stop[0], stop[1], speed)
    route.stay(between(r, 500, 1800), r() < 0.3 ? 'look' : 'still')
    stop = findSpot(
      r,
      open,
      Math.max(6, stop[0] - 22),
      Math.min(SCENE_W - 6, stop[0] + 22),
      Math.max(GROUND_TOP, stop[1] - 8),
      Math.min(GROUND_BOTTOM, stop[1] + 8)
    )
  }
  const toBottom = SCENE_H - route.y < Math.min(route.x, SCENE_W - route.x)
  if (toBottom) route.walk(route.x + between(r, -8, 8), SCENE_H + 3, speed)
  else route.walk(offSide(nearestSide(route.x), 5), route.y, speed)
  return route
}

function planSnail(r: Rand, open: PixelMask): Route | null {
  const spot = findSpot(r, open, 14, SCENE_W - 14, SCENE_H - 9, SCENE_H - 5)
  if (!spot) return null
  const dir: 1 | -1 = r() < 0.5 ? 1 : -1
  const speed = between(r, 2, 2.6)
  const [x, y] = spot
  const peakX = x + dir * between(r, 6, 10)
  if (!clearAt(open, peakX, y - 3)) return null
  return new Route(x - dir * 8, SCENE_H + 2, dir)
    .walk(x, y, speed)
    .walk(peakX, y - 3, speed)
    .stay(between(r, 2500, 4500), 'look')
    .walk(peakX + dir * 8, SCENE_H + 2, speed)
}

function planBird(r: Rand, open: PixelMask): Route | null {
  const from: 1 | -1 = r() < 0.5 ? -1 : 1
  const land = findSpot(r, open, 24, SCENE_W - 24, GROUND_TOP + 4)
  if (!land) return null
  const route = new Route(
    offSide(from, 8),
    between(r, 34, 52),
    from === 1 ? -1 : 1
  )
  const [lx, ly] = land
  route.move(lx, ly, (Math.abs(route.x - lx) / 70) * 1000 + 500, 'fly', 4)
  route.stay(between(r, 400, 900), 'look')
  const moves = 3 + Math.floor(r() * 4)
  for (let i = 0; i < moves; i++) {
    const roll = r()
    if (roll < 0.4) {
      const dir = r() < 0.75 ? route.face : (-route.face as 1 | -1)
      const x = route.x + dir * between(r, 3, 6)
      const y = groundY(route.y + between(r, -2, 2))
      if (!clearAt(open, x, y)) {
        route.stay(500, 'look', -route.face as 1 | -1)
        continue
      }
      route.move(x, y, 240, 'hop', 2)
      if (r() < 0.5) route.move(x + dir * 3, y, 240, 'hop', 2)
    } else if (roll < 0.8) {
      route.stay(between(r, 700, 1400), 'peck')
    } else {
      route.stay(between(r, 500, 1100), 'look', -route.face as 1 | -1)
    }
  }
  const out =
    r() < 0.7 ? nearestSide(route.x) : (-nearestSide(route.x) as 1 | -1)
  const ex = offSide(out, 8)
  route.move(
    ex,
    between(r, 14, 36),
    (Math.abs(route.x - ex) / 85) * 1000 + 400,
    'fly',
    6
  )
  return route
}

function planButterfly(r: Rand, open: PixelMask): Route | null {
  const from: 1 | -1 = r() < 0.5 ? -1 : 1
  const route = new Route(
    offSide(from, 4),
    between(r, 30, 58),
    from === 1 ? -1 : 1
  )
  const rest = r() < 0.6 ? findSpot(r, open, 30, SCENE_W - 30) : null
  if (rest) {
    route.walk(rest[0], rest[1] - 1, between(r, 14, 20), 'fly')
    route.stay(between(r, 2500, 5000), 'still')
  } else {
    route.walk(SCENE_W / 2 + between(r, -30, 30), between(r, 36, 60), 18, 'fly')
  }
  return route.walk(
    offSide(from === 1 ? -1 : 1, 4),
    between(r, 20, 50),
    20,
    'fly'
  )
}

interface Channel {
  readonly seed: number
  readonly slotMs: number
  readonly offsetMs: number
  readonly chance: number
  readonly air: boolean
}

const CHANNELS: readonly Channel[] = [
  { seed: 401, slotMs: 19_000, offsetMs: 0, chance: 0.9, air: false },
  { seed: 709, slotMs: 26_000, offsetMs: 11_000, chance: 0.8, air: false },
  { seed: 953, slotMs: 24_000, offsetMs: 5_000, chance: 0.75, air: true },
]

const FIRST_VISIT_MS = 2500

const WEIGHTS: Readonly<
  Record<'day' | 'night', Readonly<Partial<Record<Kind, number>>>>
> = {
  day: { worm: 2, ladybug: 2, cricket: 1.4, snail: 0.6, beetle: 0.5 },
  night: { cricket: 3, worm: 2, beetle: 1.4, snail: 2 },
}

function pickKind(r: Rand, m: RoomMoment, air: boolean): Kind | null {
  const dark = isDarkTime(m.time)
  if (air) {
    if (dark) return null
    const butterflies = m.season !== 'winter'
    return butterflies && r() < 0.4 ? 'butterfly' : 'bird'
  }
  const table = WEIGHTS[dark ? 'night' : 'day']
  let total = 0
  for (const w of Object.values(table)) total += w ?? 0
  let pick = r() * total
  for (const [kind, w] of Object.entries(table) as [Kind, number][]) {
    pick -= w
    if (pick <= 0) return kind
  }
  return null
}

function plan(kind: Kind, r: Rand, open: PixelMask, m: RoomMoment) {
  const day = !isDarkTime(m.time)
  switch (kind) {
    case 'worm':
      return planWorm(r, open)
    case 'cricket':
      return planCricket(r, open, day)
    case 'ladybug':
      return planCrawler(r, open, 6)
    case 'beetle':
      return planCrawler(r, open, 9)
    case 'snail':
      return planSnail(r, open)
    case 'bird':
      return planBird(r, open)
    case 'butterfly':
      return planButterfly(r, open)
  }
}

const visits = new WeakMap<PixelMask, Map<string, Visit | null>>()

function clashes(visit: Visit, upTo: number, m: RoomMoment, open: PixelMask) {
  for (let c = 0; c < upTo; c++) {
    const other = CHANNELS[c]
    const first = Math.floor((visit.startMs + other.offsetMs) / other.slotMs)
    const last = Math.floor((visit.endMs + other.offsetMs) / other.slotMs)
    for (let slot = first; slot <= last; slot++) {
      const seen = visitFor(c, slot, m, open)
      if (
        seen?.kind === visit.kind &&
        seen.startMs < visit.endMs &&
        visit.startMs < seen.endMs
      )
        return true
    }
  }
  return false
}

function visitFor(
  index: number,
  slot: number,
  m: RoomMoment,
  open: PixelMask
): Visit | null {
  const channel = CHANNELS[index]
  let cache = visits.get(open)
  if (!cache) {
    cache = new Map()
    visits.set(open, cache)
  }
  const key = `${channel.seed}:${slot}:${m.time}:${m.season}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  if (cache.size > 48) cache.clear()
  const r = randFrom(Math.imul(channel.seed, 7919) ^ slot)
  let visit: Visit | null = null
  if (r() < channel.chance) {
    const kind = pickKind(r, m, channel.air)
    const route = kind ? plan(kind, r, open, m) : null
    const room = channel.slotMs - 1000
    if (kind && route && route.t <= room) {
      const slotStart = slot * channel.slotMs - channel.offsetMs
      const startMs = slotStart + r() * (room - route.t)
      const booked: Visit = {
        kind,
        startMs,
        endMs: startMs + route.t,
        variant: r(),
        legs: route.legs,
      }
      if (startMs >= FIRST_VISIT_MS && !clashes(booked, index, m, open))
        visit = booked
    }
  }
  cache.set(key, visit)
  return visit
}

interface Pose {
  x: number
  y: number
  lift: number
  face: 1 | -1
  mode: Mode
  u: number
  at: number
  local: number
}

const POSE: Pose = {
  x: 0,
  y: 0,
  lift: 0,
  face: 1,
  mode: 'still',
  u: 0,
  at: 0,
  local: 0,
}

function poseAt(visit: Visit, tMs: number): Pose | null {
  const local = tMs - visit.startMs
  for (const leg of visit.legs) {
    if (local >= leg.t1) continue
    const u = (local - leg.t0) / Math.max(1, leg.t1 - leg.t0)
    POSE.x = leg.x0 + (leg.x1 - leg.x0) * u
    POSE.y = leg.y0 + (leg.y1 - leg.y0) * u
    POSE.lift = leg.arc * 4 * u * (1 - u)
    POSE.face = leg.face
    POSE.mode = leg.mode
    POSE.u = u
    POSE.at = local - leg.t0
    POSE.local = local
    return POSE
  }
  return null
}

function dot(
  buf: PixelBuffer,
  open: PixelMask,
  x: number,
  y: number,
  c: number,
  a = 1
): void {
  const ix = Math.round(x)
  const iy = Math.round(y)
  if (ix < 0 || iy < 0 || ix >= SCENE_W || iy >= SCENE_H) return
  if (open.data[iy * SCENE_W + ix] !== 1) return
  blend(buf, ix, iy, c, a)
}

const WORM_LEN = 6

function drawWorm(
  buf: PixelBuffer,
  open: PixelMask,
  visit: Visit,
  tMs: number
): void {
  const leg = visit.legs[1]
  const local = tMs - visit.startMs
  const dir = leg.face
  const dist = Math.abs(leg.x1 - leg.x0)
  const hx = leg.x0
  const hy = leg.y0
  const holeA = Math.min(1, local / 600)
  const holeB =
    local > leg.t0 + 1500 ? Math.min(1, (local - leg.t0 - 1500) / 600) : 0
  const fadeEnd = local > leg.t1 ? 1 - (local - leg.t1) / 1400 : 1
  for (const [x, a] of [
    [hx, holeA * fadeEnd],
    [leg.x1, holeB * fadeEnd],
  ] as const) {
    dot(buf, open, x, hy, C.hole, a)
    dot(buf, open, x - 1, hy, C.holeRim, a * 0.7)
    dot(buf, open, x + 1, hy, C.holeRim, a * 0.7)
  }
  if (local < leg.t0 || local >= leg.t1) return
  const u = (local - leg.t0) / (leg.t1 - leg.t0)
  const beat = (local - leg.t0) / 700
  const surge = beat - Math.floor(beat)
  const head = u * (dist + WORM_LEN) + 0.9 * Math.sin(surge * Math.PI)
  const len = WORM_LEN - 1.6 * Math.sin(surge * Math.PI)
  for (let k = 0; k <= Math.ceil(len); k++) {
    const s = head - k
    if (s < 0 || s > dist) continue
    const wiggle = Math.sin(s * 0.9 + visit.variant * 6 + local * 0.004) * 0.7
    const c =
      k === 0 ? C.wormBand : k === 2 ? C.wormBand : k % 2 ? C.worm : C.wormDark
    dot(buf, open, hx + dir * s, hy + wiggle - 0.3, c)
  }
}

function drawCricket(
  buf: PixelBuffer,
  open: PixelMask,
  p: Pose,
  green: boolean,
  tMs: number
): void {
  const body = green ? C.hopper : C.cricket
  const leg = green ? C.hopperLeg : C.cricketLeg
  const wing = green ? C.hopperWing : C.cricketWing
  const f = p.face
  const x = Math.round(p.x)
  const y = Math.round(p.y - p.lift)
  const at = (dx: number, dy: number, c: number, a = 1) =>
    dot(buf, open, x + dx * f, y + dy, c, a)
  for (let dx = -2; dx <= 1; dx++) at(dx, -1, body)
  at(2, -1, leg)
  at(-1, -2, body)
  at(0, -2, body)
  const chirp = p.mode === 'chirp' && Math.floor(tMs / 100) % 2 === 0
  at(chirp ? 0 : -1, -2, wing)
  if (p.mode === 'hop' && p.u > 0.1 && p.u < 0.9) {
    at(-3, -1, leg)
    at(-4, 0, leg)
  } else {
    at(-2, -2, leg)
    at(-3, -1, leg)
    at(-3, 0, leg)
    at(1, 0, leg)
    at(-1, 0, leg)
  }
  at(3, -2, C.antenna, 0.7)
  at(4, -3, C.antenna, 0.5)
}

function drawBug(
  buf: PixelBuffer,
  open: PixelMask,
  p: Pose,
  beetle: boolean,
  tMs: number
): void {
  const f = p.face
  const x = Math.round(p.x)
  const y = Math.round(p.y)
  const at = (dx: number, dy: number, c: number, a = 1) =>
    dot(buf, open, x + dx * f, y + dy, c, a)
  const shell = beetle ? C.beetle : C.lady
  const shine = beetle ? C.beetleSheen : C.ladyLight
  const head = beetle ? C.beetleHead : C.ladySpot
  for (let dx = -1; dx <= 1; dx++) {
    at(dx, -1, shell)
    at(dx, 0, shell)
  }
  if (beetle) at(-2, 0, shell)
  at(-1, -1, shine)
  at(2, 0, head)
  if (beetle) at(2, -1, head)
  else {
    at(0, -1, C.ladySpot)
    at(-1, 0, C.ladySpot)
  }
  const walking = p.mode === 'walk'
  const step = walking ? Math.floor(tMs / 100) % 2 : 0
  at(step ? -1 : 1, 1, head, 0.55)
  if (p.mode === 'look') at(3, -1, head, 0.6)
}

function drawSnail(
  buf: PixelBuffer,
  open: PixelMask,
  visit: Visit,
  p: Pose,
  tMs: number
): void {
  const f = p.face
  const x = Math.round(p.x)
  const y = Math.round(p.y)
  const local = tMs - visit.startMs
  for (const leg of visit.legs) {
    if (leg.t0 > local) break
    const span = Math.min(local, leg.t1) - leg.t0
    const steps = Math.floor(span / 400)
    for (let i = 0; i <= steps; i++) {
      const tt = leg.t0 + i * 400
      const u = (tt - leg.t0) / Math.max(1, leg.t1 - leg.t0)
      const age = local - tt
      if (age < 900 || age > 9000) continue
      const sx = leg.x0 + (leg.x1 - leg.x0) * u
      const sy = leg.y0 + (leg.y1 - leg.y0) * u
      dot(buf, open, sx, sy, C.slime, 0.32 * (1 - age / 9000))
    }
  }
  const at = (dx: number, dy: number, c: number) =>
    dot(buf, open, x + dx * f, y + dy, c)
  const looking = p.mode === 'look'
  const stretch =
    p.mode === 'walk' ? Math.round((Math.sin(tMs / 260) + 1) / 2) : 0
  for (let dx = -3; dx <= 2 + stretch; dx++) at(dx, 0, C.snail)
  at(-3, 0, C.snailDark)
  at(2 + stretch, -1, C.snail)
  const peek = looking ? Math.sin(Math.min(1, p.at / 1200) * Math.PI) : 1
  if (peek > 0.3) {
    at(3 + stretch, -2, C.snailDark)
    if (peek > 0.7) at(4 + stretch, -3, C.snailDark)
  }
  at(-2, -1, C.shellDark)
  at(-1, -1, C.shell)
  at(0, -1, C.shell)
  at(1, -1, C.shellDark)
  at(-2, -2, C.shell)
  at(-1, -2, C.shellLight)
  at(0, -2, C.shell)
  at(1, -2, C.shellDark)
  at(-1, -3, C.shell)
  at(0, -3, C.shellDark)
}

type BirdPart = 'tail' | 'back' | 'wing' | 'shine' | 'belly' | 'leg'
const BIRD_BODY: readonly (readonly [number, number, BirdPart])[] = [
  [-4, -3, 'tail'],
  [-3, -2, 'tail'],
  [-1, -3, 'back'],
  [0, -3, 'back'],
  [0, -2, 'back'],
  [-2, -2, 'shine'],
  [-1, -2, 'wing'],
  [-2, -1, 'wing'],
  [-1, -1, 'wing'],
  [1, -2, 'belly'],
  [2, -2, 'belly'],
  [0, -1, 'belly'],
  [1, -1, 'belly'],
  [-1, 0, 'leg'],
  [1, 0, 'leg'],
]
const WING_UP: readonly (readonly [number, number])[] = [
  [-1, -4],
  [-2, -4],
  [-2, -5],
  [-3, -6],
]
const WING_DOWN: readonly (readonly [number, number])[] = [
  [-1, 0],
  [-2, 0],
  [-2, 1],
]

function drawBird(
  buf: PixelBuffer,
  open: PixelMask,
  visit: Visit,
  p: Pose,
  tMs: number
): void {
  const robin = visit.variant < 0.45
  const tone: Readonly<Record<BirdPart, number>> = robin
    ? {
        tail: C.robinWing,
        back: C.robin,
        wing: C.robinWing,
        shine: C.robinShine,
        belly: C.robinBelly,
        leg: C.leg,
      }
    : {
        tail: C.sparrowWing,
        back: C.sparrow,
        wing: C.sparrowWing,
        shine: C.sparrowShine,
        belly: C.sparrowBelly,
        leg: C.leg,
      }
  const f = p.face
  const x = Math.round(p.x)
  const y = Math.round(p.y - p.lift)
  const at = (dx: number, dy: number, c: number, a = 1) =>
    dot(buf, open, x + dx * f, y + dy, c, a)
  const flying = p.mode === 'fly'
  const landing = p.local < visit.legs[0].t1 && p.u > 0.7
  if (!flying) for (let dx = -2; dx <= 2; dx++) at(dx, 1, C.shadow, 0.3)
  for (const [dx, dy, part] of BIRD_BODY)
    if (part !== 'leg' || !flying) at(dx, dy, tone[part])
  if (flying) {
    const up = landing || Math.floor(tMs / 100) % 2 === 0
    for (const [dx, dy] of up ? WING_UP : WING_DOWN) at(dx, dy, tone.wing)
  }
  const peck = p.mode === 'peck' && Math.floor(p.at / 250) % 2 === 1
  if (peck) {
    at(2, -2, tone.back)
    at(3, -2, tone.back)
    at(2, -1, tone.back)
    at(3, -1, C.eye)
    at(3, 0, C.beak)
  } else {
    at(1, -4, tone.back)
    at(2, -4, tone.back)
    at(1, -3, tone.back)
    at(2, -3, C.eye)
    at(3, -3, C.beak)
  }
}

function drawButterfly(
  buf: PixelBuffer,
  open: PixelMask,
  visit: Visit,
  p: Pose,
  tMs: number
): void {
  const hue = Math.floor(visit.variant * 3)
  const wing = hue === 0 ? C.wingA : hue === 1 ? C.wingB : C.wingC
  const edge = hue === 0 ? C.wingADark : hue === 1 ? C.wingBDark : C.wingCDark
  const flying = p.mode === 'fly'
  const ease = flying
    ? Math.sin(Math.PI * Math.min(1, p.u * 6, (1 - p.u) * 6))
    : 0
  const bob = ease * (3.2 * wander(tMs / 380, 17) + 1.4 * Math.sin(tMs / 140))
  const sway = ease * 2.5 * wander(tMs / 520, 29)
  const x = Math.round(p.x + sway)
  const y = Math.round(p.y + bob)
  const beat = flying
    ? Math.floor(tMs / 100) % 2 === 0
    : Math.floor(p.at / 900) % 3 === 0
  const at = (dx: number, dy: number, c: number) =>
    dot(buf, open, x + dx, y + dy, c)
  at(0, 0, C.body)
  at(0, -1, C.body)
  if (beat) {
    at(-1, -2, wing)
    at(1, -2, wing)
    at(-1, -1, edge)
    at(1, -1, edge)
  } else {
    at(-1, -1, wing)
    at(-2, -1, wing)
    at(1, -1, wing)
    at(2, -1, wing)
    at(-2, -2, wing)
    at(2, -2, wing)
    at(-1, 0, edge)
    at(1, 0, edge)
  }
}

export function drawForestLife(
  buf: PixelBuffer,
  m: RoomMoment,
  open: PixelMask
): void {
  const t = m.tMs
  for (let c = 0; c < CHANNELS.length; c++) {
    const channel = CHANNELS[c]
    const slot = Math.floor((t + channel.offsetMs) / channel.slotMs)
    const visit = visitFor(c, slot, m, open)
    if (!visit || t < visit.startMs || t >= visit.endMs) continue
    if (visit.kind === 'worm') {
      drawWorm(buf, open, visit, t)
      continue
    }
    const p = poseAt(visit, t)
    if (!p) continue
    switch (visit.kind) {
      case 'cricket':
        drawCricket(buf, open, p, !isDarkTime(m.time), t)
        break
      case 'ladybug':
        drawBug(buf, open, p, false, t)
        break
      case 'beetle':
        drawBug(buf, open, p, true, t)
        break
      case 'snail':
        drawSnail(buf, open, visit, p, t)
        break
      case 'bird':
        drawBird(buf, open, visit, p, t)
        break
      case 'butterfly':
        drawButterfly(buf, open, visit, p, t)
        break
    }
  }
}

export function forestVisits(
  m: RoomMoment,
  open: PixelMask,
  fromMs: number,
  toMs: number
): Visit[] {
  const out: Visit[] = []
  for (let c = 0; c < CHANNELS.length; c++) {
    const channel = CHANNELS[c]
    const first = Math.floor((fromMs + channel.offsetMs) / channel.slotMs)
    const last = Math.floor((toMs + channel.offsetMs) / channel.slotMs)
    for (let slot = first; slot <= last; slot++) {
      const visit = visitFor(c, slot, m, open)
      if (visit && visit.endMs > fromMs && visit.startMs < toMs) out.push(visit)
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs)
}
