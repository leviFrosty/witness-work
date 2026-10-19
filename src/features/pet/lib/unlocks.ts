import {
  STARTER_ROOM_ITEMS,
  UNLOCK_ORDER,
  type RoomItemId,
  type RoomPart,
} from '@/types/pet'

/**
 * Room items the pet has unlocked: the starters, then one item of
 * `UNLOCK_ORDER` per active month since adoption. Months, not hours, so every
 * role unlocks at the same pace (ADR 0019, ADR 0030).
 */
export function unlockedRoomItems(activeMonthCount: number): Set<RoomItemId> {
  const count = Math.max(0, Math.floor(activeMonthCount))
  return new Set([...STARTER_ROOM_ITEMS, ...UNLOCK_ORDER.slice(0, count)])
}

/**
 * Active months still needed before `item` unlocks: 0 once it has (and for
 * anything that's always free), null for an item the order doesn't know.
 */
export function nextUnlockIn(
  item: string,
  activeMonthCount: number
): number | null {
  if ((STARTER_ROOM_ITEMS as readonly string[]).includes(item)) return 0
  const index = (UNLOCK_ORDER as readonly string[]).indexOf(item)
  if (index === -1) return null
  return Math.max(0, index + 1 - Math.max(0, Math.floor(activeMonthCount)))
}

/**
 * Whether the User can pick `option` for `part`. The window and sign are always
 * free; an option the order doesn't know (from a newer build) isn't offered.
 */
export function isRoomOptionUnlocked(
  part: RoomPart | 'window',
  option: string,
  unlocked: ReadonlySet<string>
): boolean {
  if (part === 'window' || part === 'sign') return true
  return unlocked.has(`${part}:${option}`)
}
