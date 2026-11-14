import { z } from 'zod'

/**
 * Notes Import — wire contract (schema + DTO types).
 *
 * This is the SOURCE OF TRUTH for the Notes Import model output. The proxy owns
 * the prompt + the structured-output JSON schema; the WitnessWork app keeps a
 * hand-maintained mirror of the TypeScript DTO types (it has no build-time
 * dependency on this package) and a deterministic mapper that turns this DTO
 * into its canonical records. If you change the shape here, update
 * `src/features/notes-import/lib/notesImportTypes.ts` in witness-work to match.
 *
 * Field naming deliberately tracks WitnessWork's canonical types (`Contact`,
 * `Visit`, `TimeEntry`, `Category`, `Publisher`) so the downstream mapper is a
 * near-mechanical translation.
 */

/** A contact the import already has, passed to the model so it can dedupe. */
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

/** Publisher roles the model may attribute to the USER. Mirrors `Publisher`. */
export type NotesImportRole =
  | 'publisher'
  | 'regularAuxiliary'
  | 'regularPioneer'
  | 'circuitOverseer'
  | 'specialPioneer'
  | 'custom'

export interface NotesImportContext {
  /**
   * The user's "now", as a full ISO-8601 string *with offset* (e.g.
   * `2026-06-17T09:30:00-05:00`). The model anchors every relative date
   * ("yesterday", "last Tuesday", "this month") to this.
   */
  now: string
  /** IANA timezone, e.g. `America/Chicago`. Disambiguates day boundaries. */
  timeZone: string
  /** The user's current role — context for plausibility, not a default to echo. */
  currentRole?: NotesImportRole
  /** Existing contacts, so the model attaches visits to real ids and avoids dupes. */
  existingContacts: ExistingContactRef[]
  /** Existing time categories, so it reuses ids instead of inventing duplicates. */
  existingCategories: ExistingCategoryRef[]
}

/** The kind of record a warning points at, for preview highlighting. */
export type NotesImportWarningKind =
  | 'contact'
  | 'visit'
  | 'timeEntry'
  | 'category'
  | 'publisher'

export type NotesImportSeverity = 'info' | 'warning' | 'error'

/**
 * A structured note the model emits about an assumption, ambiguity, or
 * low-confidence guess. `target.ref` points back at the record the warning is
 * about (a contact `tempId`, a visit/timeEntry `ref`, a category `name`, or the
 * literal `"publisher"`), so the preview can highlight exactly that row and
 * default error-severity rows to deselected.
 */
export interface NotesImportWarning {
  /** Stable handle the model invents, unique within this response (e.g. "w1"). */
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
  /** Stable handle for this NEW contact; visits reference it via contactTempId. */
  tempId: string
  name: string
  phone?: string
  email?: string
  gender?: 'male' | 'female' | 'unknown'
  address?: NotesImportDtoAddress
  note?: string
}

export interface NotesImportDtoVisit {
  /** Stable handle the model invents so warnings can target this visit (e.g. "v1"). */
  ref?: string
  /** Id of an EXISTING contact this visit belongs to. Set this OR contactTempId. */
  contactId?: string
  /** tempId of a NEW contact this visit belongs to. Set this OR contactId. */
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
  /** Stable handle the model invents so warnings can target this entry (e.g. "t1"). */
  ref?: string
  date: string
  hours: number
  minutes: number
  note?: string
  /** Reuse an EXISTING category id when the type matches one. */
  categoryId?: string
  /** Name of a NEW category when none of existingCategories fit. */
  categoryName?: string
  credit?: boolean
}

export interface NotesImportDtoCategory {
  name: string
  isCredit: boolean
}

export interface NotesImportDtoPublisher {
  role: NotesImportRole
  tenureStartDate?: string
}

/** The full structured object the model returns (and the proxy validates). */
export interface NotesImportResult {
  contacts: NotesImportDtoContact[]
  visits: NotesImportDtoVisit[]
  timeEntries: NotesImportDtoTimeEntry[]
  categories: NotesImportDtoCategory[]
  publisher: NotesImportDtoPublisher | null
  warnings: NotesImportWarning[]
  /** A ≤5-word model-generated label for the batch; the import's row title once Ready. */
  summary: string
  /**
   * A single, friendly chat message from "Scribe AI" to the user, summarizing the
   * whole-import assumptions worth verifying and asking any clarifying questions
   * about what's missing or ambiguous. Empty string when there's nothing to say.
   * Shown as a chat bubble beneath the import preview — NOT a per-record warning.
   */
  assistantMessage: string
}

