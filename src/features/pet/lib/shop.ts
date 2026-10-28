import { priceOf } from '@/features/pet/lib/prices'
import type { RoomTab } from '@/features/pet/lib/roomOptions'

/** How many more coins `price` needs than `wallet` holds; 0 if none. */
export const shortBy = (price: number, wallet: number): number =>
  Math.max(0, price - wallet)

/** The Shop's categories: every Decorate Room tab with something to buy. */
export const SHOP_TABS = [
  'hat',
  'wall',
  'floor',
  'bed',
  'shelf',
  'lamp',
] as const satisfies readonly RoomTab[]
export type ShopTab = (typeof SHOP_TABS)[number]

/**
 * The gap between tabs in a row `room` points wide: the least gap when they all
 * fit, else wide enough that the last one in view is cut about in half, a peek
 * that says the row scrolls, at any width.
 */
export function tabGap(room: number, tab: number, minGap: number): number {
  const all = SHOP_TABS.length * (tab + minGap) - minGap
  if (room <= 0 || all <= room) return minGap
  const whole = Math.max(1, Math.floor((room - tab / 2) / (tab + minGap)))
  return Math.max(minGap, (room - (whole + 0.5) * tab) / whole)
}

/**
 * How an item shows in the Shop:
 *
 * - `current`: owned and in the room (or worn) now.
 * - `owned`: owned, not in the room.
 * - `forSale`: sold, and the wallet covers it.
 * - `short`: sold, and the wallet doesn't cover it yet.
 * - `secret`: a secret not found yet; never sold.
 */
export type ShopItemState = 'current' | 'owned' | 'forSale' | 'short' | 'secret'

export function shopItemState({
  item,
  owned,
  current,
  wallet,
}: {
  item: string
  owned: boolean
  current: boolean
  wallet: number
}): ShopItemState {
  if (owned) return current ? 'current' : 'owned'
  const price = priceOf(item)
  if (price === null) return 'secret'
  return shortBy(price, wallet) > 0 ? 'short' : 'forSale'
}
