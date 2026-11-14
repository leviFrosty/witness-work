export type RichTextMark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'strike' }
  | { type: 'link'; attrs: { href: string } }

export type RichTextText = {
  type: 'text'
  text: string
  marks?: RichTextMark[]
}

export type RichTextInline = RichTextText | { type: 'hardBreak' }

export type RichTextParagraph = {
  type: 'paragraph'
  content?: RichTextInline[]
}

export type RichTextHeading = {
  type: 'heading'
  attrs: { level: 1 | 2 }
  content?: RichTextInline[]
}

export type RichTextListItem = {
  type: 'listItem'
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

export type RichTextImage = {
  type: 'image'
  attrs: { id: string; src: string; alt: string; width: number; height: number }
}

export type RichTextBlock =
  | RichTextParagraph
  | RichTextHeading
  | RichTextBulletList
  | RichTextOrderedList
  | RichTextImage

export type RichTextDoc = { type: 'doc'; content: RichTextBlock[] }

export type HelpPlatform = 'ios' | 'android' | 'web'

export const HELP_PLATFORMS: HelpPlatform[] = ['ios', 'android', 'web']

export type HelpEntry = {
  id: string
  slug: string
  category: string
  platforms: HelpPlatform[]
  pinned: boolean
  related: number[]
  minAppVersion?: string
  question: string
  doc: RichTextDoc
  plainText: string
  url: string
  fallback?: true
}

export type HelpCategory = { id: string; title: string }

export type HelpBundle = {
  schemaVersion: 1
  locale: string
  hash: string
  generatedAt: string
  categories: HelpCategory[]
  entries: HelpEntry[]
}

export type HelpManifest = {
  schemaVersion: 1
  generatedAt: string
  locales: Record<string, { hash: string; count: number; path: string }>
}
