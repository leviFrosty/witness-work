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

export type RichText = {
  v: 1
  doc: RichTextDoc

  textHash: string
}

export type NoteFields = {
  note?: string
  noteDoc?: RichText
}
