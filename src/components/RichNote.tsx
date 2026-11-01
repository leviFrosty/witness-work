import { useState } from 'react'
import { StyleProp, TextProps, TextStyle, View } from 'react-native'
import RichLinkCard, { useLinkActions } from '@/components/RichLinkCard'
import NoteImageViewer from '@/components/richText/NoteImageViewer'
import NoteThumbnails from '@/components/richText/NoteThumbnails'
import RichTextPreview from '@/components/richText/RichTextPreview'
import { SpanOptions } from '@/components/richText/RichTextSpans'
import RichTextView from '@/components/richText/RichTextView'
import { useItalicFonts } from '@/components/richText/richTextFonts'
import useTheme from '@/contexts/theme'
import {
  isRichTextEmpty,
  richTextHasMark,
  richTextLinks,
  richTextPreviewLines,
  richTextRuns,
  toggleRichTextTask,
  withoutBareLinks,
  type RichTextRun,
} from '@/lib/richText/inspect'
import { getNoteDoc, noteFields, type NoteUpdate } from '@/lib/richText/notes'
import type {
  NoteFields,
  RichTextDoc,
  RichTextImageAttrs,
} from '@/types/richText'

const MAX_CARDS = 3

const THUMBNAIL_LINES = 2

type PreviewRun =
  | { type: 'text'; doc: RichTextDoc; numberOfLines?: number }
  | { type: 'images'; images: RichTextImageAttrs[] }

function previewRuns(
  runs: RichTextRun[],
  numberOfLines: number | undefined
): PreviewRun[] {
  let left = numberOfLines ?? Infinity
  const shown: PreviewRun[] = []
  const leftover: RichTextImageAttrs[] = []
  for (const run of runs) {
    if (run.type === 'images') {
      if (left > 0) shown.push(run)
      else leftover.push(...run.images)
      left -= THUMBNAIL_LINES
      continue
    }
    const lines = richTextPreviewLines(run.doc.content)
    if (!lines || left <= 0) continue
    shown.push({
      type: 'text',
      doc: run.doc,
      numberOfLines: numberOfLines === undefined ? undefined : left,
    })
    left -= lines
  }
  if (leftover.length) shown.push({ type: 'images', images: leftover })
  return shown
}

interface Props {
  note: NoteFields
  style?: StyleProp<TextStyle>

  numberOfLines?: number

  preview?: boolean

  thumbnails?: boolean
  onTextLayout?: TextProps['onTextLayout']

  interactive?: boolean

  nested?: boolean

  linkCards?: boolean

  onChange?: (fields: NoteUpdate) => void
}

const RichNote = ({
  note,
  style,
  numberOfLines,
  preview = numberOfLines !== undefined,
  thumbnails = false,
  onTextLayout,
  interactive = true,
  nested = false,
  linkCards = true,
  onChange,
}: Props) => {
  const theme = useTheme()
  const { open, copy } = useLinkActions()
  const [viewing, setViewing] = useState<RichTextImageAttrs | null>(null)

  const doc = getNoteDoc(note)
  const italicsReady = useItalicFonts(richTextHasMark(doc, 'italic'))
  const cardUrls = linkCards ? richTextLinks(doc).slice(0, MAX_CARDS) : []
  const shown = withoutBareLinks(doc, new Set(cardUrls))

  const spans: SpanOptions = {
    italicsReady,
    linkColor: theme.colors.accent,
    onLinkPress: interactive ? open : undefined,
    onLinkLongPress: interactive ? (url) => void copy(url) : undefined,
  }

  const runs = preview && thumbnails ? richTextRuns(shown) : []
  const previewBody = runs.some((run) => run.type === 'images') ? (
    <View style={{ gap: 6 }}>
      {previewRuns(runs, numberOfLines).map((run, index) =>
        run.type === 'images' ? (
          <NoteThumbnails key={index} images={run.images} />
        ) : (
          <RichTextPreview
            key={index}
            doc={run.doc}
            numberOfLines={run.numberOfLines}
            style={style}
            spans={spans}
          />
        )
      )}
    </View>
  ) : (
    <RichTextPreview
      doc={shown}
      numberOfLines={numberOfLines}
      style={style}
      spans={spans}
      onTextLayout={onTextLayout}
    />
  )
  const body = isRichTextEmpty(shown) ? null : preview ? (
    previewBody
  ) : (
    <RichTextView
      doc={shown}
      style={style}
      spans={spans}
      onToggleTask={
        onChange
          ? (index) => onChange(noteFields(toggleRichTextTask(doc, index)))
          : undefined
      }
      onImagePress={interactive ? setViewing : undefined}
    />
  )

  if (!cardUrls.length) {
    return (
      <>
        {body}
        {viewing && (
          <NoteImageViewer image={viewing} onClose={() => setViewing(null)} />
        )}
      </>
    )
  }

  return (
    <View style={{ gap: 8, alignSelf: 'stretch' }}>
      {body}
      {cardUrls.map((url) => (
        <RichLinkCard
          key={url}
          url={url}
          interactive={interactive && !nested}
        />
      ))}
      {viewing && (
        <NoteImageViewer image={viewing} onClose={() => setViewing(null)} />
      )}
    </View>
  )
}

export default RichNote