/**
 * An "Empty Import": a run that completed fine but produced ZERO records. This is
 * the SERVER mirror of witness-work's `isEmptyPreview`
 * (`src/features/notes-import/lib/buildNotesImportPreview.ts`) — the two predicates
 * MUST stay identical, since the client uses it to render the empty preview and
 * the server uses it to skip the credit charge (ADR 0012). A detected Publisher
 * counts as a real record; produced Categories and Warnings alone do not.
 */
export const isEmptyImportResult = (result: NotesImportResult): boolean =>
  result.contacts.length === 0 &&
  result.visits.length === 0 &&
  result.timeEntries.length === 0 &&
  result.publisher == null

/**
 * JSON Schema for the model's structured output. Passed to `generateObject`
 * (via `jsonSchema`) so the model is forced to return exactly this shape and
 * retries on a mismatch — no brittle text parsing.
 */
export const NOTES_IMPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'contacts',
    'visits',
    'timeEntries',
    'categories',
    'publisher',
    'warnings',
    'summary',
    'assistantMessage',
  ],
  properties: {
    contacts: {
      type: 'array',
      description:
        'NEW contacts the user mentions that are not already in existingContacts. Do not re-list existing contacts here.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tempId', 'name'],
        properties: {
          tempId: {
            type: 'string',
            description:
              'A stable handle you invent for this new contact (e.g. "c1"). Visits reference it via contactTempId. Unique within this response.',
          },
          name: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
          gender: { type: 'string', enum: ['male', 'female', 'unknown'], description: "Unknown is an specific gender type where the user explicitly says they're unsure of the gender. Leave as undefined/unset if not provided by user." },
          address: {
            type: 'object',
            additionalProperties: false,
            properties: {
              line1: { type: 'string', description: 'House number + street.' },
              line2: { type: 'string', description: 'Apt/unit.' },
              city: { type: 'string' },
              state: { type: 'string' },
              zip: { type: 'string' },
              country: { type: 'string' },
            },
          },
          note: {
            type: 'string',
            description:
              'Standing info about the PERSON (interests, family, do-not-call). Only notate long-lived data points, such as their age, marriage status, employment, etc. Do not notate per-visit or future conversation remarks here; they belong on the visit object.',
          },
        },
      },
    },
    visits: {
      type: 'array',
      description:
        'Field-ministry interactions: a call/return visit/Bible study with one contact on one date. One object per distinct interaction.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'isBibleStudy'],
        properties: {
          ref: {
            type: 'string',
            description:
              'A stable handle you invent for this visit (e.g. "v1"), unique within this response. Reference it from a warning\'s target.ref when you need to flag this visit.',
          },
          contactId: {
            type: 'string',
            description:
              'The id of an EXISTING contact (from existingContacts) this visit belongs to. Set this OR contactTempId, never both.',
          },
          contactTempId: {
            type: 'string',
            description:
              'The tempId of a NEW contact (from contacts[]) this visit belongs to. Set this OR contactId.',
          },
          date: {
            type: 'string',
            description:
              'ISO-8601 date or datetime. Date-only ("2026-06-15") when no time is given. Resolve relative dates against `now`.',
          },
          note: {
            type: 'string',
            description:
              'What happened on THIS visit (topic discussed, scripture, outcome).',
          },
          isBibleStudy: {
            type: 'boolean',
            description:
              'True only when the text indicates a Bible study was conducted on this visit.',
          },
          notAtHome: {
            type: 'boolean',
            description: 'True when no one answered / not at home.',
          },
          followUp: {
            type: 'object',
            additionalProperties: false,
            required: ['date'],
            description: 'A planned return, only when the text states/implies one.',
            properties: {
              date: {
                type: 'string',
                description: 'ISO-8601 date/datetime of the planned return. If a time is provided by the user, include it here, e.g. 2026-06-21T23:47:00Z.',
              },
              topic: { type: 'string', description: "Follow up topic or reason for the planned return, what they will discuss next or remember to bring up. Retain the entirety of the users' note as-is. The visit note and follow-up topic as exclusive and shouldn't be reused." },
            },
          },
        },
      },
    },
    timeEntries: {
      type: 'array',
      description:
        'Logged ministry TIME, broken into hours + minutes per session/day. A monthly total stated as one number is a single entry on a representative date in that month.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'hours', 'minutes'],
        properties: {
          ref: {
            type: 'string',
            description:
              'A stable handle you invent for this time entry (e.g. "t1"), unique within this response. Reference it from a warning\'s target.ref when you need to flag this entry.',
          },
          date: {
            type: 'string',
            description: 'ISO-8601 date. Resolve relative dates against `now`.',
          },
          hours: { type: 'integer', minimum: 0 },
          minutes: {
            type: 'integer',
            minimum: 0,
            maximum: 59,
            description:
              'Remainder minutes only (0-59). Convert "1.5h"→hours:1,minutes:30 and "90 min"→hours:1,minutes:30.',
          },
          note: { type: 'string', description: "User provided note about what they did on that specific date. (e.g., 'Carts w/ Sam', 'Door-to-door'" },
          categoryId: {
            type: 'string',
            description:
              'Reuse an EXISTING category id (from existingCategories) when the type matches one. Time maps directly to STANDARD category unless explicitly provided by user.',
          },
          categoryName: {
            type: 'string',
            description:
              'Name of a NEW category/"Type" (e.g. "LDC", "Bethel") when none of existingCategories fit. Also add it to categories[].',
          },
          credit: {
            type: 'boolean',
            description:
              'True for credit time (LDC/RBC/construction, theocratic-school assignments). Leave unset for ordinary field service.',
          },
        },
      },
    },
    categories: {
      type: 'array',
      description:
        'NEW time categories referenced by timeEntries[].categoryName. Do not include categories that already exist.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'isCredit'],
        properties: {
          name: { type: 'string' },
          isCredit: { type: 'boolean', description: "True for credit time (LDC/RBC/construction, theocratic-school assignments). Leave unset for ordinary field service types, or categories of field service (e.g. Carts, Door-to-door, Business Territory). When in doubt, add a WARNING to ask for clarification." },
        },
      },
    },
    publisher: {
      type: ['object', 'null'],
      additionalProperties: false,
      description:
        "Only when the text explicitly states the user's OWN role/start date. Null otherwise — never infer it from activity volume.",
      required: ['role'],
      properties: {
        role: {
          type: 'string',
          enum: [
            'publisher',
            'regularAuxiliary',
            'regularPioneer',
            'circuitOverseer',
            'specialPioneer',
            'custom',
          ],
        },
        tenureStartDate: {
          type: 'string',
          description: 'ISO-8601 date the role began.',
        },
      },
    },
    warnings: {
      type: 'array',
      description:
        'Per-record flags ONLY — each one points (via target) at a specific contact, visit, time entry, category, or the publisher row so the app can highlight it. Whole-import assumptions, unplaceable items, and clarifying questions go in assistantMessage instead, NOT here. Empty array when no specific row needs flagging.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'severity', 'message'],
        properties: {
          id: {
            type: 'string',
            description:
              'A stable handle you invent for this warning (e.g. "w1"), unique within this response.',
          },
          severity: {
            type: 'string',
            enum: ['info', 'warning', 'error'],
            description:
              'info = FYI assumption; warning = review this; error = likely wrong / could not place — the preview deselects these rows by default.',
          },
          message: {
            type: 'string',
            description: 'One short plain-language sentence the user can review.',
          },
          target: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'ref'],
            description:
              'The record this warning is about, so the preview can highlight it. Must reference a record that exists in this response AND that the warning is literally about. Every warning should have one — a concern with no specific record to point at (a whole-import assumption, an omitted visit, an unidentifiable person, a dropped fragment) belongs in assistantMessage, not here. Never attach a warning to an unrelated contact.',
            properties: {
              kind: {
                type: 'string',
                enum: ['contact', 'visit', 'timeEntry', 'category', 'publisher'],
              },
              ref: {
                type: 'string',
                description:
                  'The handle of the targeted record: a contact tempId, a visit/timeEntry ref, a category name, or the literal "publisher".',
              },
            },
          },
        },
      },
    },
    summary: {
      type: 'string',
      description:
        'A concise label of at most 5 words for this batch of notes, used as the import\'s row title (e.g. "Tuesday cart witnessing", "Three return visits"). Describe the content of the notes, not the act of importing them. No trailing punctuation or surrounding quotes.',
    },
    assistantMessage: {
      type: 'string',
      description:
        'A single friendly chat message (1-3 sentences) from "Scribe AI" addressed to the user, in the notes\' own language. Summarize the whole-import assumptions worth double-checking and ask any clarifying questions about what was missing, ambiguous, or could not be placed (e.g. "I assumed every visit happened this month since no dates were given — can you confirm? I also wasn\'t sure who the Tuesday study was with."). This REPLACES general/whole-import warnings: put such notes here, conversationally, instead of in warnings[]. Empty string when there is genuinely nothing to verify or ask.',
    },
  },
} as const

/** Validate the same contract locally, including the reasoning recovery path. */
export const notesImportResultValidator = z.fromJSONSchema(
  NOTES_IMPORT_SCHEMA as unknown as Parameters<typeof z.fromJSONSchema>[0]
)
