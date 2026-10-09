import { findLinks, isHttpUrl } from '@/lib/linkDetection'
import type {
  RichTextBlock,
  RichTextDoc,
  RichTextImageAttrs,
  RichTextInline,
  RichTextMarkType,
} from '@/types/richText'

function* walkBlocks(blocks: RichTextBlock[]): Generator<RichTextBlock> {
  for (const block of blocks) {
    yield block
    if (
      block.type === 'bulletList' ||
      block.type === 'orderedList' ||
      block.type === 'taskList'
    ) {
      for (const item of block.content) yield* walkBlocks(item.content)
    }
  }
}

function* walkInline(doc: RichTextDoc): Generator<RichTextInline> {
  for (const block of walkBlocks(doc.content)) {
    if (block.type === 'paragraph' || block.type === 'heading') {
      yield* block.content ?? []
    }
  }
}

/** The note's photos, in order. */
export function richTextImages(doc: RichTextDoc): RichTextImageAttrs[] {
  const images: RichTextImageAttrs[] = []
  for (const block of walkBlocks(doc.content)) {
    if (block.type === 'image') images.push(block.attrs)
  }
  return images
}

/** Web links in the note, in order and deduped (for link cards and menus). */
export function richTextLinks(doc: RichTextDoc): string[] {
  const links = new Set<string>()
  for (const node of walkInline(doc)) {
    if (node.type !== 'text') continue
    for (const mark of node.marks ?? []) {
      if (mark.type === 'link' && isHttpUrl(mark.attrs.href)) {
        links.add(mark.attrs.href)
      }
    }
  }
  return [...links]
}

/** Whether any text in the doc carries `type`. */
export function richTextHasMark(
  doc: RichTextDoc,
  type: RichTextMarkType
): boolean {
  for (const node of walkInline(doc)) {
    if (node.type === 'text' && node.marks?.some((m) => m.type === type)) {
      return true
    }
  }
  return false
}

/** No words and no photos. Empty lists and headings count as empty. */
export function isRichTextEmpty(doc: RichTextDoc): boolean {
  for (const block of walkBlocks(doc.content)) {
    if (block.type === 'image') return false
  }
  for (const node of walkInline(doc)) {
    if (node.type === 'text' && node.text.trim()) return false
  }
  return true
}

/** Anything beyond plain paragraphs and links: for analytics only. */
export function hasRichFormatting(doc: RichTextDoc): boolean {
  for (const block of walkBlocks(doc.content)) {
    if (block.type !== 'paragraph') return true
  }
  for (const node of walkInline(doc)) {
    if (node.type === 'text' && node.marks?.some((m) => m.type !== 'link')) {
      return true
    }
  }
  return false
}

const mapBlocks = (
  blocks: RichTextBlock[],
  map: (block: RichTextBlock) => RichTextBlock | null
): RichTextBlock[] =>
  blocks.flatMap((block): RichTextBlock[] => {
    const mapped = map(block)
    if (!mapped) return []
    switch (mapped.type) {
      case 'bulletList':
      case 'orderedList':
        return [
          {
            ...mapped,
            content: mapped.content.map((item) => ({
              ...item,
              content: mapBlocks(item.content, map),
            })),
          },
        ]
      case 'taskList':
        return [
          {
            ...mapped,
            content: mapped.content.map((item) => ({
              ...item,
              content: mapBlocks(item.content, map),
            })),
          },
        ]
      default:
        return [mapped]
    }
  })

/** The doc without photos, for places they don't travel (contact shares). */
export function withoutRichTextImages(doc: RichTextDoc): RichTextDoc {
  const content = mapBlocks(doc.content, (block) =>
    block.type === 'image' ? null : block
  )
  return {
    type: 'doc',
    content: content.length ? content : [{ type: 'paragraph' }],
  }
}

