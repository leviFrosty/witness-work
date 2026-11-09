import { routineEntryId } from '@/lib/routine/habits'
import {
  planPortion,
  planPortionCount,
  portionsRead,
  type Portion,
} from '@/lib/routine/readingPlans'
import type { ReadingPlanRun, RoutineEntry } from '@/types/routine'

export const AGENDA_UPCOMING = 5

export type AgendaRow = {
  portion: Portion
  isNext: boolean
}

export function planAgenda(
  run: ReadingPlanRun,
  entries: readonly RoutineEntry[],
  upcoming = AGENDA_UPCOMING
): AgendaRow[] {
  const rows: AgendaRow[] = []
  const read = portionsRead(run, entries)
  const total = planPortionCount(run)
  for (let index = 0; index < total && rows.length < upcoming; index++) {
    if (read.has(index)) continue
    const portion = planPortion(run, index)
    if (portion) rows.push({ portion, isNext: rows.length === 0 })
  }
  return rows
}

export type CompletedRow = {
  portion: Portion

  on: string
}

export function planCompleted(
  run: ReadingPlanRun,
  entries: readonly RoutineEntry[]
): CompletedRow[] {
  const rows: CompletedRow[] = []
  for (const entry of entries) {
    if (entry.habit !== 'bibleReading' || entry.run !== run.id) continue
    for (const index of entry.portions ?? []) {
      const portion = planPortion(run, index)
      if (portion) rows.push({ portion, on: entry.on })
    }
  }
  return rows.sort(
    (a, b) => b.on.localeCompare(a.on) || b.portion.index - a.portion.index
  )
}

export const readPlanToday = (
  run: ReadingPlanRun,
  entries: readonly RoutineEntry[],
  today: string
): boolean =>
  entries.some(
    (entry) =>
      entry.id === routineEntryId('bibleReading', today) &&
      entry.on === today &&
      entry.run === run.id &&
      !!entry.portions?.length
  )
