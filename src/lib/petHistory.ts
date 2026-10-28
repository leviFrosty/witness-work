import { canonicalJson } from '@/lib/canonicalJson'
import {
  PET_KEEPSAKES_KEPT,
  PET_WAKES_KEEP_DAYS,
  PET_WAKES_KEPT,
  UNLOCK_ORDER,
  type PetKeepsake,
  type PetPurchase,
} from '@/types/pet'

/**
 * The pet record's wake, keepsake, earned room item and purchase lists, kept
 * the same way by the store, the sync merge and a restore, so every device
 * trims them alike (ADR 0030).
 */

const MS_PER_DAY = 86_400_000
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

const dayNumber = (key: string): number => Date.parse(`${key}T00:00:00Z`)

/**
 * Wake days, ascending and once each. Hearts are replayed from every wake, so a
 * wake is only dropped once the list holds more than `PET_WAKES_KEPT` and it is
 * more than `PET_WAKES_KEEP_DAYS` older than the newest wake. A wake needs a
 * pet that is asleep or died, at least ten quiet days apart, so a year holds
 * about 40 at most and the cap is only reached after years of them.
 */
export function keptWakes(wakes: readonly string[]): string[] {
  const days = [
    ...new Set(
      wakes.filter(
        (day) => DAY_KEY.test(day) && Number.isFinite(dayNumber(day))
      )
    ),
  ].sort()
  if (days.length <= PET_WAKES_KEPT) return days
  const newest = dayNumber(days[days.length - 1])
  const recentFrom = days.findIndex(
    (day) => newest - dayNumber(day) <= PET_WAKES_KEEP_DAYS * MS_PER_DAY
  )
  return days.slice(Math.min(days.length - PET_WAKES_KEPT, recentFrom))
}

/**
 * Keepsakes by gift day, ascending, one per day (the first seen wins a day),
 * the newest `PET_KEEPSAKES_KEPT`. Only the latest gift can be waiting on the
 * rug, so older keepsakes never change what the pet shows.
 */
export function keptKeepsakes(
  keepsakes: readonly PetKeepsake[]
): PetKeepsake[] {
  const byDay = new Map<string, PetKeepsake>()
  for (const keepsake of keepsakes)
    if (DAY_KEY.test(keepsake.on) && !byDay.has(keepsake.on))
      byDay.set(keepsake.on, keepsake)
  return [...byDay.values()]
    .sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0))
    .slice(-PET_KEEPSAKES_KEPT)
}

/**
 * Earned room items once each: those in `UNLOCK_ORDER` in its order, then the
 * rest (hats, secret items, and any from a newer build), sorted, so every
 * device writes the same list, whichever build it runs. Nothing is dropped: an
 * earned item never locks again.
 */
export function keptRoomItems(items: readonly string[]): string[] {
  const unique = new Set(
    items.filter((item) => typeof item === 'string' && item.length > 0)
  )
  const known = UNLOCK_ORDER.filter((item) => unique.has(item))
  const unknown = [...unique]
    .filter((item) => !(UNLOCK_ORDER as readonly string[]).includes(item))
    .sort()
  return [...known, ...unknown]
}

/** The most a purchase can say it cost; more is a damaged record. */
const MAX_PRICE = 10_000

/**
 * Which of two purchases of one item every device keeps: the earlier, then the
 * cheaper, then by everything else a newer build wrote.
 */
function comparePurchases(a: PetPurchase, b: PetPurchase): number {
  if (a.on !== b.on) return a.on < b.on ? -1 : 1
  if (a.price !== b.price) return a.price - b.price
  const left = canonicalJson(a)
  const right = canonicalJson(b)
  return left === right ? 0 : left < right ? -1 : 1
}

/**
 * Purchases once per item, the earliest kept (then the cheaper, so every device
 * keeps the same one), ordered by day then item. Unreadable ones are dropped;
 * items and fields from a newer build stay, like earned items. Their cost comes
 * off what was earned (ADR 0035), so an item is never paid for twice.
 */
export function keptPurchases(purchases: readonly unknown[]): PetPurchase[] {
  const byItem = new Map<string, PetPurchase>()
  for (const raw of purchases) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const purchase = raw as PetPurchase
    const { item, price, on } = purchase as Record<string, unknown>
    if (
      typeof item !== 'string' ||
      !item ||
      typeof price !== 'number' ||
      !Number.isInteger(price) ||
      price < 0 ||
      price > MAX_PRICE ||
      typeof on !== 'string' ||
      !DAY_KEY.test(on)
    )
      continue
    const kept = byItem.get(item)
    if (!kept || comparePurchases(purchase, kept) < 0)
      byItem.set(item, purchase)
  }
  return [...byItem.values()].sort((a, b) =>
    a.on === b.on ? (a.item < b.item ? -1 : 1) : a.on < b.on ? -1 : 1
  )
}
