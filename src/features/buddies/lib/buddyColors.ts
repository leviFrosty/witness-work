import type { Theme } from '@/types/theme'
import type { Buddy } from '@/features/buddies/lib/state'

export type BuddyColorSource = Pick<Buddy, 'colorIndex' | 'color'>

const slotPalette = (theme: Theme) => [
  theme.colors.info,
  theme.colors.purple,
  theme.colors.orange,
  theme.colors.pink,
  theme.colors.teal,
]

export const BUDDY_SLOT_COLOR_COUNT = 5

export function buddySlotColor(theme: Theme, colorIndex: number): string {
  return slotPalette(theme)[colorIndex % BUDDY_SLOT_COLOR_COUNT]
}

export function nextBuddyColorIndex(used: ReadonlySet<number>): number {
  const uses = Array.from({ length: BUDDY_SLOT_COLOR_COUNT }, () => 0)
  for (const index of used) uses[index % BUDDY_SLOT_COLOR_COUNT]++
  const slot = uses.indexOf(Math.min(...uses))
  let index = slot
  while (used.has(index)) index += BUDDY_SLOT_COLOR_COUNT
  return index
}

export function buddyColor(theme: Theme, buddy: BuddyColorSource): string {
  return buddy.color ?? buddySlotColor(theme, buddy.colorIndex)
}
