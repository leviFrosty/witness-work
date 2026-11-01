import type { ScribePreferences } from '@/features/scribe/runtime/snapshot'
import type { Address, Coordinate } from '@/types/contact'
import type { Notification } from '@/types/visit'
import type { RichText } from '@/types/richText'

export type UndoRecord =
  | { kind: 'time.create'; entryId: string }
  | {
      kind: 'time.update'
      entryId: string

      before: TimeSnapshot

      after: TimeSnapshot
    }
  | { kind: 'time.delete'; entryId: string; entry: TimeSnapshot }
  | { kind: 'plan.create'; planId: string }
  | {
      kind: 'plan.update'
      planId: string

      before: PlanSnapshot

      afterUpdatedAt: number | null

      after?: PlanSnapshot
    }
  | { kind: 'contact.create'; contactId: string; ref: string }
  | {
      kind: 'contact.update'
      contactId: string
      before: ContactSnapshot
      afterUpdatedAt: number | null

      after?: ContactSnapshot
    }
  | { kind: 'visit.create'; visitId: string }
  | { kind: 'category.create'; categoryId: string; ref: string }

export interface TimeSnapshot {
  date: string
  hours: number
  minutes: number
  categoryId: string | null
  credit: boolean | null
  note: string | null
  noteDoc: RichText | null
}

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

  bound: Map<string, string>

  consents: Map<string, string>
  newId: () => string
}

export type ApplyOutcome =
  | { status: 'applied'; undo: UndoRecord }
  | { status: 'skipped'; reason: 'changed' | 'missing' }

export type UndoOutcome = 'undone' | 'kept' | 'gone'
