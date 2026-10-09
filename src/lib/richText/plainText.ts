import { findLinks, splitTextWithLinks } from '@/lib/linkDetection'
import type {
  RichTextBlock,
  RichTextDoc,
  RichTextInline,
  RichTextListItem,
  RichTextTaskItem,
} from '@/types/richText'

const BULLET = '• '
const UNCHECKED = '☐ '
const CHECKED = '☑ '
const INDENT = '  '

function inlineText(content: RichTextInline[] = []): string {
  return content
    .map((node) => {
      if (node.type === 'hardBreak') return '\n'
      const link = node.marks?.find((mark) => mark.type === 'link')
      if (!link || link.type !== 'link') return node.text
      // A labeled link keeps its address in plain text, so exports and older
      // app versions don't lose it.
      const { href } = link.attrs
      const showsAddress =
        findLinks(node.text).length > 0 || /^(?:mailto|tel):/i.test(href)
      return showsAddress ? node.text : `${node.text} (${href})`
    })
    .join('')
}

function prefixLines(text: string, first: string, rest: string): string[] {
  return text.split('\n').map((line, index) => (index ? rest : first) + line)
}

function itemLines(
  item: RichTextListItem | RichTextTaskItem,
  indent: string,
  marker: string
): string[] {
  const [head, ...tail] = item.content
  const lines =
    head?.type === 'paragraph' || head?.type === 'heading'
      ? prefixLines(
          inlineText(head.content),
          indent + marker,
          indent + ' '.repeat(marker.length)
        )
      : [indent + marker.trimEnd()]
  const nested = head?.type === 'paragraph' || head?.type === 'heading'
  const rest = nested ? tail : item.content
  return [
    ...lines,
    ...rest.flatMap((block) => blockLines(block, indent + INDENT)),
  ]
}

function blockLines(block: RichTextBlock, indent: string): string[] {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
      return prefixLines(inlineText(block.content), indent, indent)
    case 'bulletList':
      return block.content.flatMap((item) => itemLines(item, indent, BULLET))
    case 'orderedList': {
      const start = block.attrs?.start ?? 1
      return block.content.flatMap((item, index) =>
        itemLines(item, indent, `${start + index}. `)
      )
    }
    case 'taskList':
      return block.content.flatMap((item) =>
        itemLines(item, indent, item.attrs.checked ? CHECKED : UNCHECKED)
      )
    case 'image':
      return []
  }
}

/**
 * The note as plain text: lines for paragraphs and headings, `•`, `1.` and
 * `☐`/`☑` markers for list items, labeled links followed by their address, and
 * no photos. This is what the record's `note` holds.
 */
export function richTextToPlainText(doc: RichTextDoc): string {
  return doc.content
    .flatMap((block) => blockLines(block, ''))
    .join('\n')
    .trim()
}

function lineToInline(line: string): RichTextInline[] {
  return splitTextWithLinks(line).map((segment) =>
    segment.type === 'text'
      ? { type: 'text', text: segment.text }
      : {
          type: 'text',
          text: segment.text,
          marks: [{ type: 'link', attrs: { href: segment.url } }],
        }
  )
}

/**
 * A plain-text note as a doc: one paragraph per line, with its links linked.
 * `richTextToPlainText` turns it back into the same (trimmed) text.
 */
export function plainTextToRichText(text: string): RichTextDoc {
  const lines = text.replace(/\r\n?/g, '\n').trim().split('\n')
  const content: RichTextBlock[] = lines.map((line) => {
    const inline = line ? lineToInline(line) : []
    return inline.length
      ? { type: 'paragraph', content: inline }
      : { type: 'paragraph' }
  })
  return { type: 'doc', content }
}
