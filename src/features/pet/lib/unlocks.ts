import { keptPurchases } from '@/lib/petHistory'
import {
  STARTER_ROOM_ITEMS,
  type PetPurchase,
  type PetRecord,
  type RoomItemId,
  type RoomPart,
} from '@/types/pet'

export function storedRoomItems(
  pet: Pick<PetRecord, 'earnedRoomItems'> | null
): readonly string[] {
  const stored: unknown = pet?.earnedRoomItems
  return Array.isArray(stored)
    ? stored.filter((item): item is string => typeof item === 'string')
    : []
}

export function storedPurchases(
  pet: Pick<PetRecord, 'purchases'> | null
): readonly PetPurchase[] {
  const stored: unknown = pet?.purchases
  return Array.isArray(stored) ? keptPurchases(stored) : []
}

export const roomItemsToStore = (
  stored: readonly string[],
  earned: readonly RoomItemId[]
): RoomItemId[] => earned.filter((item) => !stored.includes(item))

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

export function isRoomOptionUnlocked(
  part: RoomPart | 'window',
  option: string,
  unlocked: ReadonlySet<string>
): boolean {
  if (part === 'window' || part === 'sign') return true
  return unlocked.has(`${part}:${option}`)
}
