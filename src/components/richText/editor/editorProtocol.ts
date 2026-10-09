/**
 * Messages between the native note editor screen and the Tiptap editor in its
 * WebView (`RichTextEditorDom`). Everything here crosses the bridge as JSON, so
 * it imports nothing from React Native.
 */

export type EditorMark = 'bold' | 'italic' | 'underline' | 'strike'
export type EditorBlock = 'paragraph' | 'heading1' | 'heading2'
export type EditorList = 'bulletList' | 'orderedList' | 'taskList'

export type EditorImage = { id: string; width: number; height: number }

export type EditorCommand =
  | { type: 'focus'; at?: 'end' }
  | { type: 'blur' }
  | { type: 'flush' }
  | { type: 'toggleMark'; mark: EditorMark }
  | { type: 'setBlock'; block: EditorBlock }
  | { type: 'toggleList'; list: EditorList }
  | { type: 'indent' }
  | { type: 'outdent' }
  | { type: 'setLink'; href: string; text?: string }
  | { type: 'unsetLink' }
  | { type: 'insertImage'; image: EditorImage; src: string }
  | { type: 'undo' }
  | { type: 'redo' }

/** What the toolbar shows as active or available, at the cursor. */
export type EditorFormatState = {
  focused: boolean
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  block: EditorBlock
  list: EditorList | null
  link: string | null
  /** Selected text, for prefilling the link sheet (clipped). */
  selection: string
  canIndent: boolean
  canOutdent: boolean
  canUndo: boolean
  canRedo: boolean
  images: number
}

export const EMPTY_FORMAT_STATE: EditorFormatState = {
  focused: false,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  block: 'paragraph',
  list: null,
  link: null,
  selection: '',
  canIndent: false,
  canOutdent: false,
  canUndo: false,
  canRedo: false,
  images: 0,
}

export type EditorTheme = {
  scheme: 'light' | 'dark'
  text: string
  textAlt: string
  accent: string
  background: string
  border: string
  /** Body text size in CSS px (= points), including the user's text size. */
  fontSize: number
}

/** Font files for the editor's `@font-face`s; missing ones use system fonts. */
export type EditorFonts = {
  regular?: string
  bold?: string
  italic?: string
  boldItalic?: string
}

export type EditorSetup = {
  /** The note as a Tiptap JSON doc. */
  doc: Record<string, unknown>
  /** Image id → loadable URL (file:// in release builds, data: in dev). */
  imageSources: Record<string, string>
  theme: EditorTheme
  fonts: EditorFonts
  placeholder: string
  label: string
  /** Most characters of text the note may hold. */
  characterLimit?: number
  autofocus: boolean
}
