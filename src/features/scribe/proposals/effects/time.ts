import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { splitMinutes } from '@/lib/entryMinutes'
import { allTimeEntries } from '@/features/scribe/runtime/snapshot'
import { localDate } from '@/features/scribe/tools/shared'
import type { DraftEffectOf } from '@/features/scribe/proposals/model'
import type {
  ApplyContext,
  ApplyOutcome,
  UndoOutcome,
} from '@/features/scribe/proposals/effects/types'
import { resolveCategoryId } from '@/features/scribe/proposals/effects/category'
import type { TimeEntry } from '@/types/timeEntry'

const findEntry = (id: string): TimeEntry | undefined =>
  allTimeEntries(useServiceReport.getState().serviceReports).find(
    (entry) => entry.id === id
  )

/** A Time Entry as the Add Time form saves one. */
export function applyTimeCreate(
  draft: DraftEffectOf<'time.create'>,
  ctx: ApplyContext
): ApplyOutcome {
  const categoryId = resolveCategoryId(draft.category, ctx)
  if (categoryId === undefined) return { status: 'skipped', reason: 'missing' }
  const category = categoryId
    ? useCategories.getState().categories.find((c) => c.id === categoryId)
    : undefined
  const entry: TimeEntry = {
    id: ctx.newId(),
    ...splitMinutes(draft.minutes),
    date: localDate(draft.date),
    ...(categoryId ? { categoryId, credit: !!category?.isCredit } : {}),
    ...(draft.note ? { note: draft.note } : {}),
  }
  useServiceReport.getState().addServiceReport(entry)
  return { status: 'applied', undo: { kind: 'time.create', entryId: entry.id } }
}

export function undoTimeCreate(entryId: string): UndoOutcome {
  const entry = findEntry(entryId)
  if (!entry) return 'gone'
  useServiceReport.getState().deleteServiceReport(entry)
  return 'undone'
}
