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

      categoryRemoved: boolean
    }
  | { id: string; status: 'duplicate' }
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
  'tile',
  'ongoing_activity',
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

        date: moment(draft.date, 'YYYY-MM-DD', true).toDate(),
        categoryId: category?.id,
        credit: category?.isCredit ?? false,
      },
    }
  })
}
