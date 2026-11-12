export type NoteEditorMode = 'inline' | 'takeover'

export function noteEditorMode(
  layout: { isWide: boolean },
  embedsInPage: boolean
): NoteEditorMode {
  return layout.isWide && embedsInPage ? 'inline' : 'takeover'
}
