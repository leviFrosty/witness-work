/**
 * Pixel masks: one flag per pixel of a buffer, e.g. which pixels a sprite
 * covers, so a later pass (lighting) can treat them differently.
 */
import type { PixelBuffer } from './buffer'

/** A row-major flag per pixel (0 or 1). */
export interface PixelMask {
  readonly width: number
  readonly height: number
  readonly data: Uint8Array
}

/** A mask with every flag cleared. */
export function createMask(width: number, height: number): PixelMask {
  return { width, height, data: new Uint8Array(width * height) }
}

/**
 * Sets (or with `on` false, clears) the flags under the opaque pixels of `src`
 * placed with its top-left at (ox, oy), as {@link blit} would draw them.
 */
export function maskOpaque(
  mask: PixelMask,
  src: PixelBuffer,
  ox: number,
  oy: number,
  on = true
): void {
  const sd = src.data
  const md = mask.data
  const flag = on ? 1 : 0
  for (let y = 0; y < src.height; y++) {
    const Y = y + oy
    if (Y < 0 || Y >= mask.height) continue
    for (let x = 0; x < src.width; x++) {
      const X = x + ox
      if (X < 0 || X >= mask.width) continue
      if (sd[(y * src.width + x) * 4 + 3] !== 0) md[Y * mask.width + X] = flag
    }
  }
}
