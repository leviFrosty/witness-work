import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { splitMinutes } from '@/lib/entryMinutes'
import { storedDayKey } from '@/lib/normalizeDate'
import { allTimeEntries } from '@/features/scribe/runtime/snapshot'
import { localDate } from '@/features/scribe/tools/shared'
import type { DraftEffectOf } from '@/features/scribe/proposals/model'
import type {
  ApplyContext,
  ApplyOutcome,
  TimeSnapshot,
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

const snapshotOf = (entry: TimeEntry): TimeSnapshot => ({
  date: storedDayKey(entry.date),
  hours: entry.hours,
  minutes: entry.minutes,
  categoryId: entry.categoryId ?? null,
  credit: entry.credit ?? null,
  note: entry.note ?? null,
  noteDoc: entry.noteDoc ?? null,
})

/** The snapshot's fields on a TimeEntry; absent ones cleared. */
const fromSnapshot = (snapshot: TimeSnapshot): Omit<TimeEntry, 'id'> => ({
  date: localDate(snapshot.date),
  hours: snapshot.hours,
  minutes: snapshot.minutes,
  categoryId: snapshot.categoryId ?? undefined,
  credit: snapshot.credit ?? undefined,
  note: snapshot.note ?? undefined,
  noteDoc: snapshot.noteDoc ?? undefined,
})

const sameSnapshot = (a: TimeSnapshot, b: TimeSnapshot): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

/** Re-checked against the entry as it was read (Reconcile at Accept). */
export function applyTimeUpdate(
  draft: DraftEffectOf<'time.update'>,
  ctx: ApplyContext
): ApplyOutcome {
  const entry = findEntry(draft.entryId)
  if (!entry) return { status: 'skipped', reason: 'missing' }
  if ((entry.updatedAt ?? null) !== draft.expectUpdatedAt)
    return { status: 'skipped', reason: 'changed' }
  const { set } = draft
  let category: Partial<TimeEntry> = {}
  if (set.category) {
    const categoryId = resolveCategoryId(set.category, ctx)
    if (categoryId === undefined)
      return { status: 'skipped', reason: 'missing' }
    const found = categoryId
      ? useCategories.getState().categories.find((c) => c.id === categoryId)
      : undefined
    // As the form's Type row: the reference and the legacy credit stamp.
    category = {
      categoryId: categoryId ?? undefined,
      tag: undefined,
      credit: !!found?.isCredit,
    }
  }
  const before = snapshotOf(entry)
  useServiceReport.getState().updateServiceReport({
    ...entry,
    ...(set.date !== undefined ? { date: localDate(set.date) } : {}),
    ...(set.minutes !== undefined ? splitMinutes(set.minutes) : {}),
    ...category,
    // A plain note replaces any formatted one.
    ...(set.note !== undefined
      ? { note: set.note ?? undefined, noteDoc: undefined }
      : {}),
  })
  const updated = findEntry(entry.id)
  return {
    status: 'applied',
    undo: {
      kind: 'time.update',
      entryId: entry.id,
      before,
      after: updated ? snapshotOf(updated) : before,
    },
  }
}

/** Restores the entry only if the User hasn't changed it since. */
export function undoTimeUpdate(
  entryId: string,
  before: TimeSnapshot,
  after: TimeSnapshot
): UndoOutcome {
  const entry = findEntry(entryId)
  if (!entry) return 'gone'
  if (!sameSnapshot(snapshotOf(entry), after)) return 'kept'
  useServiceReport
    .getState()
    .updateServiceReport({ ...entry, ...fromSnapshot(before) })
  return 'undone'
}

export function applyTimeDelete(
  draft: DraftEffectOf<'time.delete'>
): ApplyOutcome {
  const entry = findEntry(draft.entryId)
  if (!entry) return { status: 'skipped', reason: 'missing' }
  if ((entry.updatedAt ?? null) !== draft.expectUpdatedAt)
    return { status: 'skipped', reason: 'changed' }
  useServiceReport.getState().deleteServiceReport(entry)
  return {
    status: 'applied',
    undo: { kind: 'time.delete', entryId: entry.id, entry: snapshotOf(entry) },
  }
}

/** Puts the deleted entry back under its own id. */
export function undoTimeDelete(
  entryId: string,
  snapshot: TimeSnapshot
): UndoOutcome {
  if (findEntry(entryId)) return 'kept'
  useServiceReport
    .getState()
    .addServiceReport({ id: entryId, ...fromSnapshot(snapshot) })
  return 'undone'
}
