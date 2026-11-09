import { addDays, daysBetween } from '@/lib/dayKeys'
import type { PlanProgress } from '@/lib/routine/readingPlans'
import type { ReadingPlanRun } from '@/types/routine'

export const PACE_EXTRA_MAX = 30

export type PlanPace =
  | { kind: 'estimate'; finishOn: string }
  | { kind: 'onPace' }
  | { kind: 'faster'; perDay: number; extra: number }
  | { kind: 'passed' }

const estimatedFinish = (
  progress: PlanProgress,
  today: string,
  readToday: boolean
): string =>
  addDays(today, progress.total - progress.read - (readToday ? 0 : 1))

export function planPace(
  run: Pick<ReadingPlanRun, 'finishBy'>,
  progress: PlanProgress,
  today: string,
  readToday: boolean
): PlanPace | null {
  const remaining = progress.total - progress.read
  if (remaining <= 0) return null
  if (!run.finishBy)
    return {
      kind: 'estimate',
      finishOn: estimatedFinish(progress, today, readToday),
    }
  if (run.finishBy < today) return { kind: 'passed' }
  const days = Math.max(
    1,
    daysBetween(today, run.finishBy) + (readToday ? 0 : 1)
  )
  const perDay = Math.ceil(remaining / days)
  return perDay <= 1
    ? { kind: 'onPace' }
    : { kind: 'faster', perDay, extra: remaining - days }
}

export function defaultFinishBy(
  run: Pick<ReadingPlanRun, 'startedOn'>,
  progress: PlanProgress,
  today: string,
  readToday: boolean
): string {
  const scheduled = addDays(run.startedOn, progress.total - 1)
  return scheduled >= today
    ? scheduled
    : estimatedFinish(progress, today, readToday)
}
