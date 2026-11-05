import {
  clampChaptersPerDay,
  planPortionCount,
  planProgress,
  type PlanProgress,
} from '@/lib/routine/readingPlans'
import type {
  ReadingPlanKind,
  ReadingPlanRun,
  RoutineEntry,
} from '@/types/routine'

export type PlanChoice =
  | { kind: 'today' }
  | { kind: 'canonical' }
  | { kind: 'chronological' }
  | { kind: 'custom'; startBook: number; chaptersPerDay: number }

export type ReadingChoiceKind = PlanChoice['kind']

export const sameConfig = (
  run: ReadingPlanRun,
  choice: PlanChoice
): boolean => {
  if (choice.kind === 'today' || run.kind !== choice.kind) return false
  if (choice.kind !== 'custom') return true
  return (
    (run.startBook ?? 0) === choice.startBook &&
    clampChaptersPerDay(run.chaptersPerDay) ===
      clampChaptersPerDay(choice.chaptersPerDay)
  )
}

export function resumableRun(
  runs: readonly ReadingPlanRun[],
  choice: PlanChoice
): ReadingPlanRun | null {
  let best: ReadingPlanRun | null = null
  for (const run of runs) {
    if (run.finishedOn || !sameConfig(run, choice)) continue
    if (!best || run.startedOn > best.startedOn) best = run
  }
  return best
}

export const activeRun = (
  runs: readonly ReadingPlanRun[],
  id: string | null
): ReadingPlanRun | null =>
  id === null ? null : (runs.find((run) => run.id === id) ?? null)

export function choiceOf(run: ReadingPlanRun | null): PlanChoice {
  if (!run) return { kind: 'today' }
  if (run.kind === 'custom')
    return {
      kind: 'custom',
      startBook: run.startBook ?? 0,
      chaptersPerDay: clampChaptersPerDay(run.chaptersPerDay),
    }
  return { kind: run.kind }
}

export const choiceDays = (choice: PlanChoice): number | null =>
  choice.kind === 'today'
    ? null
    : planPortionCount(
        choice.kind === 'custom'
          ? {
              kind: 'custom',
              startBook: choice.startBook,
              chaptersPerDay: choice.chaptersPerDay,
            }
          : { kind: choice.kind }
      )

export const leavingLosesPlace = (
  run: ReadingPlanRun | null,
  progress: PlanProgress | null,
  choice: PlanChoice
): boolean =>
  !!run &&
  !!progress &&
  progress.read > 0 &&
  !progress.finished &&
  !sameConfig(run, choice)

export const progressOf = (
  run: ReadingPlanRun | null,
  entries: readonly RoutineEntry[]
): PlanProgress | null => (run ? planProgress(run, entries) : null)

export const planDay = (progress: PlanProgress): number =>
  Math.min(progress.total, progress.read + 1)

export const PLAN_KINDS: readonly ReadingPlanKind[] = [
  'canonical',
  'chronological',
  'custom',
]
