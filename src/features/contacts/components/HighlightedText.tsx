import React, { useMemo } from 'react'
import { TextStyle } from 'react-native'
import { FuseResultMatch } from 'fuse.js'
import Text from '../../../components/MyText'
import useTheme from '../../../contexts/theme'
import { buildSnippet } from '../lib/contactsSearch'

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
}) => {
  const theme = useTheme()
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
      <Text style={baseStyle} numberOfLines={numberOfLines}>
        {sourceText}
      </Text>
    )
  }

  return (
    <Text style={baseStyle} numberOfLines={numberOfLines}>
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
    </Text>
  )
}

export default HighlightedText
