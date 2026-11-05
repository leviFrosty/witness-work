import {
  ROUTINE_HABITS,
  type ReadingPlanRun,
  type RoutineEntry,
  type RoutineHabit,
} from '@/types/routine'

export const ROUTINE_COINS: Readonly<Record<RoutineHabit, number>> = {
  bibleReading: 4,
  personalStudy: 4,
  midweekPrep: 5,
  weekendPrep: 5,
  worship: 5,
}

export const PLAN_FINISHED_COINS = 500

export type RoutineEarned = {
  habits: Readonly<Record<RoutineHabit, number>>

  plansFinished: number
}

const NO_HABITS = Object.fromEntries(
  ROUTINE_HABITS.map((habit) => [habit, 0])
) as Record<RoutineHabit, number>

export const NO_ROUTINE_EARNINGS: RoutineEarned = {
  habits: NO_HABITS,
  plansFinished: 0,
}

export function routineEarned({
  entries,
  plans,
  adoptedOn,
  today,
}: {
  entries: readonly RoutineEntry[]
  plans: readonly ReadingPlanRun[]
  adoptedOn: string
  today: string
}): RoutineEarned {
  const since = (day: string) => day >= adoptedOn && day <= today
  if (entries.length === 0 && plans.length === 0) return NO_ROUTINE_EARNINGS
  const habits = { ...NO_HABITS }
  const seen = new Set<string>()
  for (const entry of entries) {
    if (!since(entry.on) || seen.has(entry.id)) continue
    if (!(entry.habit in habits)) continue
    seen.add(entry.id)
    habits[entry.habit]++
  }
  let plansFinished = 0
  for (const plan of plans)
    if (plan.finishedOn && since(plan.finishedOn)) plansFinished++
  return { habits, plansFinished }
}

export function routineCoinsOf(earned: RoutineEarned): number {
  let coins = earned.plansFinished * PLAN_FINISHED_COINS
  for (const habit of ROUTINE_HABITS)
    coins += earned.habits[habit] * ROUTINE_COINS[habit]
  return coins
}
