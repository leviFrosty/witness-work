import { Fragment } from 'react'
import { StyleProp, Text as RNText, TextStyle, View } from 'react-native'
import Text from '@/components/ui/MyText'
import RichLinkCard, { useLinkActions } from '@/components/RichLinkCard'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { splitNoteForCards } from '@/lib/linkPreview'

interface Props {
  text: string
  style?: StyleProp<TextStyle>
  numberOfLines?: number
  /**
   * Off when the note sits inside another long-press target (e.g. a Plan row):
   * links render as plain content and the host offers them in its menu.
   */
  interactive?: boolean
}

/**
 * Renders a note's plain text with its links shown as rich preview cards (up to
 * three). Links beyond that stay inline as tappable text.
 */
const RichNoteText = ({
  text,
  style,
  numberOfLines,
  interactive = true,
}: Props) => {
  const theme = useTheme()
  const { open, copy } = useLinkActions()

  const { cardUrls, parts } = splitNoteForCards(text)
  if (cardUrls.length === 0) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    )
  }

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
                accessibilityRole={interactive ? 'link' : undefined}
                accessibilityHint={
                  interactive ? i18n.t('richLink_hint') : undefined
                }
                onPress={interactive ? () => open(part.url) : undefined}
                onLongPress={
                  interactive ? () => void copy(part.url) : undefined
                }
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
        <RichLinkCard key={url} url={url} interactive={interactive} />
      ))}
    </View>
  )
}

export default RichNoteText
