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
  richTextImages,
  richTextLinks,
  toggleRichTextTask,
  withoutBareLinks,
  withoutRichTextImages,
} from '@/lib/richText/inspect'
import { getNoteDoc, noteFields, type NoteUpdate } from '@/lib/richText/notes'
import type { NoteFields, RichTextImageAttrs } from '@/types/richText'

const MAX_CARDS = 3

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

  const images = preview && thumbnails ? richTextImages(doc) : []
  const previewText = (
    <RichTextPreview
      doc={images.length ? withoutRichTextImages(shown) : shown}
      numberOfLines={numberOfLines}
      style={style}
      spans={spans}
      onTextLayout={onTextLayout}
    />
  )
  const body = isRichTextEmpty(shown) ? null : preview ? (
    images.length ? (
      <View style={{ gap: 6 }}>
        {previewText}
        <NoteThumbnails images={images} />
      </View>
    ) : (
      previewText
    )
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
