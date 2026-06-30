import { View } from 'react-native'
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native'
import { faClockRotateLeft, faPlus } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import Button from '@/components/ui/Button'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import NotesImportReadyDot from '@/features/notes-import/components/NotesImportReadyDot'
import NotesImportHistoryPopover, {
  useNotesImportHistorySummary,
} from '@/features/notes-import/components/NotesImportHistoryPopover'

/**
 * Composer header actions (ADR 0009): the History popover trigger and a New
 * Import button. The popover itself (list, summary, positioning) lives in
 * `NotesImportHistoryPopover`, shared with the composer's bottom callout — this
 * supplies the clock trigger and overlays the status dot.
 *
 * The dot is yellow while any import is in progress (it takes precedence), and
 * otherwise the blue unread dot when Ready imports are waiting.
 */
const NotesImportHeaderActions = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const activeHash =
    useRoute<RouteProp<RootStackParamList, 'NotesImportComposer'>>().params
      ?.hash ?? null
  const { readyCount, unviewedCount, inProgressCount, total } =
    useNotesImportHistorySummary()

  const startNew = () => navigation.setParams({ hash: undefined })

  const a11yParts = [i18n.t('notesImport_historyTitle')]
  if (inProgressCount > 0)
    a11yParts.push(
      i18n.t('notesImport_inProgressCount', { count: inProgressCount })
    )
  if (readyCount > 0)
    a11yParts.push(i18n.t('notesImport_readyCount', { count: readyCount }))

  return (
    <View
      style={{
        position: 'absolute',
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
      }}
    >
      {total > 0 && (
        <NotesImportHistoryPopover
          openDirection='down'
          align='right'
          renderTrigger={({ onPress, anchorRef }) => (
            <View ref={anchorRef} collapsable={false}>
              <Button
                onPress={onPress}
                accessibilityRole='button'
                accessibilityLabel={`${a11yParts.join('. ')}.`}
                hitSlop={6}
                style={{
                  width: 32,
                  height: 32,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FontAwesomeIcon
                  icon={faClockRotateLeft}
                  size={15}
                  color={theme.colors.accent}
                />
                {/* In-progress (yellow) wins over the unread-ready (blue) dot. */}
                <NotesImportReadyDot
                  visible={inProgressCount > 0 || unviewedCount > 0}
                  color={inProgressCount > 0 ? theme.colors.warn : undefined}
                  style={{ position: 'absolute', top: 1, right: 0 }}
                />
              </Button>
            </View>
          )}
        />
      )}

      {/* "New Import" only makes sense when an import is already on screen.
          On a blank composer (no active hash) it's a no-op, so hide it. */}
      {activeHash && (
        <Button
          accessibilityRole='button'
          accessibilityLabel={i18n.t('notesImport_newImport')}
          hitSlop={6}
          onPress={startNew}
          style={{
            width: 32,
            height: 32,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FontAwesomeIcon
            icon={faPlus}
            size={15}
            color={theme.colors.accent}
          />
        </Button>
      )}
    </View>
  )
}

export default NotesImportHeaderActions
