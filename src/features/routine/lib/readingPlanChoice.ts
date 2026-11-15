import { BIBLE_BOOK_COUNT } from '@/lib/routine/bible'
import {
  DEFAULT_CHAPTERS_PER_DAY,
  DEFAULT_VERSES_PER_DAY,
  planAmount,
  planBooks,
  planPortionCount,
  planProgress,
  type PlanAmount,
  type PlanProgress,
  type PlanShape,
  type ReadingUnit,
} from '@/lib/routine/readingPlans'
import type {
  ReadingPlanKind,
  ReadingPlanRun,
  RoutineEntry,
} from '@/types/routine'

export type CustomPlanChoice = {
  kind: 'custom'
  startBook: number
  endBook: number
  amount: PlanAmount
}

export type PlanChoice =
  | { kind: 'today' }
  | { kind: 'canonical' }
  | { kind: 'chronological' }
  | CustomPlanChoice

export type ReadingChoiceKind = PlanChoice['kind']

export const DEFAULT_CUSTOM_CHOICE: CustomPlanChoice = {
  kind: 'custom',
  startBook: 0,
  endBook: BIBLE_BOOK_COUNT - 1,
  amount: { unit: 'chapters', count: DEFAULT_CHAPTERS_PER_DAY },
}

export const defaultAmount = (unit: ReadingUnit): PlanAmount => ({
  unit,
  count: unit === 'verses' ? DEFAULT_VERSES_PER_DAY : DEFAULT_CHAPTERS_PER_DAY,
})

export function withBooks(
  choice: CustomPlanChoice,
  books: { startBook?: number; endBook?: number }
): CustomPlanChoice {
  if (books.startBook !== undefined)
    return {
      ...choice,
      startBook: books.startBook,
      endBook: Math.max(books.startBook, choice.endBook),
    }
  if (books.endBook !== undefined)
    return {
      ...choice,
      endBook: books.endBook,
      startBook: Math.min(books.endBook, choice.startBook),
    }
  return choice
}

export const choiceShape = (
  choice: Exclude<PlanChoice, { kind: 'today' }>
): PlanShape =>
  choice.kind === 'custom'
    ? {
        kind: 'custom',
        startBook: choice.startBook,
        endBook: choice.endBook,
        ...(choice.amount.unit === 'verses'
          ? { versesPerDay: choice.amount.count }
          : { chaptersPerDay: choice.amount.count }),
      }
    : { kind: choice.kind }

export const sameConfig = (
  run: ReadingPlanRun,
  choice: PlanChoice
): boolean => {
  if (choice.kind === 'today' || run.kind !== choice.kind) return false
  if (choice.kind !== 'custom') return true
  const books = planBooks(run)
  const amount = planAmount(run)
  return (
    books.startBook === choice.startBook &&
    books.endBook === choice.endBook &&
    amount.unit === choice.amount.unit &&
    amount.count === choice.amount.count
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

export const liveRun = (run: ReadingPlanRun | null): ReadingPlanRun | null =>
  run && !run.finishedOn ? run : null

export function choiceOf(run: ReadingPlanRun | null): PlanChoice {
  if (!run) return { kind: 'today' }
  if (run.kind === 'custom')
    return { kind: 'custom', ...planBooks(run), amount: planAmount(run) }
  return { kind: run.kind }
}

export const choiceDays = (choice: PlanChoice): number | null =>
  choice.kind === 'today' ? null : planPortionCount(choiceShape(choice))

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

export const isLastReading = (progress: PlanProgress): boolean =>
  !progress.finished && progress.total - progress.read === 1

export const PLAN_KINDS: readonly ReadingPlanKind[] = [
  'canonical',
  'chronological',
  'custom',
]
