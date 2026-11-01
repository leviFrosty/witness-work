import React, { useMemo } from 'react'
import { TextStyle } from 'react-native'
import { FuseResultMatch } from 'fuse.js'
import Text from '@/components/ui/MyText'
import WholeWordsText from '@/components/ui/WholeWordsText'
import useTheme from '@/contexts/theme'
import { buildSnippet } from '@/lib/contactsSearch'
import { LTR_ISOLATE, ltrIsolate, POP_ISOLATE } from '@/lib/direction'

type Props = {
  text: string
  match?: FuseResultMatch

  contextChars?: number
  baseStyle?: TextStyle | TextStyle[]
  highlightStyle?: TextStyle
  numberOfLines?: number

  wholeWords?: boolean

  ltr?: boolean
}

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
