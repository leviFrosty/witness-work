import type { RichTextDoc } from '@/types/richText'

/** Which form opened the editor; for analytics and per-form limits. */
export type NoteSurface = 'visit' | 'time_entry' | 'plan' | 'trip' | 'route'

export type NoteEditorOptions = {
  surface: NoteSurface
  doc: RichTextDoc
  /** Header title. */
  title: string
  placeholder: string
  /** Most characters of text the note may hold. */
  characterLimit?: number
  /** Whether photos can be added (off for visit notes in data protection mode). */
  allowImages: boolean
  /** Called as the note changes; the form keeps it until it's saved. */
  onChange: (doc: RichTextDoc) => void
}

/**
 * Open note editors, by id. A form hands its note and an `onChange` to the
 * editor screen through here, since navigation params can't carry functions.
 * The form saves the note with the rest of the record, as it always has.
 */
const sessions = new Map<string, NoteEditorOptions>()
/** Sessions whose editor has loaded, so typing reaches the note. */
const loaded = new Set<string>()
let nextId = 0

export function startNoteEditorSession(options: NoteEditorOptions): string {
  const id = `note-${Date.now().toString(36)}-${nextId++}`
  sessions.set(id, options)
  return id
}

export function getNoteEditorSession(
  id: string
): NoteEditorOptions | undefined {
  return sessions.get(id)
}

export function endNoteEditorSession(id: string) {
  sessions.delete(id)
  loaded.delete(id)
}

/** Records that the session's editor has loaded its page. */
export function markNoteEditorLoaded(id: string) {
  if (sessions.has(id)) loaded.add(id)
}

/**
 * Whether the newest open editor has loaded. The editor is a web view, which
 * can take a while on a first open; the dev harness waits on this before
 * typing.
 */
export function isNoteEditorLoaded(): boolean {
  const newest = [...sessions.keys()].at(-1)
  return newest !== undefined && loaded.has(newest)
}
