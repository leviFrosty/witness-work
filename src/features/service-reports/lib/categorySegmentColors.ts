import type { Colors } from '@/types/theme'

export const getCategorySegmentColors = (colors: Colors, minimal = false) =>
  minimal
    ? [colors.accent]
    : [
        colors.accent2,
        colors.accent3,
        colors.warn,
        colors.purple,
        colors.orange,
        colors.info,
      ]
