/**
 * Colour math for the pixel engine.
 *
 * Colours are 24-bit numbers packed as `0xRRGGBB` ({@link Rgb}), so palettes are
 * parsed from `#rrggbb` once and hot loops never build strings. Every operation
 * rounds and clamps each channel to 0–255 the same way, so a colour derived
 * twice is always the same number.
 */

/** A 24-bit colour packed as `0xRRGGBB` (no alpha). */
export type Rgb = number

const parsed = new Map<string, Rgb>()

/** Clamps and rounds one channel to an integer 0–255. */
function channel(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

/** Packs three channels (rounded and clamped) into an {@link Rgb}. */
export function packRgb(r: number, g: number, b: number): Rgb {
  return (channel(r) << 16) | (channel(g) << 8) | channel(b)
}

/** Parses `#rrggbb` into an {@link Rgb}. Results are memoized. */
export function rgb(hex: string): Rgb {
  const cached = parsed.get(hex)
  if (cached !== undefined) return cached
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`pixelArt: not a #rrggbb colour: ${hex}`)
  }
  const value = parseInt(hex.slice(1), 16)
  parsed.set(hex, value)
  return value
}

/** Red channel 0–255. */
export const red = (c: Rgb): number => (c >> 16) & 255
/** Green channel 0–255. */
export const green = (c: Rgb): number => (c >> 8) & 255
/** Blue channel 0–255. */
export const blue = (c: Rgb): number => c & 255

/** `[r, g, b]` channels of a colour. */
export function rgbTuple(c: Rgb): [number, number, number] {
  return [red(c), green(c), blue(c)]
}

/** `#rrggbb` for a colour. */
export function toHex(c: Rgb): string {
  return `#${c.toString(16).padStart(6, '0')}`
}

/** Linear blend from `a` (t = 0) to `b` (t = 1). */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const ar = red(a)
  const ag = green(a)
  const ab = blue(a)
  return packRgb(
    ar + (red(b) - ar) * t,
    ag + (green(b) - ag) * t,
    ab + (blue(b) - ab) * t
  )
}

/** Scales every channel by `f` (f < 1 darkens). */
export function dim(c: Rgb, f: number): Rgb {
  return packRgb(red(c) * f, green(c) * f, blue(c) * f)
}

/**
 * A cool shadow of `c`: darker by `f`, with green pulled down and blue lifted,
 * so outlines and shading read as shadow rather than plain black.
 */
export function shadeOf(c: Rgb, f: number): Rgb {
  return packRgb(red(c) * f, green(c) * f * 0.92, blue(c) * f * 1.05 + 10)
}

/**
 * Moves `c` toward a slightly cool grey of the same lightness. `t = 1` is fully
 * grey; the default 0.88 keeps a hint of the original hue.
 */
export function greyOf(c: Rgb, t = 0.88): Rgb {
  const r = red(c)
  const g = green(c)
  const b = blue(c)
  const l = 0.3 * r + 0.59 * g + 0.11 * b
  return packRgb(
    r + (l * 0.93 - r) * t,
    g + (l * 0.97 - g) * t,
    b + (l * 1.08 - b) * t
  )
}

/** Parses every `#rrggbb` value of a palette once. */
export function rgbPalette<K extends string>(
  hexes: Readonly<Record<K, string>>
): Readonly<Record<K, Rgb>> {
  const out = {} as Record<K, Rgb>
  for (const key of Object.keys(hexes) as K[]) out[key] = rgb(hexes[key])
  return out
}
