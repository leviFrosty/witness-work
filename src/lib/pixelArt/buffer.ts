/**
 * RGBA pixel buffers and whole-buffer transforms.
 *
 * A buffer is row-major, origin top-left, x to the right and y down, 4 bytes
 * per pixel. Pixels are either fully opaque (alpha 255) or empty (alpha 0);
 * {@link blit} skips empty pixels, which is how sprites get transparency.
 */
import type { Rgb } from './color'

/** A row-major RGBA image. `data.length === width * height * 4`. */
export interface PixelBuffer {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
}

/** A rectangle `[x, y, width, height]` in buffer pixels. */
export type Viewport = readonly [x: number, y: number, w: number, h: number]

/** A fully transparent buffer. */
export function createBuffer(width: number, height: number): PixelBuffer {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) }
}

/** An independent copy of `src`. */
export function cloneBuffer(src: PixelBuffer): PixelBuffer {
  return {
    width: src.width,
    height: src.height,
    data: new Uint8ClampedArray(src.data),
  }
}

/** Copies every byte of `src` into `dst`. Both must be the same size. */
export function copyInto(dst: PixelBuffer, src: PixelBuffer): void {
  if (dst.width !== src.width || dst.height !== src.height) {
    throw new Error('pixelArt: copyInto size mismatch')
  }
  dst.data.set(src.data)
}

/** Byte offset of (x, y) rounded to the nearest pixel, or -1 out of bounds. */
function offsetOf(buf: PixelBuffer, px: number, py: number): number {
  const x = Math.round(px)
  const y = Math.round(py)
  if (x < 0 || y < 0 || x >= buf.width || y >= buf.height) return -1
  return (y * buf.width + x) * 4
}

/**
 * Whether the pixel at (x, y) (rounded) is opaque. Out-of-bounds reads are
 * empty.
 */
export function isOpaque(buf: PixelBuffer, x: number, y: number): boolean {
  const k = offsetOf(buf, x, y)
  return k >= 0 && buf.data[k + 3] !== 0
}

/** The colour at (x, y) (rounded), or `null` when empty or out of bounds. */
export function pixelAt(buf: PixelBuffer, x: number, y: number): Rgb | null {
  const k = offsetOf(buf, x, y)
  const d = buf.data
  if (k < 0 || d[k + 3] === 0) return null
  return (d[k] << 16) | (d[k + 1] << 8) | d[k + 2]
}

/**
 * Per-pixel colour map for {@link blit}/{@link mapColors}: receives the source
 * colour and the pixel's position in the source buffer, returns the colour to
 * write or `null` to skip it.
 */
export type ColorMap = (c: Rgb, x: number, y: number) => Rgb | null

/**
 * Draws the opaque pixels of `src` onto `dst` with `src`'s top-left at (ox,
 * oy). Pixels that land outside `dst` are dropped.
 */
export function blit(
  dst: PixelBuffer,
  src: PixelBuffer,
  ox: number,
  oy: number,
  map?: ColorMap
): void {
  const sd = src.data
  const dd = dst.data
  const W = dst.width
  const H = dst.height
  for (let y = 0; y < src.height; y++) {
    const Y = y + oy
    if (Y < 0 || Y >= H) continue
    for (let x = 0; x < src.width; x++) {
      const X = x + ox
      if (X < 0 || X >= W) continue
      const s = (y * src.width + x) * 4
      if (sd[s + 3] === 0) continue
      const k = (Y * W + X) * 4
      if (map) {
        const c = map((sd[s] << 16) | (sd[s + 1] << 8) | sd[s + 2], x, y)
        if (c === null) continue
        dd[k] = (c >> 16) & 255
        dd[k + 1] = (c >> 8) & 255
        dd[k + 2] = c & 255
      } else {
        dd[k] = sd[s]
        dd[k + 1] = sd[s + 1]
        dd[k + 2] = sd[s + 2]
      }
      dd[k + 3] = 255
    }
  }
}

/** A copy of `src` with every opaque pixel passed through `map`. */
export function mapColors(src: PixelBuffer, map: ColorMap): PixelBuffer {
  const out = createBuffer(src.width, src.height)
  blit(out, src, 0, 0, map)
  return out
}

/** A copy of `src` mirrored left to right. */
export function flipH(src: PixelBuffer): PixelBuffer {
  const out = createBuffer(src.width, src.height)
  const W = src.width
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < W; x++) {
      const s = (y * W + (W - 1 - x)) * 4
      const k = (y * W + x) * 4
      out.data[k] = src.data[s]
      out.data[k + 1] = src.data[s + 1]
      out.data[k + 2] = src.data[s + 2]
      out.data[k + 3] = src.data[s + 3]
    }
  }
  return out
}

