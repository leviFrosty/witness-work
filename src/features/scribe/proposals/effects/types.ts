import type { ScribePreferences } from '@/features/scribe/runtime/snapshot'
import type { Address, Coordinate } from '@/types/contact'
import type { Notification } from '@/types/visit'
import type { RichText } from '@/types/richText'

/** What undoing one applied effect needs; persisted in the ledger. */
export type UndoRecord =
  | { kind: 'time.create'; entryId: string }
  | { kind: 'plan.create'; planId: string }
  | {
      kind: 'plan.update'
      planId: string
      /** The fields the update replaced, as they were. */
      before: PlanSnapshot
      /** The Plan's `updatedAt` right after the update. */
      afterUpdatedAt: number | null
      /**
       * The Plan right after the update; Undo reverts only while it still
       * matches. Older records have only `afterUpdatedAt`.
       */
      after?: PlanSnapshot
    }
  | { kind: 'contact.create'; contactId: string; ref: string }
  | {
      kind: 'contact.update'
      contactId: string
      before: ContactSnapshot
      afterUpdatedAt: number | null
      /** As for a Plan: the Contact right after the update. */
      after?: ContactSnapshot
    }
  | { kind: 'visit.create'; visitId: string }
  | { kind: 'category.create'; categoryId: string; ref: string }

/** A Day Plan's editable fields, as stored. */
export interface PlanSnapshot {
  date: string
  minutes: number
  startTimeInMinutes: number | null
  anytime: boolean
  title: string | null
  note: string | null
  noteDoc: RichText | null
  notifyMe: boolean
  reminderOffsetMinutes: number | null
  notifications: Notification[] | null
}

export interface ContactSnapshot {
  name: string
  phone: string | null
  email: string | null
  address: Address | null
  coordinate: Coordinate | null
}

export interface ApplyContext {
  now: Date
  prefs: ScribePreferences
  /** Pending Refs bound to the records created so far in this apply. */
  bound: Map<string, string>
  newId: () => string
}

export type ApplyOutcome =
  | { status: 'applied'; undo: UndoRecord }
  | { status: 'skipped'; reason: 'changed' | 'missing' }

/** What undoing one record did. */
export type UndoOutcome =
  | 'undone'
  /** Left alone: it changed since, or something else still uses it. */
  | 'kept'
  /** Already gone. */
  | 'gone'
