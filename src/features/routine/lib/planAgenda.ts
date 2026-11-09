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
  readToday: boolean
  isNext: boolean
}

export function planAgenda(
  run: ReadingPlanRun,
  entries: readonly RoutineEntry[],
  today: string,
  upcoming = AGENDA_UPCOMING
): AgendaRow[] {
  const rows: AgendaRow[] = []
  const entry = entries.find(
    (e) => e.id === routineEntryId('bibleReading', today)
  )
  if (entry?.run === run.id)
    for (const index of [...(entry.portions ?? [])].sort((a, b) => a - b)) {
      const portion = planPortion(run, index)
      if (portion) rows.push({ portion, readToday: true, isNext: false })
    }
  const read = portionsRead(run, entries)
  const total = planPortionCount(run)
  let found = 0
  for (let index = 0; index < total && found < upcoming; index++) {
    if (read.has(index)) continue
    const portion = planPortion(run, index)
    if (!portion) continue
    rows.push({ portion, readToday: false, isNext: found === 0 })
    found++
  }
  return rows
}
