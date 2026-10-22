import { mix, relativeLuminance } from '@/lib/color'
import type { Theme } from '@/constants/theme'

type Rgb = [number, number, number]

const rgb = (hex: string): Rgb => {
  const h = hex.replace('#', '').slice(0, 6)
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb
}

const toHsl = ([r, g, b]: Rgb): Rgb => {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h =
    max === r
      ? (g - b) / d + (g < b ? 6 : 0)
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4
  return [h / 6, s, l]
}

const fromHsl = ([h, s, l]: Rgb): Rgb => {
  if (s === 0) return [l, l, l]
  const channel = (p: number, q: number, t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    if (u < 1 / 6) return p + (q - p) * 6 * u
    if (u < 1 / 2) return q
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [channel(p, q, h + 1 / 3), channel(p, q, h), channel(p, q, h - 1 / 3)]
}

/** Dark backgrounds get the brighter palette and a stronger glow. */
export const isDarkTheme = (theme: Theme) =>
  relativeLuminance(theme.colors.background) < 0.2

export interface OrbPalette {
  /** Accent. */
  a: Rgb
  /** A second hue about 30° along the wheel (teal for the default green). */
  b: Rgb
  /** Deep shade inside the sphere. */
  c: Rgb
  /** Highlight. */
  d: Rgb
}

/**
 * The orb's colors, all derived from the theme accent so a Supporter's custom
 * accent recolors it too.
 */
export const orbPalette = (theme: Theme): OrbPalette => {
  const accent = theme.colors.accent
  const dark = isDarkTheme(theme)
  const [h, s, l] = toHsl(rgb(accent))
  return {
    a: rgb(accent),
    b: fromHsl([(h + 31 / 360) % 1, s, dark ? l : l * 0.92]),
    c: rgb(mix(accent, '#000000', dark ? 0.8 : 0.58)),
    d: rgb(mix(accent, '#FFFFFF', dark ? 0.84 : 0.93)),
  }
}
