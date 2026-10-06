import type { Theme } from '@/types/theme'
import type { Buddy } from '@/features/buddies/lib/state'

/** What decides a buddy's color: their slot, unless this User picked one. */
export type BuddyColorSource = Pick<Buddy, 'colorIndex' | 'color'>

/** Five distinct theme tokens, one per buddy slot. */
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

/** The color a buddy's avatar, days, and dots use. */
export function buddyColor(theme: Theme, buddy: BuddyColorSource): string {
  return buddy.color ?? buddySlotColor(theme, buddy.colorIndex)
}
