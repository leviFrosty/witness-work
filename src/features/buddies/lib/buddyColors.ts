import type { TranslationKey } from '@/lib/locales'
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

/** Names for each palette slot, in `buddyColor` order. */
export const BUDDY_COLOR_NAMES: TranslationKey[] = [
  'buddies_colorBlue',
  'buddies_colorPurple',
  'buddies_colorOrange',
  'buddies_colorPink',
  'buddies_colorTeal',
]
