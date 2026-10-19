import {
  PET_KEEPSAKES_KEPT,
  PET_WAKES_KEEP_DAYS,
  PET_WAKES_KEPT,
  type PetKeepsake,
} from '@/types/pet'

/**
 * The pet record's wake and keepsake lists, kept the same way by the store, the
 * sync merge and a restore, so every device trims them alike (ADR 0030).
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
