/**
 * Immediate-mode drawing on a {@link PixelBuffer}: single pixels, rectangles and
 * filled ellipses, all opaque. Coordinates are buffer pixels (origin top left).
 * Every write is bounds-checked, so callers may draw partly off-canvas.
 */
import type { PixelBuffer } from './buffer'
import type { Rgb } from './color'

/**
 * Writes `c` at (x, y) rounded to the nearest pixel, if it is inside the
 * buffer. (Unrounded, a fractional index would silently write nothing.)
 */
export function setPixel(
  buf: PixelBuffer,
  px: number,
  py: number,
  c: Rgb
): void {
  const x = Math.round(px)
  const y = Math.round(py)
  if (x < 0 || y < 0 || x >= buf.width || y >= buf.height) return
  const k = (y * buf.width + x) * 4
  const d = buf.data
  d[k] = (c >> 16) & 255
  d[k + 1] = (c >> 8) & 255
  d[k + 2] = c & 255
  d[k + 3] = 255
}

/** Writes `c` at (x, y) rounded to the nearest pixel (same as {@link setPixel}). */
export function plot(buf: PixelBuffer, x: number, y: number, c: Rgb): void {
  setPixel(buf, x, y, c)
}

/**
 * Fills the half-open rectangle x0 ≤ x < x1, y0 ≤ y < y1 (stepping one pixel
 * from x0/y0, each position rounded).
 */
export function fillRect(
  buf: PixelBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: Rgb
): void {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) plot(buf, x, y, c)
  }
}

/**
 * Fills the ellipse centred on (cx, cy) with radii rx, ry. A pixel is inside
 * when its centre is. `topHalf` keeps only pixels whose centre is at or above
 * cy (bowls, domes).
 */
export function fillEllipse(
  buf: PixelBuffer,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  c: Rgb,
  topHalf = false
): void {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const a = (x + 0.5 - cx) / rx
      const b = (y + 0.5 - cy) / ry
      if (a * a + b * b <= 1 && (!topHalf || y + 0.5 <= cy)) {
        plot(buf, x, y, c)
      }
    }
  }
}

/**
 * The colour at (x, y) rounded to the nearest pixel, ignoring alpha. Out of
 * bounds reads 0.
 */
export function readRgb(buf: PixelBuffer, px: number, py: number): Rgb {
  const x = Math.round(px)
  const y = Math.round(py)
  if (x < 0 || y < 0 || x >= buf.width || y >= buf.height) return 0
  const k = (y * buf.width + x) * 4
  const d = buf.data
  return (d[k] << 16) | (d[k + 1] << 8) | d[k + 2]
}
