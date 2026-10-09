import { Fragment, ReactNode } from 'react'
import { StyleProp, Text as RNText, TextProps, TextStyle } from 'react-native'
import Text from '@/components/ui/MyText'
import { RichTextSpans, SpanOptions } from '@/components/richText/RichTextSpans'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { richTextImages } from '@/lib/richText/inspect'
import type { RichTextBlock, RichTextDoc } from '@/types/richText'

const BULLET = '• '

type Line = { key: string; node: ReactNode }

function inline(
  block: RichTextBlock,
  spans: SpanOptions,
  boldFont: string
): ReactNode {
  if (block.type === 'heading') {
    return (
      <RNText style={{ fontFamily: boldFont }}>
        <RichTextSpans content={block.content} options={spans} />
      </RNText>
    )
  }
  return block.type === 'paragraph' ? (
    <RichTextSpans content={block.content} options={spans} />
  ) : null
}

function lines(
  blocks: RichTextBlock[],
  spans: SpanOptions,
  boldFont: string,
  indent: string,
  key: string
): Line[] {
  return blocks.flatMap((block, index): Line[] => {
    const blockKey = `${key}.${index}`
    switch (block.type) {
      case 'paragraph':
      case 'heading':
        return block.content?.length
          ? [
              {
                key: blockKey,
                node: (
                  <>
                    {indent}
                    {inline(block, spans, boldFont)}
                  </>
                ),
              },
            ]
          : []
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        return block.content.flatMap((item, itemIndex) => {
          const itemKey = `${blockKey}.${itemIndex}`
          const marker =
            item.type === 'taskItem'
              ? item.attrs.checked
                ? '☑ '
                : '☐ '
              : block.type === 'orderedList'
                ? `${(block.attrs?.start ?? 1) + itemIndex}. `
                : BULLET
          const [head, ...tail] = item.content
          const hasHead = head?.type === 'paragraph' || head?.type === 'heading'
          return [
            {
              key: itemKey,
              node: (
                <>
                  {indent}
                  {marker}
                  {hasHead ? inline(head, spans, boldFont) : null}
                </>
              ),
            },
            ...lines(
              hasHead ? tail : item.content,
              spans,
              boldFont,
              `${indent}  `,
              itemKey
            ),
          ]
        })
      case 'image':
        return []
    }
  })
}

/**
 * A rich note squeezed into one `Text` so it can be clamped with
 * `numberOfLines`: each block on its own line, list markers inline, and photos
 * left out (a photo-only note says how many photos it has).
 */
const RichTextPreview = (props: {
  doc: RichTextDoc
  numberOfLines?: number
  style?: StyleProp<TextStyle>
  spans: SpanOptions
  onTextLayout?: TextProps['onTextLayout']
}) => {
  const theme = useTheme()
  const content = lines(
    props.doc.content,
    props.spans,
    theme.fonts.bold,
    '',
    'b'
  )

  if (!content.length) {
    const count = richTextImages(props.doc).length
    if (!count) return null
    return (
      <Text
        style={[props.style, { color: theme.colors.textAlt }]}
        numberOfLines={props.numberOfLines}
      >
        {
          // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
          i18n.t('richText_photoCount', { count })
        }
      </Text>
    )
  }

  return (
    <Text
      style={props.style}
      numberOfLines={props.numberOfLines}
      onTextLayout={props.onTextLayout}
    >
      {content.map((line, index) => (
        <Fragment key={line.key}>
          {index > 0 && '\n'}
          {line.node}
        </Fragment>
      ))}
    </Text>
  )
}

export default RichTextPreview