/** Swaps photo ids, e.g. a Buddy's shared photos for the local copies. */
export function mapRichTextImages(
  doc: RichTextDoc,
  map: (attrs: RichTextImageAttrs) => RichTextImageAttrs | null
): RichTextDoc {
  const content = mapBlocks(doc.content, (block) => {
    if (block.type !== 'image') return block
    const attrs = map(block.attrs)
    return attrs ? { type: 'image', attrs } : null
  })
  return {
    type: 'doc',
    content: content.length ? content : [{ type: 'paragraph' }],
  }
}

/**
 * Drops empty paragraphs at the start and end, which the editor leaves behind
 * (e.g. after a photo), so an unchanged note saves unchanged.
 */
export function compactRichText(doc: RichTextDoc): RichTextDoc {
  const isBlank = (block: RichTextBlock | undefined) =>
    block?.type === 'paragraph' &&
    (block.content ?? []).every(
      (node) => node.type === 'text' && !node.text.trim()
    )
  const content = [...doc.content]
  while (content.length > 1 && isBlank(content[content.length - 1]))
    content.pop()
  while (content.length > 1 && isBlank(content[0])) content.shift()
  return { type: 'doc', content }
}

/**
 * Checks or unchecks the `index`th checklist item, counted in reading order (an
 * item, then the items nested in it), for ticking items off without opening the
 * editor.
 */
export function toggleRichTextTask(
  doc: RichTextDoc,
  index: number
): RichTextDoc {
  let seen = -1
  const visit = (blocks: RichTextBlock[]): RichTextBlock[] =>
    blocks.map((block) => {
      switch (block.type) {
        case 'taskList':
          return {
            ...block,
            content: block.content.map((item) => {
              seen++
              const checked =
                seen === index ? !item.attrs.checked : item.attrs.checked
              return {
                ...item,
                attrs: { checked },
                content: visit(item.content),
              }
            }),
          }
        case 'bulletList':
        case 'orderedList':
          return {
            ...block,
            content: block.content.map((item) => ({
              ...item,
              content: visit(item.content),
            })),
          }
        default:
          return block
      }
    })
  return { type: 'doc', content: visit(doc.content) }
}

const isBareLink = (node: RichTextInline, hrefs: Set<string>) =>
  node.type === 'text' &&
  node.marks?.some(
    (mark) => mark.type === 'link' && hrefs.has(mark.attrs.href)
  ) === true &&
  findLinks(node.text).length > 0

function liftFrom(content: RichTextInline[], hrefs: Set<string>) {
  const kept: RichTextInline[] = []
  for (const node of content) {
    if (isBareLink(node, hrefs)) continue
    const previous = kept[kept.length - 1]
    // Close the gap the link leaves: "Read <link> tonight" → "Read tonight".
    if (
      node.type === 'text' &&
      previous?.type === 'text' &&
      /\s$/.test(previous.text) &&
      /^\s/.test(node.text)
    ) {
      const text = node.text.replace(/^\s+/, '')
      if (text) kept.push({ ...node, text })
      continue
    }
    kept.push(node)
  }
  const first = kept[0]
  if (first?.type === 'text')
    kept[0] = { ...first, text: first.text.trimStart() }
  const last = kept[kept.length - 1]
  if (last?.type === 'text') {
    kept[kept.length - 1] = { ...last, text: last.text.trimEnd() }
  }
  return kept.filter((node) => node.type !== 'text' || node.text)
}

/**
 * Removes links that are written out as bare addresses and shown as link cards
 * instead, along with paragraphs left empty. Labeled links stay in the text.
 */
export function withoutBareLinks(
  doc: RichTextDoc,
  hrefs: Set<string>
): RichTextDoc {
  if (!hrefs.size) return doc
  const content = mapBlocks(doc.content, (block) => {
    if (block.type !== 'paragraph' && block.type !== 'heading') return block
    const inline = block.content ?? []
    if (!inline.some((node) => isBareLink(node, hrefs))) return block
    const lifted = liftFrom(inline, hrefs)
    if (!lifted.length) return block.type === 'paragraph' ? null : block
    return { ...block, content: lifted }
  })
  return { type: 'doc', content }
}
