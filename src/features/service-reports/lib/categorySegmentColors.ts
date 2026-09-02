import type { Colors } from '@/types/theme'

export const getCategorySegmentColors = (colors: Colors, minimal = false) =>
  minimal
    ? [colors.accent]
    : [
        colors.accent2,
        colors.accent2Alt,
        colors.warn,
        colors.warnAlt,
        colors.accent3,
        colors.accent3Alt,
      ]
