export const NOTE_MAX_WIDTH = 720

export const NOTE_GUTTER = 16

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

export type EditorFormatState = {
  focused: boolean
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  block: EditorBlock
  list: EditorList | null
  link: string | null

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

  fontSize: number
}

export type EditorFonts = {
  regular?: string
  bold?: string
  italic?: string
  boldItalic?: string
}

export type EditorSetup = {
  doc: Record<string, unknown>

  imageSources: Record<string, string>
  theme: EditorTheme
  fonts: EditorFonts

  direction: 'ltr' | 'rtl'
  placeholder: string
  label: string

  characterLimit?: number
  autofocus: boolean
}
