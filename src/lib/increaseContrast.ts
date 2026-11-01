import type { Colors } from '@/constants/theme'
import { mix } from '@/lib/color'

export function increaseContrast(colors: Colors): Colors {
  return {
    ...colors,
    textAlt: mix(colors.textAlt, colors.text, 0.5),
    border: mix(colors.border, colors.textAlt, 0.4),
  }
}
