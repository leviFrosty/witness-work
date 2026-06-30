import { View, type ViewStyle } from 'react-native'
import { faArrowsRotate } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

type Theme = ReturnType<typeof useTheme>

/**
 * The shared visual treatment for a user-authored chat bubble — both the pasted
 * notes and every refinement instruction — so the two never drift apart. The
 * caller supplies the layout context (alignSelf/maxWidth); the refinement
 * variant wraps it to stack a credit caption beneath.
 */
export const notesImportUserBubbleStyle = (theme: Theme): ViewStyle => ({
  borderRadius: 20,
  borderBottomRightRadius: 4,
  borderCurve: 'continuous',
  backgroundColor: theme.colors.accentBubble,
  paddingHorizontal: 16,
  paddingVertical: 12,
})

interface Props {
  /** The refinement instruction the user sent, verbatim. */
  instruction: string
  /** Refinements left for this source text after this one was spent. */
  remaining: number
}

/**
 * A refinement instruction in the conversation thread. It is the user's OWN
 * message, so it renders identically to their pasted notes (a right-aligned
 * accent bubble) with a quiet caption noting it spent one of this import's
 * refinement credits. It is deliberately NOT dressed as an AI response: the
 * "preview updated" confirmation is Scribe AI's reply that streams in beneath
 * it, so this bubble carries no checkmark and no "Scribe AI" label — those
 * would claim a result the moment the user hit send, before one exists.
 */
export const NotesImportRefinementBubble = ({
  instruction,
  remaining,
}: Props) => {
  const theme = useTheme()
  return (
    <View style={{ alignSelf: 'flex-end', maxWidth: '86%', gap: 4 }}>
      <View style={notesImportUserBubbleStyle(theme)}>
        <Text
          style={{
            color: theme.colors.text,
            fontSize: theme.fontSize('md'),
            lineHeight: 21,
          }}
        >
          {instruction}
        </Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignSelf: 'flex-end',
          alignItems: 'center',
          gap: 5,
          paddingRight: 4,
        }}
      >
        <FontAwesomeIcon
          icon={faArrowsRotate}
          size={10}
          color={theme.colors.textAlt}
        />
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('xs'),
          }}
        >
          {i18n.t('notesImport_refinementMeta', { remaining })}
        </Text>
      </View>
    </View>
  )
}
