/**
 * String-row pixel patterns ("stamps"): an array of rows top to bottom, one
 * character per pixel, e.g. a heart is `.r.r.` / `rrrrr` / `.rrr.` / `..r..`.
 * Each character is looked up in a colour map; characters without an entry (by
 * convention `.`) are transparent.
 */
import type { PixelBuffer } from './buffer'
import type { Rgb } from './color'
import { setPixel } from './draw'
import type { FeaturePixel } from './raster'

/** Rows of characters, top to bottom. */
export type StampPattern = readonly string[]

/** Character → colour for a {@link StampPattern}. */
export type StampColors = Readonly<Record<string, Rgb>>

/** Optional clip: return false to skip a destination pixel. */
export type StampClip = (x: number, y: number) => boolean

/**
 * Draws `pattern` with its top-left character at integer (x, y). Positions are
 * rounded first, so fractional origins snap like {@link plot}.
 */
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

/** The pattern as feature pixels (for {@link rasterize} specs). */
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

/** Width of a pattern (its longest row). */
export function stampWidth(pattern: StampPattern): number {
  let w = 0
  for (const row of pattern) w = Math.max(w, row.length)
  return w
}
