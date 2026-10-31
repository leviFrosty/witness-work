import type {
  BlockContent,
  DefinitionContent,
  List,
  ListItem,
  PhrasingContent,
  RootContent,
} from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmStrikethroughFromMarkdown } from 'mdast-util-gfm-strikethrough'
import { gfmStrikethrough } from 'micromark-extension-gfm-strikethrough'
import type {
  RichTextBlock,
  RichTextDoc,
  RichTextInline,
  RichTextListItem,
  RichTextMark,
} from './types.ts'

/** An answer used Markdown the app can't render. */
export class AnswerMarkdownError extends Error {}

const ALLOWED_SUMMARY =
  'paragraphs, # and ## headings, bold, italic, ~~strike~~, links, line breaks, and bulleted or numbered lists'

function unsupported(what: string, line?: number): never {
  throw new AnswerMarkdownError(
    `${what}${line ? ` (line ${line})` : ''} isn't supported in answers. Use only ${ALLOWED_SUMMARY}.`
  )
}

/**
 * Turns a link target into an absolute URL the app can open: `https:`,
 * `mailto:`, or a site path (`/privacy`, `/help/…`), which becomes absolute on
 * the site origin. `//host` isn't a site path, and the old site's
 * `/witness-work/…` paths don't exist here.
 */
