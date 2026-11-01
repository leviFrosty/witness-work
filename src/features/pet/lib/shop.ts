import { priceOf } from '@/features/pet/lib/prices'
import type { RoomTab } from '@/features/pet/lib/roomOptions'

export const shortBy = (price: number, wallet: number): number =>
  Math.max(0, price - wallet)

export const SHOP_TABS = [
  'hat',
  'wall',
  'floor',
  'bed',
  'shelf',
  'lamp',
] as const satisfies readonly RoomTab[]
export type ShopTab = (typeof SHOP_TABS)[number]

export function tabGap(
  room: number,
  tab: number,
  minGap: number,
  count: number = SHOP_TABS.length
): number {
  const all = count * (tab + minGap) - minGap
  if (room <= 0 || all <= room) return minGap
  const whole = Math.max(1, Math.floor((room - tab / 2) / (tab + minGap)))
  return Math.max(minGap, (room - (whole + 0.5) * tab) / whole)
}

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
