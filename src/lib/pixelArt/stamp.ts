import type { PixelBuffer } from './buffer'
import type { Rgb } from './color'
import { setPixel } from './draw'
import type { FeaturePixel } from './raster'

export type StampPattern = readonly string[]

export type StampColors = Readonly<Record<string, Rgb>>

export type StampClip = (x: number, y: number) => boolean

export function stamp(
  buf: PixelBuffer,
  pattern: StampPattern,
  x: number,
  y: number,
  colors: StampColors,
  clip?: StampClip
): void {
  for (let j = 0; j < pattern.length; j++) {
    const row = pattern[j]
    for (let i = 0; i < row.length; i++) {
      const c = colors[row[i]]
      if (c === undefined) continue
      const X = Math.round(x + i)
      const Y = Math.round(y + j)
      if (clip && !clip(X, Y)) continue
      setPixel(buf, X, Y, c)
    }
  }
}

export function stampPixels(
  pattern: StampPattern,
  x: number,
  y: number,
  colors: StampColors
): FeaturePixel[] {
  const out: FeaturePixel[] = []
  for (let j = 0; j < pattern.length; j++) {
    const row = pattern[j]
    for (let i = 0; i < row.length; i++) {
      const c = colors[row[i]]
      if (c !== undefined) out.push([x + i, y + j, c])
    }
  }
  return out
}

export function stampWidth(pattern: StampPattern): number {
  let w = 0
  for (const row of pattern) w = Math.max(w, row.length)
  return w
}
