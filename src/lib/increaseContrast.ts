import type { Colors } from '@/constants/theme'
import { mix } from '@/lib/color'

/**
 * The palette for iOS Increase Contrast: secondary text moves halfway to the
 * primary text color, and hairline borders toward the secondary text, so both
 * stand out further from the surfaces they sit on. The app's colors are fixed
 * hex values, which the system can't adjust itself.
 */
export function increaseContrast(colors: Colors): Colors {
  return {
    ...colors,
    textAlt: mix(colors.textAlt, colors.text, 0.5),
    border: mix(colors.border, colors.textAlt, 0.4),
  }
}
