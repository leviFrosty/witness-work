import { ReactNode } from 'react'
import { StyleProp, TextStyle, View } from 'react-native'
import {
  Square as SquareIcon,
  SquareCheck as SquareCheckIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import NoteImage from '@/components/richText/NoteImage'
import { RichTextSpans, SpanOptions } from '@/components/richText/RichTextSpans'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type {
  RichTextBlock,
  RichTextDoc,
  RichTextImageAttrs,
  RichTextListItem,
  RichTextTaskItem,
} from '@/types/richText'

const BLOCK_GAP = 6
const ITEM_GAP = 4
const MARKER_WIDTH = 22
const BULLETS = ['•', '◦', '▪']

type Context = {
  theme: ReturnType<typeof useTheme>
  base: StyleProp<TextStyle>
  spans: SpanOptions
  showImages: boolean
  onToggleTask?: (index: number) => void
  onImagePress?: (image: RichTextImageAttrs) => void
  /** Counts checklist items in reading order, matching `toggleRichTextTask`. */
  taskIndex: { value: number }
}

function headingStyle(level: 1 | 2, ctx: Context): TextStyle {
  return {
    fontFamily: ctx.theme.fonts.bold,
    fontSize: ctx.theme.fontSize(level === 1 ? 'xl' : 'lg'),
  }
}

function renderBlocks(
  blocks: RichTextBlock[],
  ctx: Context,
  depth: number
): ReactNode[] {
  return blocks.map((block, index) => {
    switch (block.type) {
      case 'paragraph':
        return (
          <Text key={index} style={ctx.base}>
            {block.content?.length ? (
              <RichTextSpans content={block.content} options={ctx.spans} />
            ) : (
              ' '
            )}
          </Text>
        )
      case 'heading':
        return (
          <Text
            key={index}
            accessibilityRole='header'
            style={[ctx.base, headingStyle(block.attrs.level, ctx)]}
          >
            <RichTextSpans content={block.content} options={ctx.spans} />
          </Text>
        )
      case 'bulletList':
      case 'orderedList':
        return (
          <View key={index} style={{ gap: ITEM_GAP }}>
            {block.content.map((item, itemIndex) => (
              <ListRow
                key={itemIndex}
                marker={
                  <Text style={[ctx.base, { textAlign: 'right' }]}>
                    {block.type === 'bulletList'
                      ? BULLETS[depth % BULLETS.length]
                      : `${(block.attrs?.start ?? 1) + itemIndex}.`}
                  </Text>
                }
              >
                {renderItem(item, ctx, depth)}
              </ListRow>
            ))}
          </View>
        )
      case 'taskList':
        return (
          <View key={index} style={{ gap: ITEM_GAP }}>
            {block.content.map((item, itemIndex) => {
              const taskIndex = ++ctx.taskIndex.value
              return (
                <ListRow
                  key={itemIndex}
                  marker={
                    <TaskBox
                      checked={item.attrs.checked}
                      ctx={ctx}
                      onPress={
                        ctx.onToggleTask
                          ? () => ctx.onToggleTask?.(taskIndex)
                          : undefined
                      }
                    />
                  }
                >
                  {renderItem(item, ctx, depth)}
                </ListRow>
              )
            })}
          </View>
        )
      case 'image':
        return ctx.showImages ? (
          <NoteImage
            key={index}
            image={block.attrs}
            onPress={
              ctx.onImagePress
                ? () => ctx.onImagePress?.(block.attrs)
                : undefined
            }
          />
        ) : null
    }
  })
}

function renderItem(
  item: RichTextListItem | RichTextTaskItem,
  ctx: Context,
  depth: number
): ReactNode {
  const checked = item.type === 'taskItem' && item.attrs.checked
  const itemCtx: Context = checked
    ? {
        ...ctx,
        base: [
          ctx.base,
          {
            color: ctx.theme.colors.textAlt,
            textDecorationLine: 'line-through',
          },
        ],
      }
    : ctx
  return renderBlocks(item.content, itemCtx, depth + 1)
}

function ListRow(props: { marker: ReactNode; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      <View style={{ width: MARKER_WIDTH, alignItems: 'flex-end' }}>
        {props.marker}
      </View>
      <View style={{ flex: 1, gap: ITEM_GAP }}>{props.children}</View>
    </View>
  )
}

function TaskBox(props: {
  checked: boolean
  ctx: Context
  onPress?: () => void
}) {
  const { theme } = props.ctx
  const Icon = props.checked ? SquareCheckIcon : SquareIcon
  const icon = (
    <Icon
      size={18}
      color={props.checked ? theme.colors.accent : theme.colors.textAlt}
    />
  )
  if (!props.onPress) {
    return <View style={{ paddingTop: 1 }}>{icon}</View>
  }
  return (
    <Button
      onPress={props.onPress}
      hitSlop={10}
      accessibilityRole='checkbox'
      accessibilityState={{ checked: props.checked }}
      accessibilityLabel={i18n.t('richText_checklistItem')}
      style={{ paddingTop: 1 }}
    >
      {icon}
    </Button>
  )
}

/**
 * A rich note, drawn with native views: headings, lists, checklists, photos and
 * styled text. Read-only, except that checklist items can be ticked when
 * `onToggleTask` is set.
 */
const RichTextView = (props: {
  doc: RichTextDoc
  style?: StyleProp<TextStyle>
  spans: SpanOptions
  showImages?: boolean
  onToggleTask?: (index: number) => void
  onImagePress?: (image: RichTextImageAttrs) => void
}) => {
  const theme = useTheme()
  const ctx: Context = {
    theme,
    base: props.style,
    spans: props.spans,
    showImages: props.showImages ?? true,
    onToggleTask: props.onToggleTask,
    onImagePress: props.onImagePress,
    taskIndex: { value: -1 },
  }
  return (
    <View style={{ gap: BLOCK_GAP }}>
      {renderBlocks(props.doc.content, ctx, 0)}
    </View>
  )
}

export default RichTextView
