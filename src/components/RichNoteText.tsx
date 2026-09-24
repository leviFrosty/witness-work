import { Fragment } from 'react'
import { StyleProp, Text as RNText, TextStyle, View } from 'react-native'
import Text from '@/components/ui/MyText'
import RichLinkCard, { useLinkActions } from '@/components/RichLinkCard'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { findLinks, splitTextWithLinks } from '@/lib/linkPreview'

const MAX_CARDS = 3

type Part = { type: 'text'; text: string } | { type: 'link'; url: string }

/** Tidies the gaps left behind after links are lifted out into cards. */
function collapseWhitespace(parts: Part[]): Part[] {
  const tidied = parts
    .map((part) =>
      part.type === 'text'
        ? {
            ...part,
            text: part.text
              .replace(/[ \t]{2,}/g, ' ')
              .replace(/[ \t]+\n/g, '\n')
              .replace(/\n[ \t]+/g, '\n')
              .replace(/\n{3,}/g, '\n\n'),
          }
        : part
    )
    .filter((part) => part.type === 'link' || part.text.length > 0)

  const first = tidied[0]
  if (first?.type === 'text') first.text = first.text.trimStart()
  const last = tidied[tidied.length - 1]
  if (last?.type === 'text') last.text = last.text.trimEnd()
  return tidied.filter((part) => part.type === 'link' || part.text.length > 0)
}

interface Props {
  text: string
  style?: StyleProp<TextStyle>
  numberOfLines?: number
}

/**
 * Renders a note's plain text with its links shown as rich preview cards (up to
 * three). Links beyond that stay inline as tappable text.
 */
const RichNoteText = ({ text, style, numberOfLines }: Props) => {
  const theme = useTheme()
  const { open, copy } = useLinkActions()

  const cardUrls = findLinks(text).slice(0, MAX_CARDS)
  if (cardUrls.length === 0) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    )
  }

  const cardSet = new Set(cardUrls)
  const merged: Part[] = []
  for (const segment of splitTextWithLinks(text)) {
    const part: Part =
      segment.type === 'link' && cardSet.has(segment.url)
        ? { type: 'text', text: ' ' }
        : segment
    const previous = merged[merged.length - 1]
    if (part.type === 'text' && previous?.type === 'text') {
      previous.text += part.text
    } else {
      merged.push({ ...part })
    }
  }
  const parts = collapseWhitespace(merged)

  return (
    <View style={{ gap: 8 }}>
      {parts.length > 0 && (
        <Text style={style} numberOfLines={numberOfLines}>
          {parts.map((part, index) =>
            part.type === 'text' ? (
              <Fragment key={index}>{part.text}</Fragment>
            ) : (
              <RNText
                key={index}
                accessibilityRole='link'
                accessibilityHint={i18n.t('richLink_hint')}
                onPress={() => open(part.url)}
                onLongPress={() => void copy(part.url)}
                style={{
                  color: theme.colors.accent,
                  textDecorationLine: 'underline',
                }}
              >
                {part.url}
              </RNText>
            )
          )}
        </Text>
      )}
      {cardUrls.map((url) => (
        <RichLinkCard key={url} url={url} />
      ))}
    </View>
  )
}

export default RichNoteText
