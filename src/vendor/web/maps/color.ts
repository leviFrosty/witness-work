/** The red of a default map pin. */
export const DEFAULT_PIN_COLOR = '#ff3b30'

const hex = (value: number) =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0')

/**
 * `#rrggbb` for a theme color (`#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()` or
 * `rgba()`), the only color form the maps frame takes; `fallback` for anything
 * else.
 */
export function toHexColor(color: unknown, fallback = DEFAULT_PIN_COLOR) {
  if (typeof color !== 'string') return fallback
  const value = color.trim().toLowerCase()
  let match = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/.exec(value)
  if (match)
    return `#${match[1]!.repeat(2)}${match[2]!.repeat(2)}${match[3]!.repeat(2)}`
  match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(value)
  if (match) return `#${match[1]}`
  match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(value)
  if (match) return `#${hex(+match[1]!)}${hex(+match[2]!)}${hex(+match[3]!)}`
  return fallback
}
