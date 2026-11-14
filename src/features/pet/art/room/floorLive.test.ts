import { describe, expect, it } from 'vitest'

import { SCENE_H, SCENE_W } from '../layout'
import { FLOOR_TOP } from './floor'
import { KOI_COUNT, koiSpine } from './floorLive'

const koi = Array.from({ length: KOI_COUNT }, (_, i) => i)
const FRAME_MS = 100

const length = (spine: readonly (readonly [number, number])[]): number => {
  let sum = 0
  for (let j = 1; j < spine.length; j++)
    sum += Math.hypot(
      spine[j][0] - spine[j - 1][0],
      spine[j][1] - spine[j - 1][1]
    )
  return sum
}

describe('koi pond', () => {
  it.each(koi)('koi %i never folds on a turn in view', (i) => {
    for (let t = 0; t < 200_000; t += 250) {
      const spine = koiSpine(i, t, -Infinity)
      if (spine.filter(([x]) => x >= 0 && x < SCENE_W).length < 2) continue
      const [hx, hy] = spine[0]
      const [tx, ty] = spine[spine.length - 1]
      expect(Math.hypot(hx - tx, hy - ty) / length(spine)).toBeGreaterThan(0.6)
    }
  })

  it.each(koi)('koi %i stays in the water', (i) => {
    for (let t = 0; t < 200_000; t += 250)
      for (const [, y] of koiSpine(i, t, -Infinity)) {
        expect(y).toBeGreaterThan(FLOOR_TOP + 6)
        expect(y).toBeLessThan(SCENE_H - 2)
      }
  })

  it.each(koi)('koi %i keeps swimming forward through a pat', (i) => {
    const pat = 20_000
    let last = koiSpine(i, pat - 500, pat)
    for (let t = pat - 500 + FRAME_MS; t < pat + 4000; t += FRAME_MS) {
      const spine = koiSpine(i, t, pat)
      const ahead =
        (spine[0][0] - last[0][0]) * (last[0][0] - last[2][0]) +
        (spine[0][1] - last[0][1]) * (last[0][1] - last[2][1])
      expect(ahead).toBeGreaterThan(0)
      last = spine
    }
  })

  it.each(koi)('koi %i darts when patted, then settles back', (i) => {
    const pat = 20_000
    const step = (t: number, patMs: number): number => {
      const a = koiSpine(i, t, patMs)[0]
      const b = koiSpine(i, t + FRAME_MS, patMs)[0]
      return Math.hypot(b[0] - a[0], b[1] - a[1])
    }
    expect(step(pat + 100, pat)).toBeGreaterThan(2 * step(pat + 100, -Infinity))
    expect(koiSpine(i, pat + 3000, pat)).toEqual(
      koiSpine(i, pat + 3000, -Infinity)
    )
  })
})
