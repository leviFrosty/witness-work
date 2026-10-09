import { Text, TextStyle } from 'react-native'
import { markFontStyle } from '@/components/richText/richTextFonts'
import i18n from '@/lib/locales'
import type { RichTextInline } from '@/types/richText'

export type SpanOptions = {
  italicsReady: boolean
  linkColor: string
  /** Links open on tap and copy on long press; off inside other press targets. */
  onLinkPress?: (href: string) => void
  onLinkLongPress?: (href: string) => void
}

function spanStyle(
  node: Extract<RichTextInline, { type: 'text' }>,
  options: SpanOptions
): { style: TextStyle | undefined; href?: string } {
  let bold = false
  let italic = false
  let underline = false
  let strike = false
  let href: string | undefined
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') bold = true
    else if (mark.type === 'italic') italic = true
    else if (mark.type === 'underline') underline = true
    else if (mark.type === 'strike') strike = true
    else if (mark.type === 'link') href = mark.attrs.href
  }
  if (!bold && !italic && !underline && !strike && !href) {
    return { style: undefined }
  }
  const decoration =
    underline || href
      ? strike
        ? 'underline line-through'
        : 'underline'
      : strike
        ? 'line-through'
        : undefined
  return {
    href,
    style: {
      ...markFontStyle(bold, italic, options.italicsReady),
      ...(decoration && { textDecorationLine: decoration }),
      ...(href && { color: options.linkColor }),
    },
  }
}

/**
 * A paragraph's text as nested `Text` spans. They inherit the size and color of
 * the `Text` they're placed in, and add their marks on top.
 */
export function RichTextSpans(props: {
  content: RichTextInline[] | undefined
  options: SpanOptions
}) {
  return (props.content ?? []).map((node, index) => {
    if (node.type === 'hardBreak') return '\n'
    const { style, href } = spanStyle(node, props.options)
    if (!style) return node.text
    const { onLinkPress, onLinkLongPress } = props.options
    const pressable = href && onLinkPress
    return (
      <Text
        key={index}
        style={style}
        accessibilityRole={pressable ? 'link' : undefined}
        accessibilityHint={pressable ? i18n.t('richLink_hint') : undefined}
        onPress={pressable ? () => onLinkPress(href) : undefined}
        onLongPress={
          href && onLinkLongPress ? () => onLinkLongPress(href) : undefined
        }
      >
        {node.text}
      </Text>
    )
  })
}

/** Whether any span needs the italic faces. */
export function usesItalics(content: RichTextInline[] | undefined): boolean {
  return (content ?? []).some(
    (node) =>
      node.type === 'text' && node.marks?.some((mark) => mark.type === 'italic')
  )
}
