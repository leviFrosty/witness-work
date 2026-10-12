import type {
  RichText,
  RichTextBlock,
  RichTextDoc,
  RichTextHeadingLevel,
  RichTextImageAttrs,
  RichTextInline,
  RichTextListItem,
  RichTextMark,
  RichTextTaskItem,
  RichTextText,
} from '@/types/richText'
import { normalizeImageScale } from '@/lib/richText/imageScale'

/** Lists nested deeper than this are flattened into paragraphs. */
const MAX_LIST_DEPTH = 6
/** Nodes past these limits are dropped, so a hostile doc can't stall a render. */
const MAX_NODES = 5000
const MAX_TEXT_CHARS = 100_000
const MAX_IMAGE_SIDE = 20_000
const MAX_HREF_LENGTH = 2048

export const RICH_TEXT_VERSION = 1

const IMAGE_ID = /^[A-Za-z0-9-]{8,64}$/
const SAFE_HREF =
  /^(?:https?:\/\/[^\s/?#]+|mailto:[^\s]+|tel:[+\d][\d\s().-]*$)/i

/** Marks in a fixed order, so equal formatting serializes the same way. */
const MARK_ORDER: RichTextMark['type'][] = [
  'link',
  'bold',
  'italic',
  'underline',
  'strike',
]

export const isImageId = (value: unknown): value is string =>
  typeof value === 'string' && IMAGE_ID.test(value)

export const isSafeHref = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= MAX_HREF_LENGTH &&
  SAFE_HREF.test(value.trim())

type Budget = { nodes: number; chars: number }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const children = (node: Record<string, unknown>): unknown[] =>
  Array.isArray(node.content) ? node.content : []

function parseMarks(value: unknown): RichTextMark[] {
  if (!Array.isArray(value)) return []
  const marks = new Map<RichTextMark['type'], RichTextMark>()
  for (const mark of value) {
    if (!isRecord(mark)) continue
    switch (mark.type) {
      case 'bold':
      case 'italic':
      case 'underline':
      case 'strike':
        marks.set(mark.type, { type: mark.type })
        break
      case 'link': {
        const href = isRecord(mark.attrs) ? mark.attrs.href : undefined
        if (isSafeHref(href)) {
          marks.set('link', { type: 'link', attrs: { href: href.trim() } })
        }
        break
      }
    }
  }
  return MARK_ORDER.flatMap((type) => {
    const mark = marks.get(type)
    return mark ? [mark] : []
  })
}

const sameMarks = (a: RichTextMark[] = [], b: RichTextMark[] = []) =>
  a.length === b.length &&
  a.every((mark, index) => {
    const other = b[index]
    if (!other || other.type !== mark.type) return false
    if (mark.type === 'link' && other.type === 'link') {
      return mark.attrs.href === other.attrs.href
    }
    return true
  })

/** Text from any node and its descendants, for nodes this version can't read. */
function flattenText(node: unknown, budget: Budget): string {
  if (!isRecord(node) || budget.nodes <= 0) return ''
  budget.nodes--
  if (typeof node.text === 'string') return node.text
  if (node.type === 'hardBreak') return '\n'
  return children(node)
    .map((child) => flattenText(child, budget))
    .join('')
}

function parseInline(value: unknown, budget: Budget): RichTextInline[] {
  if (!Array.isArray(value)) return []
  const inline: RichTextInline[] = []
  for (const node of value) {
    if (budget.nodes <= 0 || budget.chars <= 0) break
    if (!isRecord(node)) continue
    budget.nodes--
    if (node.type === 'hardBreak') {
      inline.push({ type: 'hardBreak' })
      continue
    }
    // Unknown inline nodes (a mention, say) keep their text.
    const text =
      typeof node.text === 'string'
        ? node.text
        : node.type === 'text'
          ? ''
          : flattenText(node, budget)
    if (!text) continue
    const clipped = text.slice(0, budget.chars)
    budget.chars -= clipped.length
    const marks = node.type === 'text' ? parseMarks(node.marks) : []
    const previous = inline[inline.length - 1]
    if (previous?.type === 'text' && sameMarks(previous.marks, marks)) {
      previous.text += clipped
      continue
    }
    const item: RichTextText = { type: 'text', text: clipped }
    if (marks.length) item.marks = marks
    inline.push(item)
  }
  return inline
}

const paragraph = (content: RichTextInline[]): RichTextBlock =>
  content.length ? { type: 'paragraph', content } : { type: 'paragraph' }

function parseImage(attrs: unknown): RichTextImageAttrs | null {
  if (!isRecord(attrs) || !isImageId(attrs.id)) return null
  const width = Math.round(Number(attrs.width))
  const height = Math.round(Number(attrs.height))
  if (
    !(width > 0 && width <= MAX_IMAGE_SIDE) ||
    !(height > 0 && height <= MAX_IMAGE_SIDE)
  ) {
    return null
  }
  const scale = normalizeImageScale(attrs.scale)
  return scale === undefined
    ? { id: attrs.id, width, height }
    : { id: attrs.id, width, height, scale }
}

function parseItemBlocks(
  node: Record<string, unknown>,
  budget: Budget,
  depth: number
): RichTextBlock[] {
  const blocks = parseBlocks(children(node), budget, depth)
  // An item starts with a paragraph, like Tiptap's `paragraph block*`.
  return blocks[0]?.type === 'paragraph'
    ? blocks
    : [{ type: 'paragraph' }, ...blocks]
}

function parseList(
  node: Record<string, unknown>,
  budget: Budget,
  depth: number
): RichTextBlock[] {
  const type = node.type as 'bulletList' | 'orderedList' | 'taskList'
  if (depth >= MAX_LIST_DEPTH) {
    // Too deep to show sensibly; keep the words.
    return children(node).flatMap((item) =>
      isRecord(item) ? parseBlocks(children(item), budget, depth) : []
    )
  }
  if (type === 'taskList') {
    const items: RichTextTaskItem[] = []
    for (const item of children(node)) {
      if (!isRecord(item) || budget.nodes <= 0) continue
      budget.nodes--
      const checked = isRecord(item.attrs) && item.attrs.checked === true
      items.push({
        type: 'taskItem',
        attrs: { checked },
        content: parseItemBlocks(item, budget, depth + 1),
      })
    }
    return items.length ? [{ type, content: items }] : []
  }

  const items: RichTextListItem[] = []
  for (const item of children(node)) {
    if (!isRecord(item) || budget.nodes <= 0) continue
    budget.nodes--
    items.push({
      type: 'listItem',
      content: parseItemBlocks(item, budget, depth + 1),
    })
  }
  if (!items.length) return []
  if (type === 'orderedList') {
    const start = isRecord(node.attrs) ? Number(node.attrs.start) : 1
    return Number.isInteger(start) && start >= 0 && start !== 1
      ? [{ type, attrs: { start: Math.min(start, 1_000_000) }, content: items }]
      : [{ type, content: items }]
  }
  return [{ type, content: items }]
}

function parseBlocks(
  value: unknown[],
  budget: Budget,
  depth: number
): RichTextBlock[] {
  const blocks: RichTextBlock[] = []
  for (const node of value) {
    if (budget.nodes <= 0 || budget.chars <= 0) break
    if (!isRecord(node)) continue
    budget.nodes--
    switch (node.type) {
      case 'paragraph':
        blocks.push(paragraph(parseInline(node.content, budget)))
        break
      case 'heading': {
        const raw = isRecord(node.attrs) ? Number(node.attrs.level) : 1
        const level: RichTextHeadingLevel = raw >= 2 ? 2 : 1
        const content = parseInline(node.content, budget)
        blocks.push(
          content.length
            ? { type: 'heading', attrs: { level }, content }
            : { type: 'heading', attrs: { level } }
        )
        break
      }
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        blocks.push(...parseList(node, budget, depth))
        break
      case 'image': {
        const attrs = parseImage(node.attrs)
        if (attrs) blocks.push({ type: 'image', attrs })
        break
      }
      default: {
        // A block from a newer version (a quote, a table): keep its words.
        const text = flattenText(node, budget).slice(0, budget.chars)
        budget.chars -= text.length
        for (const line of text.split('\n')) {
          blocks.push(paragraph(line ? [{ type: 'text', text: line }] : []))
        }
      }
    }
  }
  return blocks
}

/**
 * Reads a Tiptap JSON doc, keeping only what notes support. Anything else is
 * downgraded (unknown blocks to paragraphs, unsafe links to text) rather than
 * rejected. Returns null when `value` isn't a doc at all.
 */
export function parseRichTextDoc(value: unknown): RichTextDoc | null {
  if (!isRecord(value) || value.type !== 'doc') return null
  const budget: Budget = { nodes: MAX_NODES, chars: MAX_TEXT_CHARS }
  const content = parseBlocks(children(value), budget, 0)
  return {
    type: 'doc',
    content: content.length ? content : [{ type: 'paragraph' }],
  }
}

/**
 * Reads a stored Rich Note. Null when it's missing, malformed, or from a newer
 * format version, in which case the record's plain-text note is used.
 */
export function parseRichText(value: unknown): RichText | null {
  if (!isRecord(value) || value.v !== RICH_TEXT_VERSION) return null
  if (typeof value.textHash !== 'string' || !value.textHash) return null
  const doc = parseRichTextDoc(value.doc)
  return doc ? { v: RICH_TEXT_VERSION, doc, textHash: value.textHash } : null
}
