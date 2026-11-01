import { createLru, type PixelBuffer, type PixelMask } from '@/lib/pixelArt'

import { SCENE_H, SCENE_W } from './layout'
import { lampLightOrigin, lampTick, type LampId } from './room/lamp'
import { isWindowPane, type TimeOfDay } from './room/window'

const NIGHT: readonly number[] = [0.74, 0.62, 0.52, 0.4, 0.28, 0.17]

const RADIUS: readonly number[] = [0, 26, 40, 56, 78, 112]

const TIME_DARKNESS: Readonly<Record<TimeOfDay, number>> = {
  night: 1,
  dusk: 0.82,
  dawn: 0.78,
  day: 0.42,
}

const SUBJECT_DARKNESS = 0.5

export const LIGHT_PHASES = 8

export function lightPhase(tMs: number): number {
  const turn = 2 * Math.PI
  const angle = (((lampTick(tMs) * 1.3) % turn) + turn) % turn
  return Math.round((angle / turn) * LIGHT_PHASES) % LIGHT_PHASES
}

const CLASSES = 6 * 4

const TABLE = CLASSES * 2

interface LightMap {
  readonly cls: Uint8Array
  readonly mul: Float64Array
  readonly dark: readonly [Float64Array, Float64Array, Float64Array]
  readonly light: readonly [Float64Array, Float64Array, Float64Array]
}

function buildLightMap(
  lamp: LampId,
  level: number,
  time: TimeOfDay,
  phase: number
): LightMap {
  const [fx, fy] = lampLightOrigin(lamp, level)
  const breath = Math.sin((phase / LIGHT_PHASES) * 2 * Math.PI) * 0.04
  const r = RADIUS[level] * (1 + breath)
  const night = NIGHT[level] * TIME_DARKNESS[time]

  const cls = new Uint8Array(SCENE_W * SCENE_H)
  for (let y = 0; y < SCENE_H; y++) {
    for (let x = 0; x < SCENE_W; x++) {
      const lit = r
        ? Math.max(0, 1 - Math.hypot(x - fx, (y - fy) * 1.15) / r)
        : 0
      const band = Math.ceil(lit * 5)
      const glass = isWindowPane(x, y)
      let sun = false
      if (time === 'day' && !glass && y > 46) {
        const u = (y - 46) / 54
        sun = x > 18 + u * 44 && x < 56 + u * 50
      }
      cls[y * SCENE_W + x] = band * 4 + (glass ? 2 : 0) + (sun ? 1 : 0)
    }
  }

  const mul = new Float64Array(TABLE)
  const dark = [
    new Float64Array(TABLE),
    new Float64Array(TABLE),
    new Float64Array(TABLE),
  ] as const
  const light = [
    new Float64Array(TABLE),
    new Float64Array(TABLE),
    new Float64Array(TABLE),
  ] as const
  for (let band = 0; band <= 5; band++) {
    const lit = band / 5
    const warm = lit * 0.16 * (level / 5)
    for (let flags = 0; flags < 4; flags++) {
      const glass = (flags & 2) !== 0
      const sun = flags & 1 ? 0.1 : 0
      const room = glass ? 0 : night * (1 - lit)
      for (const [i, dk] of [
        [band * 4 + flags, room],
        [CLASSES + band * 4 + flags, room * SUBJECT_DARKNESS],
      ]) {
        mul[i] = 1 - dk
        dark[0][i] = 16 * dk
        dark[1][i] = 14 * dk
        dark[2][i] = 40 * dk
        light[0][i] = 255 * (warm + sun)
        light[1][i] = 150 * warm + 230 * sun
        light[2][i] = 40 * warm + 170 * sun
      }
    }
  }
  return { cls, mul, dark, light }
}

const maps = createLru<LightMap>(4 * 6 * LIGHT_PHASES)

function lightMap(
  lamp: LampId,
  level: number,
  time: TimeOfDay,
  phase: number
): LightMap {
  return maps.getOrCreate(`${lamp}|${level}|${time}|${phase}`, () =>
    buildLightMap(lamp, level, time, phase)
  )
}

export function applyLighting(
  buf: PixelBuffer,
  lamp: LampId,
  level: number,
  time: TimeOfDay,
  tMs: number,
  subject?: PixelMask
): void {
  if (buf.width !== SCENE_W || buf.height !== SCENE_H) {
    throw new Error('pet art: lighting expects a 180 × 100 scene')
  }
  const { cls, mul, dark, light } = lightMap(lamp, level, time, lightPhase(tMs))
  const [dr, dg, db] = dark
  const [lr, lg, lb] = light
  const d = buf.data
  const pets = subject?.data
  for (let p = 0, k = 0; p < cls.length; p++, k += 4) {
    const c = pets && pets[p] ? CLASSES + cls[p] : cls[p]
    const m = mul[c]
    d[k] = d[k] * m + dr[c] + lr[c]
    d[k + 1] = d[k + 1] * m + dg[c] + lg[c]
    d[k + 2] = d[k + 2] * m + db[c] + lb[c]
  }
}
