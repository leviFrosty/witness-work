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

export const mix = (hex: string, target: string, ratio: number): string => {
  const [r1, g1, b1] = parseHex(hex)
  const [r2, g2, b2] = parseHex(target)
  return toHex(
    r1 * (1 - ratio) + r2 * ratio,
    g1 * (1 - ratio) + g2 * ratio,
    b1 * (1 - ratio) + b2 * ratio
  )
}

export const withAlpha = (hex: string, alpha: number): string => {
  const h = hex.replace('#', '').padEnd(6, '0').slice(0, 6).toUpperCase()
  const a = clamp(alpha).toString(16).padStart(2, '0').toUpperCase()
  return `#${h}${a}`
}

export const relativeLuminance = (hex: string): number => {
  const [r, g, b] = parseHex(hex)
  const channel = (n: number) => {
    const c = n / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export const contrastRatio = (foreground: string, background: string) => {
  const h = foreground.replace('#', '')
  const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
  const shown = alpha < 1 ? mix(background, foreground, alpha) : foreground
  const a = relativeLuminance(shown)
  const b = relativeLuminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

export const getReadableTextColor = (
  background: string,
  {
    light = '#FFFFFF',
    dark = '#141414',
  }: { light?: string; dark?: string } = {}
): string => (relativeLuminance(background) > 0.45 ? dark : light)
