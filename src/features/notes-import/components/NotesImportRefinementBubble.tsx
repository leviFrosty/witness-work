import { RefreshCw as RefreshCwIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { View, type ViewStyle } from 'react-native'
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
  /** Undefined when usage is unavailable; null when refinements are unlimited. */
  remaining?: number | null
  limit?: number | null
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
  limit,
}: Props) => {
  const theme = useTheme()
  const refinementLabel =
    remaining === undefined || limit === undefined
      ? null
      : remaining === null && limit === null
        ? i18n.t('notesImport_refinementMetaUnlimited')
        : i18n.t('notesImport_refinementMeta', { remaining, limit })
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
      {refinementLabel && (
        <View
          style={{
            flexDirection: 'row',
            alignSelf: 'flex-end',
            alignItems: 'center',
            gap: 5,
            paddingRight: 4,
          }}
        >
          <LucideIcon
            icon={RefreshCwIcon}
            size={10}
            color={theme.colors.textAlt}
          />
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('xs'),
            }}
          >
            {refinementLabel}
          </Text>
        </View>
      )}
    </View>
  )
}
