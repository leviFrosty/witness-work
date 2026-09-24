import type { Theme } from '@/types/theme'

/** Five distinct theme tokens, one per buddy slot. */
export function buddyColor(theme: Theme, colorIndex: number): string {
  const palette = [
    theme.colors.info,
    theme.colors.purple,
    theme.colors.orange,
    theme.colors.pink,
    theme.colors.teal,
  ]
  return palette[colorIndex % palette.length]
}
