import React, { useMemo } from 'react'
import { TextStyle } from 'react-native'
import { FuseResultMatch } from 'fuse.js'
import Text from '@/components/ui/MyText'
import WholeWordsText from '@/components/ui/WholeWordsText'
import useTheme from '@/contexts/theme'
import { buildSnippet } from '@/lib/contactsSearch'
import { LTR_ISOLATE, ltrIsolate, POP_ISOLATE } from '@/lib/direction'

type Props = {
  /**
   * Fallback text shown when there's no match. When a `match` is provided, the
   * component prefers `match.value` so the rendered string is guaranteed to
   * align with the indices Fuse returned.
   */
  text: string
  match?: FuseResultMatch
  /**
   * When set, windows the text to ~`contextChars` characters either side of the
   * first usable match and prepends/appends an ellipsis when content was
   * trimmed. Omit for short fields where the entire string should render (e.g.
   * a contact's name).
   */
  contextChars?: number
  baseStyle?: TextStyle | TextStyle[]
  highlightStyle?: TextStyle
  numberOfLines?: number
  /**
   * Shrinks the text when a single word would break across lines (a long name
   * at accessibility text sizes); see `WholeWordsText`.
   */
  wholeWords?: boolean
  /**
   * Keeps Latin-only data (a phone number or email) left to right in a
   * right-to-left Language, highlight and ellipses included.
   */
  ltr?: boolean
}

/**
 * Renders text with Fuse match indices bolded inline.
 *
 * Used in two modes:
 *
 * - Whole-field (no `contextChars`) — for contact names where we want the full
 *   string with the matched substring emphasized.
 * - Snippet (`contextChars` set) — for long fields like joined notes, where we
 *   surface a small window around the match with ellipses.
 */
const HighlightedText: React.FC<Props> = ({
  text,
  match,
  contextChars,
  baseStyle,
  highlightStyle,
  numberOfLines,
  wholeWords,
  ltr,
}) => {
  const theme = useTheme()
  const Paragraph = wholeWords ? WholeWordsText : Text
  const sourceText = match?.value ?? text

  const snippet = useMemo(() => {
    if (!match || !match.indices?.length) return null
    return buildSnippet(sourceText, match.indices, contextChars)
  }, [match, sourceText, contextChars])

  const resolvedHighlightStyle: TextStyle = highlightStyle ?? {
    backgroundColor: theme.colors.background,
    borderRadius: 100,
  }

  if (!snippet) {
    return (
      <Paragraph style={baseStyle} numberOfLines={numberOfLines}>
        {ltr ? ltrIsolate(sourceText) : sourceText}
      </Paragraph>
    )
  }

  return (
    <Paragraph style={baseStyle} numberOfLines={numberOfLines}>
      {ltr ? LTR_ISOLATE : ''}
      {snippet.truncatedStart ? '…' : ''}
      {snippet.segments.map((seg, i) =>
        seg.highlighted ? (
          <Text key={i} style={[baseStyle, resolvedHighlightStyle]}>
            {seg.text}
          </Text>
        ) : (
          seg.text
        )
      )}
      {snippet.truncatedEnd ? '…' : ''}
      {ltr ? POP_ISOLATE : ''}
    </Paragraph>
  )
}

export default HighlightedText
