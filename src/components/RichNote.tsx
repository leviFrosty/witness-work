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
/** About how many lines of text a row of thumbnails stands in for. */
const THUMBNAIL_LINES = 2

type PreviewRun =
  | { type: 'text'; doc: RichTextDoc; numberOfLines?: number }
  | { type: 'images'; images: RichTextImageAttrs[] }

/**
 * The runs that fit in `numberOfLines`, in the note's order. Photos past the
 * clamp still show, in one row at the end.
 */
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
  /** The record (or its note fields) whose note to show. */
  note: NoteFields
  style?: StyleProp<TextStyle>
  /** Clamps the note to one squeezed `Text`, without photos. */
  numberOfLines?: number
  /** The squeezed `Text` without a clamp, e.g. to measure how long it is. */
  preview?: boolean
  /** In a preview, small photos under the text (which leaves them out). */
  thumbnails?: boolean
  onTextLayout?: TextProps['onTextLayout']
  /**
   * Off when the note sits inside another long-press target (e.g. a Plan row):
   * links, photos and link cards don't take touches; the host offers links in
   * its menu.
   */
  interactive?: boolean
  /**
   * The host is itself a context-menu row (e.g. a visit card). Links and photos
   * still take taps, but link cards don't get menus of their own: a native
   * context menu inside another one lays its content out unbounded.
   */
  nested?: boolean
  /** Links shown as preview cards under the note (up to three). */
  linkCards?: boolean
  /** Saves a ticked checklist item. Without it, checklists are read-only. */
  onChange?: (fields: NoteUpdate) => void
}

/**
 * A note as it reads: formatting, lists, checklists and photos, with its links
 * shown as rich preview cards. Bare links written out as addresses become the
 * cards; labeled links stay in the text too.
 */
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
    // Stretch: a host that sizes to content would let a long card title run
    // past the edge.
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
