import { canonicalJson } from '@/lib/canonicalJson'
import { contentHash } from '@/lib/contentHash'
import { compactRichText, isRichTextEmpty } from '@/lib/richText/inspect'
import { parseRichText, RICH_TEXT_VERSION } from '@/lib/richText/parse'
import {
  plainTextToRichText,
  richTextToPlainText,
} from '@/lib/richText/plainText'
import type { NoteFields, RichText, RichTextDoc } from '@/types/richText'

/*
 * A record's note lives in two fields:
 *
 * - `note`: plain text, always written. Search, exports, reminders, Buddies
 *   alerts, and older app versions read only this.
 * - `noteDoc`: the formatted doc, written only when the note has something
 *   plain text can't hold (formatting, lists, photos, labeled links).
 *
 * `noteDoc.textHash` pins the plain text it was saved with. An older app
 * version that edits the note changes `note` without touching (or while
 * dropping) `noteDoc`; the mismatch shows it, and the plain text wins.
 */

const EMPTY_DOC: RichTextDoc = { type: 'doc', content: [{ type: 'paragraph' }] }

/** Parsed `noteDoc`s, so list rows don't re-validate on every render. */
const parsedDocs = new WeakMap<object, RichText | null>()
/** Converted plain notes, by text. Small: rows re-render the same notes. */
const convertedText = new Map<string, RichTextDoc>()
const CONVERTED_TEXT_LIMIT = 200

function parsedNoteDoc(value: unknown): RichText | null {
  if (typeof value !== 'object' || value === null) return null
  if (parsedDocs.has(value)) return parsedDocs.get(value) ?? null
  const parsed = parseRichText(value)
  parsedDocs.set(value, parsed)
  return parsed
}

function docFromText(text: string): RichTextDoc {
  const cached = convertedText.get(text)
  if (cached) return cached
  const doc = plainTextToRichText(text)
  if (convertedText.size >= CONVERTED_TEXT_LIMIT) {
    const oldest = convertedText.keys().next().value
    if (oldest !== undefined) convertedText.delete(oldest)
  }
  convertedText.set(text, doc)
  return doc
}

/** The formatted doc that's current for this record's note, if any. */
function currentRichText(fields: NoteFields): RichText | null {
  const rich = parsedNoteDoc(fields.noteDoc)
  return rich && rich.textHash === contentHash(fields.note ?? '') ? rich : null
}

/** The record's note as a doc, converting a plain-text note on the fly. */
export function getNoteDoc(fields: NoteFields): RichTextDoc {
  const rich = currentRichText(fields)
  if (rich) return rich.doc
  const text = fields.note?.trim()
  return text ? docFromText(text) : EMPTY_DOC
}

/** Whether the record has a note with words or photos in it. */
export function hasNote(fields: NoteFields): boolean {
  const rich = currentRichText(fields)
  return rich ? !isRichTextEmpty(rich.doc) : !!fields.note?.trim()
}

/** The note as plain text, for search, copying, exports and notifications. */
export function getNoteText(fields: NoteFields): string {
  return fields.note?.trim() ?? ''
}

/** Both note fields, set: `undefined` clears one when spread over a record. */
export type NoteUpdate = {
  note: string | undefined
  noteDoc: RichText | undefined
}

/**
 * The fields to save for an edited note. Assign both, since a note that's
 * become plain again clears `noteDoc`:
 *
 *     updateVisit({ ...visit, ...noteFields(doc) })
 */
export function noteFields(doc: RichTextDoc | null | undefined): NoteUpdate {
  if (!doc) return { note: undefined, noteDoc: undefined }
  const compact = compactRichText(doc)
  if (isRichTextEmpty(compact)) return { note: undefined, noteDoc: undefined }
  const note = richTextToPlainText(compact)
  const plainDoc = note ? plainTextToRichText(note) : EMPTY_DOC
  if (canonicalJson(plainDoc) === canonicalJson(compact)) {
    return { note, noteDoc: undefined }
  }
  return {
    note: note || undefined,
    noteDoc: {
      v: RICH_TEXT_VERSION,
      doc: compact,
      textHash: contentHash(note),
    },
  }
}

/** Whether two records' notes read the same (for "did anything change"). */
export function sameNote(a: NoteFields, b: NoteFields): boolean {
  return canonicalJson(getNoteDoc(a)) === canonicalJson(getNoteDoc(b))
}

/** `noteFields` for a plain-text note, e.g. one written by an import. */
export function noteFieldsFromText(text: string | undefined): NoteUpdate {
  const note = text?.trim()
  return { note: note || undefined, noteDoc: undefined }
}
