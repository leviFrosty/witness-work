import { keptPurchases } from '@/lib/petHistory'
import {
  STARTER_ROOM_ITEMS,
  type PetPurchase,
  type PetRecord,
  type RoomItemId,
  type RoomPart,
} from '@/types/pet'

/**
 * Which room items and hats the User owns (`docs/pet-companion.md`): the
 * starters, the ones bought in the Shop with coins (ADR 0035), secret items
 * once found, and anything earned under the old streak and months rules, which
 * stays (`earnedRoomItems`). An owned item never locks again.
 */

/**
 * The items the pet has stored as earned (found secrets, and items opened up
 * before the Shop); none for a pet from before they were stored, or a damaged
 * list.
 */
export function storedRoomItems(
  pet: Pick<PetRecord, 'earnedRoomItems'> | null
): readonly string[] {
  const stored: unknown = pet?.earnedRoomItems
  return Array.isArray(stored)
    ? stored.filter((item): item is string => typeof item === 'string')
    : []
}

/**
 * The pet's Shop purchases, each item once; none before the first, and none
 * that can't be read (a damaged one never costs anything).
 */
export function storedPurchases(
  pet: Pick<PetRecord, 'purchases'> | null
): readonly PetPurchase[] {
  const stored: unknown = pet?.purchases
  return Array.isArray(stored) ? keptPurchases(stored) : []
}

/** Items earned now that the pet hasn't stored yet. */
export const roomItemsToStore = (
  stored: readonly string[],
  earned: readonly RoomItemId[]
): RoomItemId[] => earned.filter((item) => !stored.includes(item))

/**
 * Room items the User can pick: the starters, the stored ones, the bought ones,
 * and any earned now.
 */
export function unlockedRoomItems(
  stored: readonly string[],
  earned: readonly RoomItemId[],
  purchases: readonly PetPurchase[] = []
): Set<string> {
  return new Set([
    ...STARTER_ROOM_ITEMS,
    ...stored,
    ...purchases.map((purchase) => purchase.item),
    ...earned,
  ])
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
