import { rgbPalette, stamp, type PixelBuffer } from '@/lib/pixelArt'
import { GIFT_KINDS, isGiftKind, type GiftKind } from '@/types/pet'

export { GIFT_KINDS, isGiftKind }
export type { GiftKind }

export const GIFT_STAMPS: Readonly<Record<GiftKind, readonly string[]>> = {
  olive: ['...g.', '..gGg', '.gb..', 'gg...', 'b....'],
  fig: ['..s..', '.ppp.', 'pPppp', 'ppppp', '.ppp.'],
  pebble: ['.....', '.qQq.', 'qQqqq', 'qqqqq', '.....'],
  feather: ['....w', '...wW', '..wW.', '.wW..', 'b....'],
  lily: ['w.w.w', 'wwyww', '.www.', '..g..', '.gg..'],
}

export const GIFT_COLORS = rgbPalette({
  g: '#7fa04a',
  G: '#a4c46a',
  b: '#6b4a2c',
  s: '#5a7a3a',
  p: '#6a3a6a',
  P: '#9a6a9a',
  q: '#8f8a82',
  Q: '#b8b3aa',
  w: '#f6f4ee',
  W: '#b9b6ae',
  y: '#f2d14a',
})

export const RUG_GIFT_POS = [95, 86] as const

export const SILL_SLOTS = 5

const SILL_X = 24
const SILL_STEP = 7

export function sillSlot(i: number): readonly [number, number] {
  return [SILL_X + i * SILL_STEP, 39]
}

export function drawKeepsake(
  buf: PixelBuffer,
  kind: GiftKind,
  x: number,
  y: number
): void {
  stamp(buf, GIFT_STAMPS[kind], x, y, GIFT_COLORS)
}

export function drawSill(buf: PixelBuffer, sill: readonly GiftKind[]): void {
  sill.slice(0, SILL_SLOTS).forEach((kind, i) => {
    const [x, y] = sillSlot(i)
    drawKeepsake(buf, kind, x, y)
  })
}
