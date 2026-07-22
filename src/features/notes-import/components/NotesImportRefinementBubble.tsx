import { RefreshCw as RefreshCwIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { View, type ViewStyle } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

type Theme = ReturnType<typeof useTheme>

/**
 * Shared visual treatment for user-authored chat bubbles: both the pasted notes
 * and every refinement instruction.
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
}

/** A user-authored refinement instruction in the conversation thread. */
export const NotesImportRefinementBubble = ({ instruction }: Props) => {
  const theme = useTheme()
  return (
    <View style={{ alignSelf: 'flex-end', maxWidth: '86%' }}>
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
    </View>
  )
}

interface MetaProps {
  /** Undefined when usage is unavailable; null when refinements are unlimited. */
  remaining?: number | null
  limit?: number | null
}

/** Quiet allowance metadata shown only beneath the active Scribe AI turn. */
export const NotesImportRefinementMeta = ({ remaining, limit }: MetaProps) => {
  const theme = useTheme()
  if (remaining === undefined || limit === undefined) return null

  const label =
    remaining === null && limit === null
      ? i18n.t('notesImport_refinementMetaUnlimited')
      : i18n.t('notesImport_refinementMeta', { remaining, limit })

  return (
    <View
      style={{
        flexDirection: 'row',
        alignSelf: 'flex-start',
        alignItems: 'center',
        gap: 5,
        // Align with the AI content column: 42pt avatar + 12pt row gap.
        paddingLeft: 54,
      }}
    >
      <LucideIcon icon={RefreshCwIcon} size={10} color={theme.colors.textAlt} />
      <Text
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('xs'),
        }}
      >
        {label}
      </Text>
    </View>
  )
}
