import type { Theme } from '@/types/theme'
import type { Buddy } from '@/features/buddies/lib/state'

export type BuddyColorSource = Pick<Buddy, 'colorIndex' | 'color'>

export function buddySlotColor(theme: Theme, colorIndex: number): string {
  const palette = [
    theme.colors.info,
    theme.colors.purple,
    theme.colors.orange,
    theme.colors.pink,
    theme.colors.teal,
  ]
  return palette[colorIndex % palette.length]
}

export function buddyColor(theme: Theme, buddy: BuddyColorSource): string {
  return buddy.color ?? buddySlotColor(theme, buddy.colorIndex)
}
