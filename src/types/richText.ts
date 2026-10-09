/**
 * A Rich Note is a note with formatting: headings, bold/italic/underline/
 * strikethrough, lists, checklists, links and photos. It's a Tiptap
 * (ProseMirror) JSON document limited to the nodes and marks below.
 *
 * Records keep their plain-text `note` next to the document (`noteDoc`), so
 * search, exports, reminders, Buddies alerts and older app versions keep
 * reading a string. See `src/lib/richText/notes.ts`.
 */

export type RichTextMark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
  | { type: 'strike' }
  | { type: 'link'; attrs: { href: string } }

export type RichTextMarkType = RichTextMark['type']

export type RichTextText = {
  type: 'text'
  text: string
  marks?: RichTextMark[]
}

export type RichTextInline = RichTextText | { type: 'hardBreak' }

export type RichTextHeadingLevel = 1 | 2

/**
 * A photo in a note. `id` names the local file (`note-images/<id>.jpg`); the
 * size is the stored image's, so the layout is right before the file loads.
 * `scale` is the share of the note's width the photo was resized to (0.25 to
 * 1), so it keeps its proportion on any screen. Without it the photo shows at
 * its default size.
 */
export type RichTextImageAttrs = {
  id: string
  width: number
  height: number
  scale?: number
}

export type RichTextParagraph = {
  type: 'paragraph'
  content?: RichTextInline[]
}

export type RichTextHeading = {
  type: 'heading'
  attrs: { level: RichTextHeadingLevel }
  content?: RichTextInline[]
}

export type RichTextImage = { type: 'image'; attrs: RichTextImageAttrs }

export type RichTextListItem = {
  type: 'listItem'
  content: RichTextBlock[]
}

export type RichTextTaskItem = {
  type: 'taskItem'
  attrs: { checked: boolean }
  content: RichTextBlock[]
}

export type RichTextBulletList = {
  type: 'bulletList'
  content: RichTextListItem[]
}

export type RichTextOrderedList = {
  type: 'orderedList'
  attrs?: { start?: number }
  content: RichTextListItem[]
}

export type RichTextTaskList = {
  type: 'taskList'
  content: RichTextTaskItem[]
}

export type RichTextList =
  | RichTextBulletList
  | RichTextOrderedList
  | RichTextTaskList

export type RichTextBlock =
  | RichTextParagraph
  | RichTextHeading
  | RichTextList
  | RichTextImage

export type RichTextDoc = { type: 'doc'; content: RichTextBlock[] }

/** The rich version of a note, stored next to its plain-text `note`. */
export type RichText = {
  /** Format version; readers treat a newer one as plain text. */
  v: 1
  doc: RichTextDoc
  /**
   * `contentHash` of the plain-text note this doc was saved with. When the note
   * no longer matches, an older app version edited the plain text, and the
   * plain text wins.
   */
  textHash: string
}

/** A record that can carry a note. */
export type NoteFields = {
  note?: string
  noteDoc?: RichText
}
