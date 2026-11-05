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
import {
  NO_ROUTINE_EARNINGS,
  routineCoinsOf,
  type RoutineEarned,
} from '@/lib/routine/coins'

export const COIN_SCALE = 10

export const COINS_PER_DAY = 10
export const COINS_PER_PLAN_KEPT = 10
export const COINS_PER_MILESTONE = 100

export const SHARED_MONTH_COINS = 80

export type DaysOut = {
  days: ReadonlySet<string>
  entryDays: ReadonlySet<string>
}

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

export type Earned = {
  daysOut: number

  plansKept: number

  shared: number

  milestones: readonly StreakMilestone[]

  routine: RoutineEarned
}

export const NO_EARNINGS: Earned = {
  daysOut: 0,
  plansKept: 0,
  shared: 0,
  milestones: [],
  routine: NO_ROUTINE_EARNINGS,
}

export function petEarned({
  daysOut: { days, entryDays },
  history,
  streaks,
  adoptedOn,
  today,
  paceOf,
  routine = NO_ROUTINE_EARNINGS,
}: {
  daysOut: DaysOut
  history: StreakHistory
  streaks: boolean
  adoptedOn: string
  today: string
  paceOf?: (month: string) => HeartsPace
  routine?: RoutineEarned
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
    routine,
  }
}

export const coinsOf = (earned: Earned): number =>
  earned.daysOut * COINS_PER_DAY +
  earned.plansKept * COINS_PER_PLAN_KEPT +
  earned.shared +
  earned.milestones.length * COINS_PER_MILESTONE +
  routineCoinsOf(earned.routine)

export const storedPrice = (price: number): number =>
  Math.round(price / COIN_SCALE)

export function spentOn(purchases: readonly PetPurchase[] | undefined): number {
  let spent = 0
  for (const { price } of purchases ?? []) spent += price
  return spent * COIN_SCALE
}

export const walletOf = (earned: number, spent: number): number =>
  Math.max(0, earned - spent)

export const walletGain = (before: number, after: number): number =>
  Math.max(0, after - before)
