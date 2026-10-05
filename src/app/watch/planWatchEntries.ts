import moment from 'moment'
import { Category } from '@/types/category'
import {
  TimeEntriesByYear,
  TimeEntry,
  TimeEntryTombstone,
} from '@/types/timeEntry'
import type {
  WatchEntryDraft,
  WatchOrigin,
} from '../../../modules/watch-bridge'

export type WatchEntryPlan =
  | {
      id: string
      status: 'add'
      entry: TimeEntry
      origin: WatchOrigin
      /** The chosen Category was deleted before the entry arrived. */
      categoryRemoved: boolean
    }
  /** Already saved — a repeated delivery. */
  | { id: string; status: 'duplicate' }
  /** Deleted on this or another device before it arrived; not restored. */
  | { id: string; status: 'deleted' }
  | { id: string; status: 'invalid' }

type Existing = {
  serviceReports: TimeEntriesByYear
  deletedServiceReports: TimeEntryTombstone[]
  categories: Category[]
}

export const WATCH_ORIGINS: readonly WatchOrigin[] = [
  'app',
  'shortcut',
  'timer',
  'phoneShortcut',
]

const isWholeNumberIn = (value: unknown, min: number, max: number) =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max

function isValidDraft(draft: WatchEntryDraft): boolean {
  return (
    typeof draft.id === 'string' &&
    draft.id.length > 0 &&
    draft.id.length <= 64 &&
    typeof draft.date === 'string' &&
    moment(draft.date, 'YYYY-MM-DD', true).isValid() &&
    isWholeNumberIn(draft.hours, 0, 23) &&
    isWholeNumberIn(draft.minutes, 0, 59) &&
    WATCH_ORIGINS.includes(draft.origin)
  )
}

/**
 * Decides what to do with each Time Entry made on the Apple Watch or with Siri
 * on this device. The draft's id becomes the entry's id, so a delivery that
 * repeats — or that iCloud Sync already brought in from another device — is
 * recognized, and an entry deleted before it arrived stays deleted.
 *
 * A Category deleted in the meantime is dropped rather than losing the time;
 * the entry then counts as Standard.
 */
export function planWatchEntries(
  drafts: WatchEntryDraft[],
  existing: Existing
): WatchEntryPlan[] {
  const savedIds = new Set<string>()
  for (const months of Object.values(existing.serviceReports)) {
    for (const entries of Object.values(months)) {
      for (const entry of entries) savedIds.add(entry.id)
    }
  }
  const deletedIds = new Set(existing.deletedServiceReports.map((t) => t.id))
  const categories = new Map(existing.categories.map((c) => [c.id, c]))

  return drafts.map((draft): WatchEntryPlan => {
    if (!isValidDraft(draft)) return { id: String(draft.id), status: 'invalid' }
    if (savedIds.has(draft.id)) return { id: draft.id, status: 'duplicate' }
    if (deletedIds.has(draft.id)) return { id: draft.id, status: 'deleted' }
    savedIds.add(draft.id)

    const category = draft.categoryId
      ? categories.get(draft.categoryId)
      : undefined
    return {
      id: draft.id,
      status: 'add',
      origin: draft.origin,
      categoryRemoved: !!draft.categoryId && !category,
      entry: {
        id: draft.id,
        hours: draft.hours,
        minutes: draft.minutes,
        // Local midnight of the watch's day; the store anchors it to that
        // calendar day.
        date: moment(draft.date, 'YYYY-MM-DD', true).toDate(),
        categoryId: category?.id,
        credit: category?.isCredit ?? false,
      },
    }
  })
}
