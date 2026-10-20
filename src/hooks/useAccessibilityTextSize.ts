import { useWindowDimensions } from 'react-native'

/**
 * The system text scale where iOS's accessibility sizes start (AX M is about
 * 1.79x). Android's two largest font sizes (1.8x, 2x) reach it too.
 */
const ACCESSIBILITY_FONT_SCALE = 1.75

/**
 * Whether the system text size is an accessibility size. Side-by-side short
 * labels and big figures (equal-width buttons, stat columns) stack or shrink to
 * fit there, so a word never has to break mid-way.
 */
export default function useAccessibilityTextSize() {
  return useWindowDimensions().fontScale >= ACCESSIBILITY_FONT_SCALE
}

/**
 * Text props that shrink a short label or figure in a fixed-width spot onto one
 * line.
 */
export const FIT_ONE_LINE = {
  numberOfLines: 1,
  adjustsFontSizeToFit: true,
  minimumFontScale: 0.3,
} as const
