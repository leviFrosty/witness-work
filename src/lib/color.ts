const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))

const parseHex = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h.slice(0, 6)
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

const toHex = (r: number, g: number, b: number) =>
  '#' +
  [r, g, b]
    .map((n) => clamp(n).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()

/**
 * Linearly mix two hex colors in RGB space. `ratio` of 0 returns `hex`, 1
 * returns `target`. Values in between interpolate. Used to derive lighter
 * ("alt") or darker shades from a custom accent.
 */
export const mix = (hex: string, target: string, ratio: number): string => {
  const [r1, g1, b1] = parseHex(hex)
  const [r2, g2, b2] = parseHex(target)
  return toHex(
    r1 * (1 - ratio) + r2 * ratio,
    g1 * (1 - ratio) + g2 * ratio,
    b1 * (1 - ratio) + b2 * ratio
  )
}

/**
 * Append an 8-bit alpha channel to a 6-char hex color. Matches the `#RRGGBBAA`
 * form used by the existing translucent palette entries.
 */
export const withAlpha = (hex: string, alpha: number): string => {
  const h = hex.replace('#', '').padEnd(6, '0').slice(0, 6).toUpperCase()
  const a = clamp(alpha).toString(16).padStart(2, '0').toUpperCase()
  return `#${h}${a}`
}
