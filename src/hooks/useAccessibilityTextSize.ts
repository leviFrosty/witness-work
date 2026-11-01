import { useWindowDimensions } from 'react-native'

const ACCESSIBILITY_FONT_SCALE = 1.75

export default function useAccessibilityTextSize() {
  return useWindowDimensions().fontScale >= ACCESSIBILITY_FONT_SCALE
}

export const FIT_ONE_LINE = {
  numberOfLines: 1,
  adjustsFontSizeToFit: true,
  minimumFontScale: 0.3,
} as const
