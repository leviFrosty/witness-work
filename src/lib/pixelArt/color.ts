export type Rgb = number

const parsed = new Map<string, Rgb>()

function channel(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

export function packRgb(r: number, g: number, b: number): Rgb {
  return (channel(r) << 16) | (channel(g) << 8) | channel(b)
}

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

export const red = (c: Rgb): number => (c >> 16) & 255

export const green = (c: Rgb): number => (c >> 8) & 255

export const blue = (c: Rgb): number => c & 255

export function rgbTuple(c: Rgb): [number, number, number] {
  return [red(c), green(c), blue(c)]
}

export function toHex(c: Rgb): string {
  return `#${c.toString(16).padStart(6, '0')}`
}

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

export function dim(c: Rgb, f: number): Rgb {
  return packRgb(red(c) * f, green(c) * f, blue(c) * f)
}

export function shadeOf(c: Rgb, f: number): Rgb {
  return packRgb(red(c) * f, green(c) * f * 0.92, blue(c) * f * 1.05 + 10)
}

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

export function rgbPalette<K extends string>(
  hexes: Readonly<Record<K, string>>
): Readonly<Record<K, Rgb>> {
  const out = {} as Record<K, Rgb>
  for (const key of Object.keys(hexes) as K[]) out[key] = rgb(hexes[key])
  return out
}
