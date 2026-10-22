import { View, type ViewStyle } from 'react-native'
import Text from '@/components/ui/MyText'
import InfoPopover from '@/components/ui/InfoPopover'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

type Theme = ReturnType<typeof useTheme>

/**
 * Shared visual treatment for user-authored chat bubbles: both the pasted notes
 * and every refinement instruction.
 */
export const notesImportUserBubbleStyle = (theme: Theme): ViewStyle => ({
  borderRadius: 20,
  borderBottomEndRadius: 4,
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

/**
 * Quiet allowance metadata shown only beneath the active Scribe AI turn. It
 * leads with what to do (reply) so a first-time user learns what a refinement
 * is, and the info popover holds the rest.
 */
export const NotesImportRefinementMeta = ({ remaining, limit }: MetaProps) => {
  const theme = useTheme()
  if (remaining === undefined || limit === undefined) return null

  const unlimited = remaining === null && limit === null
  const balance = unlimited
    ? i18n.t('notesImport_refinementMetaUnlimited')
    : i18n.t('notesImport_refinementMeta', { remaining, limit })
  // With none left, "reply to make changes" would invite a reply that fails.
  const label =
    remaining === 0
      ? balance
      : `${i18n.t('notesImport_refinementHint')} · ${balance}`
  const info = i18n.t('twoSentences', {
    first: i18n.t('notesImport_refinementInfoBody'),
    second: unlimited
      ? i18n.t('notesImport_refinementInfoUnlimited')
      : i18n.t('notesImport_refinementInfoLimit', { limit }),
  })

  return (
    <View
      style={{
        flexDirection: 'row',
        alignSelf: 'flex-start',
        alignItems: 'center',
        // Align with the AI content column: 42pt avatar + 12pt row gap.
        paddingLeft: 54,
      }}
    >
      <Text
        style={{
          flexShrink: 1,
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('xs'),
        }}
      >
        {label}
      </Text>
      <InfoPopover
        title={i18n.t('notesImport_refinementInfoTitle')}
        description={info}
        inline
      />
    </View>
  )
}
