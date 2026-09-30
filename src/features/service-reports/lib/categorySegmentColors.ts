import type { Colors } from '@/types/theme'

// Saturated, mid-tone hues only: segments sit on the `background` track, so
// pale tints (e.g. `accent2Alt`, `warnAlt`) read as unfilled in light mode and
// deep ones (`accent3Alt`) vanish in dark mode. Ordered so neighbors differ.
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
