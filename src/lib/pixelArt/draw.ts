import type { PixelBuffer } from './buffer'
import type { Rgb } from './color'

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

export function plot(buf: PixelBuffer, x: number, y: number, c: Rgb): void {
  setPixel(buf, x, y, c)
}

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

export function readRgb(buf: PixelBuffer, px: number, py: number): Rgb {
  const x = Math.round(px)
  const y = Math.round(py)
  if (x < 0 || y < 0 || x >= buf.width || y >= buf.height) return 0
  const k = (y * buf.width + x) * 4
  const d = buf.data
  return (d[k] << 16) | (d[k + 1] << 8) | d[k + 2]
}
