import type { RoutineHabit } from '@/types/routine'

export type RoutineDayLog = {
  day: string | null
  habits: RoutineHabit[]
  count: number
  backfilled: number
}

export const EMPTY_DAY_LOG: RoutineDayLog = {
  day: null,
  habits: [],
  count: 0,
  backfilled: 0,
}

export type RoutineDayReport = {
  habits: string
  count: number
  backfilled: number
}

export type RollupStep = {
  log: RoutineDayLog
  report: RoutineDayReport | null
}

const reportOf = (log: RoutineDayLog): RoutineDayReport | null =>
  log.day !== null && log.count > 0
    ? {
        habits: [...log.habits].sort().join(','),
        count: log.count,
        backfilled: log.backfilled,
      }
    : null

export function flushDayLog(log: RoutineDayLog, today: string): RollupStep {
  if (log.day === null || log.day >= today) return { log, report: null }
  return { log: EMPTY_DAY_LOG, report: reportOf(log) }
}

export function recordDayCheck(
  log: RoutineDayLog,
  today: string,
  habit: RoutineHabit,
  backfilled: boolean
): RollupStep {
  const flushed =
    log.day === today ? { log, report: null } : flushDayLog(log, today)
  const current =
    flushed.log.day === today ? flushed.log : { ...EMPTY_DAY_LOG, day: today }
  return {
    report: flushed.report,
    log: {
      day: today,
      habits: current.habits.includes(habit)
        ? current.habits
        : [...current.habits, habit],
      count: current.count + 1,
      backfilled: current.backfilled + (backfilled ? 1 : 0),
    },
  }
}
