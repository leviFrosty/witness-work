import type { ScribeUndoResult } from '@/features/scribe/types'
import type {
  UndoOutcome,
  UndoRecord,
} from '@/features/scribe/proposals/effects/types'
import {
  undoTimeCreate,
  undoTimeDelete,
  undoTimeUpdate,
} from '@/features/scribe/proposals/effects/time'
import {
  undoPlanCreate,
  undoPlanUpdate,
} from '@/features/scribe/proposals/effects/plan'
import {
  undoContactCreate,
  undoContactUpdate,
} from '@/features/scribe/proposals/effects/contact'
import { undoVisitCreate } from '@/features/scribe/proposals/effects/visit'
import { undoCategoryCreate } from '@/features/scribe/proposals/effects/category'

/**
 * Undoes one applied effect, only where it's still as Add left it (ADR 0032
 * §3).
 */
export function undoRecord(
  undo: UndoRecord,
  ownVisitIds: ReadonlySet<string>,
  ownRecordIds: ReadonlySet<string>
): UndoOutcome {
  switch (undo.kind) {
    case 'time.create':
      return undoTimeCreate(undo.entryId)
    case 'time.update':
      return undoTimeUpdate(undo.entryId, undo.before, undo.after)
    case 'time.delete':
      return undoTimeDelete(undo.entryId, undo.entry)
    case 'plan.create':
      return undoPlanCreate(undo.planId)
    case 'plan.update':
      return undoPlanUpdate(
        undo.planId,
        undo.before,
        undo.afterUpdatedAt,
        undo.after
      )
    case 'contact.create':
      return undoContactCreate(undo.contactId, ownVisitIds)
    case 'contact.update':
      return undoContactUpdate(
        undo.contactId,
        undo.before,
        undo.afterUpdatedAt,
        undo.after
      )
    case 'visit.create':
      return undoVisitCreate(undo.visitId)
    case 'category.create':
      return undoCategoryCreate(undo.categoryId, ownRecordIds)
  }
}

export interface UndoRun {
  result: ScribeUndoResult
  /** Effect ids that were undone. */
  undone: string[]
  /** Effect ids whose records were already gone. */
  gone: string[]
  /** Pending Refs whose records are gone again. */
  unbound: string[]
}

/** Undoes an apply's records in reverse apply order. */
export function undoApplied(
  applied: readonly { effectId: string; undo: UndoRecord }[]
): UndoRun {
  const ownVisits = new Set(
    applied.flatMap(({ undo }) =>
      undo.kind === 'visit.create' ? [undo.visitId] : []
    )
  )
  const ownRecords = new Set(
    applied.flatMap(({ undo }) =>
      undo.kind === 'time.create'
        ? [undo.entryId]
        : undo.kind === 'plan.create'
          ? [undo.planId]
          : []
    )
  )
  let kept = 0
  let reverted = 0
  const undone: string[] = []
  const gone: string[] = []
  const unbound: string[] = []
  for (const { effectId, undo } of [...applied].reverse()) {
    const outcome = undoRecord(undo, ownVisits, ownRecords)
    if (outcome === 'kept') kept++
    if (outcome === 'gone') gone.push(effectId)
    if (outcome === 'undone') {
      reverted++
      undone.push(effectId)
      if (undo.kind === 'contact.create' || undo.kind === 'category.create')
        unbound.push(undo.ref)
    }
  }
  return {
    result: {
      status:
        reverted === 0 && kept === 0
          ? 'nothing_to_undo'
          : kept > 0
            ? 'partially_undone'
            : 'undone',
      kept,
    },
    undone,
    gone,
    unbound,
  }
}
