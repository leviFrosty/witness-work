import { canonicalJson } from '@/lib/canonicalJson'
import { contentHash } from '@/lib/contentHash'
import { compactRichText, isRichTextEmpty } from '@/lib/richText/inspect'
import { parseRichText, RICH_TEXT_VERSION } from '@/lib/richText/parse'
import {
  plainTextToRichText,
  richTextToPlainText,
} from '@/lib/richText/plainText'
import type { NoteFields, RichText, RichTextDoc } from '@/types/richText'

const EMPTY_DOC: RichTextDoc = { type: 'doc', content: [{ type: 'paragraph' }] }

const parsedDocs = new WeakMap<object, RichText | null>()

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

function currentRichText(fields: NoteFields): RichText | null {
  const rich = parsedNoteDoc(fields.noteDoc)
  return rich && rich.textHash === contentHash(fields.note ?? '') ? rich : null
}

export function getNoteDoc(fields: NoteFields): RichTextDoc {
  const rich = currentRichText(fields)
  if (rich) return rich.doc
  const text = fields.note?.trim()
  return text ? docFromText(text) : EMPTY_DOC
}

export function getRichNoteDoc(fields: NoteFields): RichTextDoc | null {
  return currentRichText(fields)?.doc ?? null
}

export function hasNote(fields: NoteFields): boolean {
  const rich = currentRichText(fields)
  return rich ? !isRichTextEmpty(rich.doc) : !!fields.note?.trim()
}

export function getNoteText(fields: NoteFields): string {
  return fields.note?.trim() ?? ''
}

export type NoteUpdate = {
  note: string | undefined
  noteDoc: RichText | undefined
}

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
