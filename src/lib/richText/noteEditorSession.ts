import type { RichTextDoc } from '@/types/richText'

export type NoteSurface = 'visit' | 'time_entry' | 'plan' | 'trip' | 'route'

export type NoteEditorOptions = {
  surface: NoteSurface
  doc: RichTextDoc

  title: string
  placeholder: string

  characterLimit?: number

  allowImages: boolean

  onChange: (doc: RichTextDoc) => void
}

const sessions = new Map<string, NoteEditorOptions>()

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

export function markNoteEditorLoaded(id: string) {
  if (sessions.has(id)) loaded.add(id)
}

export function isNoteEditorLoaded(): boolean {
  const newest = [...sessions.keys()].at(-1)
  return newest !== undefined && loaded.has(newest)
}
