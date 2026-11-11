import type { PixelBuffer } from '@/lib/pixelArt'

import type { TimeOfDay } from './room/window'

export const SHOW_MS = 14_000

export const SHOW_FADE_MS = 900

export const COINS_SHOW_MS = 2000

export const COINS_FADE_MS = 120

export const isDarkTime = (time: TimeOfDay): boolean =>
  time === 'night' || time === 'dusk'

export interface ShowMoment {
  readonly tMs: number
  readonly time: TimeOfDay
  readonly patMs: number
  readonly coinsMs: number
}

const fade = (since: number, showMs: number, fadeMs: number) =>
  since < 0 || since >= showMs
    ? 0
    : Math.min(1, since / fadeMs, (showMs - since) / fadeMs)

export function showStrength(m: ShowMoment): number {
  if (isDarkTime(m.time)) return 1
  return Math.max(
    fade(m.tMs - m.patMs, SHOW_MS, SHOW_FADE_MS),
    fade(m.tMs - m.coinsMs, COINS_SHOW_MS, COINS_FADE_MS)
  )
}

export function blend(
  buf: PixelBuffer,
  px: number,
  py: number,
  c: number,
  a: number
): void {
  const x = Math.round(px)
  const y = Math.round(py)
  if (x < 0 || y < 0 || x >= buf.width || y >= buf.height || a <= 0) return
  const k = (y * buf.width + x) * 4
  const d = buf.data
  const v = Math.min(1, a)
  d[k] += (((c >> 16) & 255) - d[k]) * v
  d[k + 1] += (((c >> 8) & 255) - d[k + 1]) * v
  d[k + 2] += ((c & 255) - d[k + 2]) * v
}

export function square(
  buf: PixelBuffer,
  x: number,
  y: number,
  size: number,
  c: number,
  a: number
): void {
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) blend(buf, x + i, y + j, c, a)
}

export function glow(
  buf: PixelBuffer,
  cx: number,
  cy: number,
  radius: number,
  c: number,
  a: number
): void {
  if (a <= 0 || radius <= 0) return
  const x0 = Math.max(0, Math.floor(cx - radius))
  const x1 = Math.min(buf.width - 1, Math.ceil(cx + radius))
  const y0 = Math.max(0, Math.floor(cy - radius))
  const y1 = Math.min(buf.height - 1, Math.ceil(cy + radius))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy) / radius
      if (d < 1) blend(buf, x, y, c, a * (1 - d) * (1 - d))
    }
  }
}

export function darken(buf: PixelBuffer, amount: number): void {
  const r = 1 - 0.45 * amount
  const b = 1 - 0.34 * amount
  const d = buf.data
  for (let k = 0; k < d.length; k += 4) {
    d[k] *= r
    d[k + 1] *= r
    d[k + 2] *= b
  }
}
