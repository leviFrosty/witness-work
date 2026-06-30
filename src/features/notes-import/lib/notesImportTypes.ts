/**
 * Notes Import — wire types (the app's half of the contract).
 *
 * The prompt + the JSON schema now live in the `ww-proxy` backend, which owns
 * the model call and validates the output (decision 1). The app keeps these
 * TypeScript types so it can build the request `context` and map the validated
 * response DTO into WitnessWork records.
 *
 * ⚠️ Keep in lockstep with `ww-proxy/src/notesImport/schema.ts`. There is no
 * shared package across the two repos, so this is a hand-maintained mirror.
 */

import type { Publisher } from '@/types/publisher'

/** A contact the import already has, sent to the model so it can dedupe. */
export interface ExistingContactRef {
  id: string
  name: string
  /** Helps disambiguate two people with the same name. Omit when unknown. */
  address?: string
  phone?: string
}

/** A category (time "Type") the user already has, for dedupe + credit reuse. */
export interface ExistingCategoryRef {
  id: string
  name: string
  isCredit: boolean
}

export interface NotesImportContext {
  /**
   * The user's "now", as a full ISO-8601 string _with offset_ (e.g.
   * `2026-06-17T09:30:00-05:00`). The model anchors every relative date to
   * this.
   */
  now: string
  /** IANA timezone, e.g. `America/Chicago`. Disambiguates day boundaries. */
  timeZone: string
  /**
   * The user's current Publisher role — context for plausibility, not a
   * default.
   */
  currentRole?: Publisher
  /**
   * Existing contacts, so the model attaches visits to real ids and avoids
   * dupes.
   */
  existingContacts: ExistingContactRef[]
  /** Existing time categories, so it reuses ids instead of inventing duplicates. */
  existingCategories: ExistingCategoryRef[]
}

export type NotesImportSeverity = 'info' | 'warning' | 'error'

export type NotesImportWarningKind =
  | 'contact'
  | 'visit'
  | 'timeEntry'
  | 'category'
  | 'publisher'

/**
 * A structured note the model emits about an assumption, ambiguity, or
 * low-confidence guess. `target.ref` points at the record it concerns (a
 * contact `tempId`, a visit/timeEntry `ref`, a category `name`, or the literal
 * `"publisher"`).
 */
export interface NotesImportWarning {
  id: string
  severity: NotesImportSeverity
  message: string
  target?: {
    kind: NotesImportWarningKind
    ref: string
  }
}

export interface NotesImportDtoAddress {
  line1?: string
  line2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
}

export interface NotesImportDtoContact {
  tempId: string
  name: string
  phone?: string
  email?: string
  gender?: 'male' | 'female' | 'unknown'
  address?: NotesImportDtoAddress
  note?: string
}

export interface NotesImportDtoVisit {
  ref?: string
  /** Id of an EXISTING contact this visit belongs to. Set this OR contactTempId. */
  contactId?: string
  /** TempId of a NEW contact this visit belongs to. Set this OR contactId. */
  contactTempId?: string
  date: string
  note?: string
  isBibleStudy: boolean
  notAtHome?: boolean
  followUp?: {
    date: string
    topic?: string
  }
}

export interface NotesImportDtoTimeEntry {
  ref?: string
  date: string
  hours: number
  minutes: number
  note?: string
  categoryId?: string
  categoryName?: string
  credit?: boolean
}

export interface NotesImportDtoCategory {
  name: string
  isCredit: boolean
}

export interface NotesImportDtoPublisher {
  role: Publisher
  tenureStartDate?: string
}

/** The full structured object the model returns (proxy-validated). */
export interface NotesImportResult {
  contacts: NotesImportDtoContact[]
  visits: NotesImportDtoVisit[]
  timeEntries: NotesImportDtoTimeEntry[]
  categories: NotesImportDtoCategory[]
  publisher: NotesImportDtoPublisher | null
  warnings: NotesImportWarning[]
  /**
   * A ≤5-word model-generated label for the batch. Becomes the import's history
   * row title once Ready. May be an empty string on the rare reasoning-channel
   * recovery path, so callers fall back to the provisional title / counts.
   */
  summary: string
  /**
   * A single, friendly chat message from Scribe AI to the user — whole-import
   * assumptions worth verifying plus any clarifying questions about what's
   * missing or ambiguous. Rendered as a chat bubble beneath the import preview
   * (NOT a per-record warning). Empty string when there's nothing to say.
   */
  assistantMessage: string
}
