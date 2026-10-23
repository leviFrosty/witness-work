import { Alert, ScrollView, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import confirmDestructive from '@/lib/confirmDestructive'
import i18n, { type TranslationKey } from '@/lib/locales'
import { tracking } from '@/lib/tracking'
import type { RootStackNavigation } from '@/types/rootStack'
import { useScribeHistory } from '@/features/scribe'
import {
  ScribeHistoryRow,
  ScribeLegacyImportRow,
} from '@/features/scribe/components/ScribeHistoryRows'
import { CONVERSATION_MAX_WIDTH } from '@/features/scribe/components/ScribeTimeline'

const SectionHeader = ({ title }: { title: string }) => {
  const theme = useTheme()
  return (
    <Text
      accessibilityRole='header'
      style={{
        fontSize: theme.fontSize('sm'),
        fontFamily: theme.fonts.semiBold,
        color: theme.colors.textAlt,
        textTransform: 'uppercase',
        letterSpacing: tracking(0.5),
        marginTop: 12,
        marginLeft: 4,
      }}
    >
      {title}
    </Text>
  )
}

/**
 * Past Scribe AI conversations on this device, newest first, and Notes Imports
 * from before Scribe AI that can still be undone.
 */
const ScribeHistoryScreen = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { isWide } = useAdaptiveLayout()
  const history = useScribeHistory()

  const open = (conversationId: string) =>
    navigation.popTo('ScribeConversation', {
      conversationId,
      entry: 'history',
    })

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
    >
      {/* Capped inside the content, not on it: in a right-to-left layout iOS
          pins a narrower content container to the right edge. */}
      <View
        style={{
          width: '100%',
          maxWidth: CONVERSATION_MAX_WIDTH,
          alignSelf: 'center',
          paddingHorizontal: isWide ? 24 : 15,
          gap: 8,
        }}
      >
        {history.conversations.length === 0 ? (
          <Text
            style={{
              textAlign: 'center',
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('md'),
              paddingVertical: 32,
            }}
          >
            {i18n.t('scribe_historyEmpty')}
          </Text>
        ) : (
          history.conversations.map((conversation) => (
            <ScribeHistoryRow
              key={conversation.id}
              conversation={conversation}
              onOpen={() => open(conversation.id)}
              onDelete={() =>
                confirmDestructive({
                  title: i18n.t('scribe_historyDeleteConfirm'),
                  confirmLabel: i18n.t('scribe_historyDelete'),
                  onConfirm: () => history.deleteConversation(conversation.id),
                })
              }
            />
          ))
        )}
        {history.legacyImports.length > 0 ? (
          <View style={{ gap: 8 }}>
            <SectionHeader title={i18n.t('scribe_historyEarlierImports')} />
            {history.legacyImports.map((entry) => (
              <ScribeLegacyImportRow
                key={entry.id}
                entry={entry}
                onUndo={() =>
                  confirmDestructive({
                    title: i18n.t('scribe_legacyUndoConfirm'),
                    confirmLabel: i18n.t('scribe_undo'),
                    onConfirm: () => {
                      const { kept } = history.undoLegacyImport(entry.id)
                      // A Contact a later Visit uses stays; say so.
                      if (kept > 0)
                        Alert.alert(
                          i18n.t('scribe_undone'),
                          i18n.t('scribe_undoKept' as TranslationKey, {
                            count: kept,
                          })
                        )
                    },
                  })
                }
              />
            ))}
          </View>
        ) : null}
      </View>
    </ScrollView>
  )
}

export default ScribeHistoryScreen
