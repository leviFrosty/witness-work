import { isCountableEntry } from '@/lib/serviceReport'
import type { StreakHistory, StreakMilestone } from '@/lib/serviceStreak'
import type { PetPurchase } from '@/types/pet'
import type { PetActivityRecords } from '@/features/pet/lib/activity'
import {
  localDayKey,
  monthOfDayKey,
  recordDayKey,
} from '@/features/pet/lib/dayKeys'
import type { HeartsPace } from '@/features/pet/lib/life'

/**
 * Coins, the one currency the Shop takes (ADR 0035). Like hearts, they're
 * replayed from synced records since the adoption day and never stored; only
 * purchases are.
 */

/**
 * What coins pay for, kept simple enough to say in a line each:
 *
 * - Each day out: `COINS_PER_DAY`.
 * - Each planned day kept (time logged on a day with a Plan): one more.
 * - Each Service Streak milestone (`isStreakMilestone`): `COINS_PER_MILESTONE`,
 *   only while streaks show.
 */
export const COINS_PER_DAY = 1
export const COINS_PER_PLAN_KEPT = 1
export const COINS_PER_MILESTONE = 10
/**
 * What a month with a Time Entry earns at least for its days out, at the
 * `monthly` hearts pace (a role that reports only whether it shared, ADR 0031):
 * about what a User out each week with a Plan earns.
 */
export const SHARED_MONTH_COINS = 8

/** Days out, and which of them have a Time Entry. */
export type DaysOut = {
  days: ReadonlySet<string>
  entryDays: ReadonlySet<string>
}

/**
 * The User's days out: local days with a Time Entry (a 0-minute checkbox entry
 * counts, a Time Rollover doesn't) or a Visit they logged (not one that came
 * with a shared Contact). Plans don't count: they're forecast, not service (ADR
 * 0003).
 */
export function petDaysOut({
  serviceReports,
  visits,
}: Pick<PetActivityRecords, 'serviceReports' | 'visits'>): DaysOut {
  const entryDays = new Set<string>()
  for (const year of Object.values(serviceReports))
    for (const month of Object.values(year))
      for (const entry of month)
        if (isCountableEntry(entry)) entryDays.add(recordDayKey(entry.date))
  const days = new Set(entryDays)
  for (const visit of visits) {
    if (visit.receivedAt !== undefined) continue
    const key = localDayKey(visit.date)
    if (key !== 'Invalid date') days.add(key)
  }
  return { days, entryDays }
}

/**
 * What the pet has earned since adoption, by what earned it, so a save can say
 * where its coins came from ("+1 Time added", "+1 Planned day kept").
 */
export type Earned = {
  /** Days out: `COINS_PER_DAY` each. */
  daysOut: number
  /** Planned days kept: `COINS_PER_PLAN_KEPT` each. */
  plansKept: number
  /** What lifted `monthly`-pace months to `SHARED_MONTH_COINS`. */
  shared: number
  /** Streak milestones reached: `COINS_PER_MILESTONE` each. */
  milestones: readonly StreakMilestone[]
}

export const NO_EARNINGS: Earned = {
  daysOut: 0,
  plansKept: 0,
  shared: 0,
  milestones: [],
}

/**
 * Everything earned from the adoption day through `today`: each day out, each
 * planned day kept (`history.kept`), and, with `streaks` shown, each milestone
 * a streak reached (`history.milestones`). A `monthly`-pace month (`paceOf`)
 * with a Time Entry pays its days out at least `SHARED_MONTH_COINS`, so one
 * "shared" check a month earns about what a day out each week does. Like the
 * hearts, the adoption month counts a check made before the adoption day: it
 * can't be made twice.
 */
export function petEarned({
  daysOut: { days, entryDays },
  history,
  streaks,
  adoptedOn,
  today,
  paceOf,
}: {
  daysOut: DaysOut
  history: StreakHistory
  streaks: boolean
  adoptedOn: string
  today: string
  paceOf?: (month: string) => HeartsPace
}): Earned {
  const since = (day: string) => day >= adoptedOn && day <= today
  const months = new Map<string, number>()
  let daysOut = 0
  for (const day of days) {
    if (!since(day)) continue
    daysOut++
    const month = monthOfDayKey(day)
    months.set(month, (months.get(month) ?? 0) + 1)
  }
  const firstMonth = monthOfDayKey(adoptedOn)
  const shared = new Map<string, number>()
  for (const day of entryDays) {
    const month = monthOfDayKey(day)
    if (month < firstMonth || day > today || paceOf?.(month) !== 'monthly')
      continue
    const paid = (months.get(month) ?? 0) * COINS_PER_DAY
    shared.set(month, Math.max(0, SHARED_MONTH_COINS - paid))
  }
  let lifted = 0
  for (const amount of shared.values()) lifted += amount
  return {
    daysOut,
    plansKept: history.kept.filter(since).length,
    shared: lifted,
    milestones: streaks ? history.milestones.filter(({ on }) => since(on)) : [],
  }
}

/** The coins in `earned`. */
export const coinsOf = (earned: Earned): number =>
  earned.daysOut * COINS_PER_DAY +
  earned.plansKept * COINS_PER_PLAN_KEPT +
  earned.shared +
  earned.milestones.length * COINS_PER_MILESTONE

/** What `purchases` cost. */
export function spentOn(purchases: readonly PetPurchase[] | undefined): number {
  let spent = 0
  for (const { price } of purchases ?? []) spent += price
  return spent
}

/**
 * The coins left to spend: earned minus spent. Purchases two devices made
 * offline can overspend; then it's 0 until earnings catch up.
 */
export const walletOf = (earned: number, spent: number): number =>
  Math.max(0, earned - spent)

/** How many coins went up from `before` to `after`; 0 if none. */
export const walletGain = (before: number, after: number): number =>
  Math.max(0, after - before)