/**
 * Squashes a standing sprite into a lying-down one: 62% of the height and 114%
 * of the width, pinned to the second-to-last row (the feet line) and centred
 * horizontally. Nearest-neighbour, so the palette is preserved.
 */
export function lieDown(src: PixelBuffer): PixelBuffer {
  const W = src.width
  const H = src.height
  const out = createBuffer(W, H)
  const sy = 0.62
  const sx = 1.14
  const cx = (W - 1) / 2
  for (let y = 0; y < H; y++) {
    const yy = Math.round(H - 2 - (H - 2 - y) / sy)
    if (yy < 0 || yy >= H) continue
    for (let x = 0; x < W; x++) {
      const xx = Math.round(cx + (x - cx) / sx)
      if (xx < 0 || xx >= W) continue
      const s = (yy * W + xx) * 4
      const k = (y * W + x) * 4
      out.data[k] = src.data[s]
      out.data[k + 1] = src.data[s + 1]
      out.data[k + 2] = src.data[s + 2]
      out.data[k + 3] = src.data[s + 3]
    }
  }
  return out
}

/**
 * A copy of the `view` rectangle of `src`. Parts of the view outside `src` come
 * back transparent.
 */
export function crop(src: PixelBuffer, view: Viewport): PixelBuffer {
  const [vx, vy, vw, vh] = view
  const out = createBuffer(vw, vh)
  for (let y = 0; y < vh; y++) {
    const Y = y + vy
    if (Y < 0 || Y >= src.height) continue
    for (let x = 0; x < vw; x++) {
      const X = x + vx
      if (X < 0 || X >= src.width) continue
      const s = (Y * src.width + X) * 4
      const k = (y * vw + x) * 4
      out.data[k] = src.data[s]
      out.data[k + 1] = src.data[s + 1]
      out.data[k + 2] = src.data[s + 2]
      out.data[k + 3] = src.data[s + 3]
    }
  }
  return out
}

/**
 * Nearest-neighbour upscale by an integer factor (for previews, PNG export and
 * tests; the app scales on the GPU instead).
 */
export function scaleNearest(src: PixelBuffer, factor: number): PixelBuffer {
  const f = Math.max(1, Math.floor(factor))
  const out = createBuffer(src.width * f, src.height * f)
  for (let y = 0; y < out.height; y++) {
    const sy = Math.floor(y / f)
    for (let x = 0; x < out.width; x++) {
      const s = (sy * src.width + Math.floor(x / f)) * 4
      const k = (y * out.width + x) * 4
      out.data[k] = src.data[s]
      out.data[k + 1] = src.data[s + 1]
      out.data[k + 2] = src.data[s + 2]
      out.data[k + 3] = src.data[s + 3]
    }
  }
  return out
}

/**
 * The smallest viewport holding every opaque pixel of `buf`, or null when it
 * has none.
 */
export function opaqueBounds(buf: PixelBuffer): Viewport | null {
  let x0 = buf.width
  let y0 = buf.height
  let x1 = -1
  let y1 = -1
  const d = buf.data
  for (let y = 0; y < buf.height; y++)
    for (let x = 0; x < buf.width; x++) {
      if (d[(y * buf.width + x) * 4 + 3] === 0) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1]
}

/** Fills every pixel (opaque) with `c`. */
export function fillBuffer(buf: PixelBuffer, c: Rgb): void {
  const r = (c >> 16) & 255
  const g = (c >> 8) & 255
  const b = c & 255
  const d = buf.data
  for (let k = 0; k < d.length; k += 4) {
    d[k] = r
    d[k + 1] = g
    d[k + 2] = b
    d[k + 3] = 255
  }
}

/** FNV-1a 32-bit hash of the buffer's size and bytes (for tests and cache keys). */
export function hashBuffer(buf: PixelBuffer): number {
  let h = 0x811c9dc5
  const mixIn = (v: number) => {
    h ^= v & 255
    h = Math.imul(h, 0x01000193)
  }
  mixIn(buf.width)
  mixIn(buf.width >> 8)
  mixIn(buf.height)
  mixIn(buf.height >> 8)
  const d = buf.data
  for (let i = 0; i < d.length; i++) {
    h ^= d[i]
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
