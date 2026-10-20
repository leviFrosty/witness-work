/**
 * Keepsakes ("gifts") the pet leaves on the rug: 5 × 5 stamps. One sits on the
 * rug at {@link RUG_GIFT_POS}; collected ones line the window sill.
 */
import { rgbPalette, stamp, type PixelBuffer } from '@/lib/pixelArt'
import { GIFT_KINDS, isGiftKind, type GiftKind } from '@/types/pet'

/** Keepsake kinds, in the order gifts cycle through. */
export { GIFT_KINDS, isGiftKind }
export type { GiftKind }

/** The 5 × 5 pattern of each keepsake. */
export const GIFT_STAMPS: Readonly<Record<GiftKind, readonly string[]>> = {
  olive: ['...g.', '..gGg', '.gb..', 'gg...', 'b....'],
  fig: ['..s..', '.ppp.', 'pPppp', 'ppppp', '.ppp.'],
  pebble: ['.....', '.qQq.', 'qQqqq', 'qqqqq', '.....'],
  feather: ['....w', '...wW', '..wW.', '.wW..', 'b....'],
  lily: ['w.w.w', 'wwyww', '.www.', '..g..', '.gg..'],
}

/** Colours shared by every keepsake stamp. */
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

/** Top-left of the gift waiting on the rug (scene pixels). */
export const RUG_GIFT_POS = [95, 86] as const

/** How many keepsakes fit on the window sill. */
export const SILL_SLOTS = 5

/** Left edge of the first sill slot and the step between slots. */
const SILL_X = 24
const SILL_STEP = 7

/**
 * Top-left of sill slot `i` (scene pixels). The five 5 × 5 keepsakes sit at x
 * 24–56: inside the Home card's view (from x 22) and clear of the window's
 * cross bar (x 36–37).
 */
export function sillSlot(i: number): readonly [number, number] {
  return [SILL_X + i * SILL_STEP, 39]
}

/** Draws keepsake `kind` with its top-left at (x, y). */
export function drawKeepsake(
  buf: PixelBuffer,
  kind: GiftKind,
  x: number,
  y: number
): void {
  stamp(buf, GIFT_STAMPS[kind], x, y, GIFT_COLORS)
}

/** Draws up to {@link SILL_SLOTS} keepsakes on the sill, oldest first. */
export function drawSill(buf: PixelBuffer, sill: readonly GiftKind[]): void {
  sill.slice(0, SILL_SLOTS).forEach((kind, i) => {
    const [x, y] = sillSlot(i)
    drawKeepsake(buf, kind, x, y)
  })
}
