import type {
  BlockContent,
  DefinitionContent,
  List,
  ListItem,
  PhrasingContent,
  RootContent,
} from 'mdast'
import { cjkFriendlyExtension } from 'micromark-extension-cjk-friendly'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmStrikethroughFromMarkdown } from 'mdast-util-gfm-strikethrough'
import { gfmStrikethrough } from 'micromark-extension-gfm-strikethrough'
import type {
  RichTextBlock,
  RichTextImage,
  RichTextDoc,
  RichTextInline,
  RichTextListItem,
  RichTextMark,
} from './types.ts'

export class AnswerMarkdownError extends Error {}

const ALLOWED_SUMMARY =
  'paragraphs, # and ## headings, bold, italic, ~~strike~~, links, line breaks, bulleted or numbered lists, and screenshots in their own paragraph'

/** A screenshot in `content/help/images`, as the site serves it. */
export type HelpImage = {
  /** The file name answers use: `submit-report.webp`. */
  name: string
  /** Absolute URL of the served copy, whose name carries a content hash. */
  src: string
  width: number
  height: number
  /** Stable id for the image block: `help-` plus the content hash. */
  id: string
}

export type ImageLookup = (name: string) => HelpImage | undefined

type Context = { siteUrl: string; images: ImageLookup }

export const IMAGE_NAME = /^[a-z0-9][a-z0-9-]*\.webp$/

function unsupported(what: string, line?: number): never {
  throw new AnswerMarkdownError(
    `${what}${line ? ` (line ${line})` : ''} isn't supported in answers. Use only ${ALLOWED_SUMMARY}.`
  )
}

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
        unsupported(
          'An image inside text (put it in a paragraph of its own)',
          line
        )
      case 'imageReference':
        unsupported('A reference-style image', line)
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

function image(
  node: Extract<PhrasingContent, { type: 'image' }>,
  ctx: Context
): RichTextImage {
  const line = node.position?.start.line
  if (!IMAGE_NAME.test(node.url))
    unsupported(
      `The image "${node.url}" (use the file name of a .webp in content/help/images, like submit-report.webp)`,
      line
    )
  const found = ctx.images(node.url)
  if (!found)
    throw new AnswerMarkdownError(
      `content/help/images/${node.url} doesn't exist${line ? ` (line ${line})` : ''}. Add it with pnpm help:image.`
    )
  const alt = node.alt?.trim()
  if (!alt)
    throw new AnswerMarkdownError(
      `The image ${node.url}${line ? ` (line ${line})` : ''} needs a description: ![What the screen shows](${node.url})`
    )
  return {
    type: 'image',
    attrs: {
      id: found.id,
      src: found.src,
      alt,
      width: found.width,
      height: found.height,
    },
  }
}

function listItem(item: ListItem, ctx: Context): RichTextListItem {
  const first = item.children[0]
  const lead = first?.type === 'paragraph' ? first.children[0] : undefined
  if (
    (item.checked !== null && item.checked !== undefined) ||
    (lead?.type === 'text' && /^\[[ xX]\]\s/.test(lead.value))
  ) {
    unsupported('A checklist', item.position?.start.line)
  }
  const content = item.children.map((child) => block(child, ctx))
  return {
    type: 'listItem',
    content: content.length ? content : [{ type: 'paragraph' }],
  }
}

function list(node: List, ctx: Context): RichTextBlock {
  const content = node.children.map((item) => listItem(item, ctx))
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
  ctx: Context
): RichTextBlock {
  const line = node.position?.start.line
  const { siteUrl } = ctx
  switch (node.type) {
    case 'paragraph': {
      const parts = node.children.filter(
        (child) => child.type !== 'text' || child.value.trim()
      )
      if (parts.length === 1 && parts[0]!.type === 'image')
        return image(parts[0]!, ctx)
      return {
        type: 'paragraph',
        content: trimInline(inline(node.children, [], siteUrl)),
      }
    }
    case 'heading':
      if (node.depth > 2) unsupported(`A level-${node.depth} heading`, line)
      return {
        type: 'heading',
        attrs: { level: node.depth as 1 | 2 },
        content: trimInline(inline(node.children, [], siteUrl)),
      }
    case 'list':
      return list(node, ctx)
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

export function markdownToDoc(
  markdown: string,
  siteUrl: string,
  images: ImageLookup = () => undefined
): RichTextDoc {
  const ctx: Context = { siteUrl, images }
  const tree = fromMarkdown(markdown, {
    // Bold and italic close next to Chinese, Japanese and Korean punctuation
    // ("**设置：**请"), which plain CommonMark leaves as literal stars.
    extensions: [
      gfmStrikethrough({ singleTilde: false }),
      cjkFriendlyExtension(),
    ],
    mdastExtensions: [gfmStrikethroughFromMarkdown()],
  })
  const content = tree.children
    .filter((node) => node.type !== 'yaml')
    .map((node) => block(node, ctx))
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
    case 'image':
      return []
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

export function docToPlainText(doc: RichTextDoc): string {
  return doc.content
    .map((b) => blockLines(b, '').join('\n'))
    .filter((text) => text !== '')
    .join('\n\n')
    .trim()
}

/**
 * The answer's Markdown with each screenshot's file name swapped for the URL
 * the site serves it at, for the `.md` alternates and llms-full.txt.
 */
export function markdownWithImageUrls(
  markdown: string,
  images: ImageLookup
): string {
  return markdown.replace(
    /!\[([^\]]*)\]\(([^)\s]+)\)/g,
    (whole, alt: string, name: string) => {
      const found = images(name)
      return found ? `![${alt}](${found.src})` : whole
    }
  )
}
