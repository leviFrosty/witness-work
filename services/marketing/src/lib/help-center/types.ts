/**
 * The subset of the app's Rich Note document (the app's
 * `src/types/richText.ts`) that Help Center answers use. Answers convert to it
 * at build time, so the app renders them with the same `RichTextView` it uses
 * for notes.
 */
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

export type RichTextBlock =
  | RichTextParagraph
  | RichTextHeading
  | RichTextBulletList
  | RichTextOrderedList

export type RichTextDoc = { type: 'doc'; content: RichTextBlock[] }

export type HelpPlatform = 'ios' | 'android' | 'web'

/** Every platform, in the order bundles list them. */
export const HELP_PLATFORMS: HelpPlatform[] = ['ios', 'android', 'web']

/** One question in one locale, as shipped in bundles (contract v1). */
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
