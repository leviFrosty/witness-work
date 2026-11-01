import type { PixelBuffer } from './buffer'

export interface PixelMask {
  readonly width: number
  readonly height: number
  readonly data: Uint8Array
}

export function createMask(width: number, height: number): PixelMask {
  return { width, height, data: new Uint8Array(width * height) }
}

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