function resolveHref(url: string, siteUrl: string, line?: number): string {
  if (/^https:\/\//i.test(url) || /^mailto:/i.test(url)) return url
  if (
    url.startsWith('/') &&
    !url.startsWith('//') &&
    !/^\/witness-work(\/|$)/i.test(url)
  )
    return new URL(url, siteUrl).href
  unsupported(`The link "${url}" (use https:, mailto:, or a /path)`, line)
}

function sameMarks(a?: RichTextMark[], b?: RichTextMark[]) {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
}

function inline(
  nodes: PhrasingContent[],
  marks: RichTextMark[],
  siteUrl: string,
  out: RichTextInline[] = []
): RichTextInline[] {
  for (const node of nodes) {
    const line = node.position?.start.line
    switch (node.type) {
      case 'text': {
        // Markdown keeps soft line breaks as "\n"; they render as spaces.
        const text = node.value.replace(/\s*\n\s*/g, ' ')
        if (!text) break
        const last = out.at(-1)
        if (last?.type === 'text' && sameMarks(last.marks, marks)) {
          last.text += text
        } else {
          out.push(
            marks.length
              ? { type: 'text', text, marks: [...marks] }
              : { type: 'text', text }
          )
        }
        break
      }
      case 'strong':
        inline(node.children, [...marks, { type: 'bold' }], siteUrl, out)
        break
      case 'emphasis':
        inline(node.children, [...marks, { type: 'italic' }], siteUrl, out)
        break
      case 'delete':
        inline(node.children, [...marks, { type: 'strike' }], siteUrl, out)
        break
      case 'link':
        inline(
          node.children,
          [
            ...marks.filter((mark) => mark.type !== 'link'),
            {
              type: 'link',
              attrs: { href: resolveHref(node.url, siteUrl, line) },
            },
          ],
          siteUrl,
          out
        )
        break
      case 'break':
        out.push({ type: 'hardBreak' })
        break
      case 'inlineCode':
        unsupported('Inline code', line)
      case 'image':
      case 'imageReference':
        unsupported('An image', line)
      case 'html':
        unsupported('HTML', line)
      case 'linkReference':
        unsupported('A reference-style link', line)
      default:
        unsupported(`"${node.type}"`, line)
    }
  }
  return out
}

function trimInline(content: RichTextInline[]): RichTextInline[] {
  const first = content[0]
  if (first?.type === 'text') first.text = first.text.trimStart()
  const last = content.at(-1)
  if (last?.type === 'text') last.text = last.text.trimEnd()
  return content.filter((node) => node.type !== 'text' || node.text)
}

function listItem(item: ListItem, siteUrl: string): RichTextListItem {
  // Without the GFM task-list extension, "- [ ] task" parses as text.
  const first = item.children[0]
  const lead = first?.type === 'paragraph' ? first.children[0] : undefined
  if (
    (item.checked !== null && item.checked !== undefined) ||
    (lead?.type === 'text' && /^\[[ xX]\]\s/.test(lead.value))
  ) {
    unsupported('A checklist', item.position?.start.line)
  }
  const content = item.children.map((child) => block(child, siteUrl))
  return {
    type: 'listItem',
    content: content.length ? content : [{ type: 'paragraph' }],
  }
}

function list(node: List, siteUrl: string): RichTextBlock {
  const content = node.children.map((item) => listItem(item, siteUrl))
  if (node.ordered) {
    const start = node.start ?? 1
    return start === 1
      ? { type: 'orderedList', content }
      : { type: 'orderedList', attrs: { start }, content }
  }
  return { type: 'bulletList', content }
}

function block(
  node: RootContent | BlockContent | DefinitionContent,
  siteUrl: string
): RichTextBlock {
  const line = node.position?.start.line
  switch (node.type) {
    case 'paragraph':
      return {
        type: 'paragraph',
        content: trimInline(inline(node.children, [], siteUrl)),
      }
    case 'heading':
      if (node.depth > 2) unsupported(`A level-${node.depth} heading`, line)
      return {
        type: 'heading',
        attrs: { level: node.depth as 1 | 2 },
        content: trimInline(inline(node.children, [], siteUrl)),
      }
    case 'list':
      return list(node, siteUrl)
    case 'code':
      unsupported('A code block', line)
    case 'blockquote':
      unsupported('A blockquote', line)
    case 'html':
      unsupported('HTML', line)
    case 'thematicBreak':
      unsupported('A horizontal rule', line)
    case 'table':
      unsupported('A table', line)
    case 'definition':
      unsupported('A link definition', line)
    default:
      unsupported(`"${node.type}"`, line)
  }
}

/** Converts an answer's Markdown to the app's rich text document. */
export function markdownToDoc(markdown: string, siteUrl: string): RichTextDoc {
  const tree = fromMarkdown(markdown, {
    extensions: [gfmStrikethrough({ singleTilde: false })],
    mdastExtensions: [gfmStrikethroughFromMarkdown()],
  })
  const content = tree.children
    .filter((node) => node.type !== 'yaml')
    .map((node) => block(node, siteUrl))
  if (content.length === 0)
    throw new AnswerMarkdownError('The answer is empty.')
  return { type: 'doc', content }
}

const BULLET = '• '
const INDENT = '  '

function inlineText(content: RichTextInline[] = []): string {
  return content
    .map((node) => {
      if (node.type === 'hardBreak') return '\n'
      const link = node.marks?.find((mark) => mark.type === 'link')
      if (!link || link.type !== 'link') return node.text
      // Like the app's plain text: a labeled link keeps its address.
      const { href } = link.attrs
      const showsAddress =
        node.text.includes(href.replace(/^mailto:/i, '')) ||
        /^mailto:/i.test(href)
      return showsAddress ? node.text : `${node.text} (${href})`
    })
    .join('')
}

function prefixLines(text: string, first: string, rest: string): string[] {
  return text.split('\n').map((line, index) => (index ? rest : first) + line)
}

function itemLines(
  item: RichTextListItem,
  indent: string,
  marker: string
): string[] {
  const [head, ...tail] = item.content
  const hasText = head?.type === 'paragraph' || head?.type === 'heading'
  const lines = hasText
    ? prefixLines(
        inlineText(head.content),
        indent + marker,
        indent + ' '.repeat(marker.length)
      )
    : [indent + marker.trimEnd()]
  const rest = hasText ? tail : item.content
  return [...lines, ...rest.flatMap((b) => blockLines(b, indent + INDENT))]
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
  }
}

/**
 * The answer as plain text, matching the app's rich text plain-text form: `•`
 * and `1.` list markers, and labeled links followed by their address.
 */
export function docToPlainText(doc: RichTextDoc): string {
  return doc.content
    .map((b) => blockLines(b, '').join('\n'))
    .join('\n\n')
    .trim()
}
