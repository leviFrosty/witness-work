import { Alert, ScrollView, useWindowDimensions, View } from 'react-native'
import { Spinner } from 'tamagui'
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native'
import {
  faCircleCheck,
  faCirclePause,
  faCircleStop,
  faClock,
  faClockRotateLeft,
  faPlus,
  faTrashCan,
  faTriangleExclamation,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import AnchoredPopover from '@/components/ui/AnchoredPopover'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import { useNotesImportManager } from '@/features/notes-import/hooks/useNotesImportManager'
import type { ImportRuntime } from '@/features/notes-import/hooks/useNotesImportManager'
import {
  ledgerEntryTitle,
  readyImportCount,
  unviewedReadyImportCount,
  isUnviewedReady,
  type NotesImportLedgerEntry,
} from '@/features/notes-import/lib/notesImportLedger'
import { notesImportCountsLine } from '@/features/notes-import/lib/notesImportMessages'
import NotesImportReadyDot from '@/features/notes-import/components/NotesImportReadyDot'

interface StatusVisual {
  label: string
  color: string
  icon: IconDefinition | null
  spinner?: boolean
  readyDot?: boolean
}

const useStatusVisual = (
  entry: NotesImportLedgerEntry,
  runtime: ImportRuntime | undefined
): StatusVisual => {
  const theme = useTheme()
  if (entry.state === 'done') {
    return {
      label: i18n.t('notesImport_stateDone'),
      color: theme.colors.accent,
      icon: faCircleCheck,
    }
  }
  if (entry.state === 'ready') {
    return {
      label: i18n.t('notesImport_stateReady'),
      color: theme.colors.info,
      icon: null,
      // Only an unread Ready row gets the dot; once reviewed it stays Ready
      // (still awaiting Accept) but drops the new-result indicator.
      readyDot: isUnviewedReady(entry),
    }
  }
  if (entry.state === 'stopped') {
    return {
      label: i18n.t('notesImport_stateStopped'),
      color: theme.colors.textAlt,
      icon: faCircleStop,
    }
  }
  // Working sub-states.
  if (runtime?.error) {
    return {
      label: i18n.t('notesImport_stateError'),
      color: theme.colors.error,
      icon: faTriangleExclamation,
    }
  }
  if (runtime?.paused) {
    return {
      label: i18n.t('notesImport_subPaused'),
      color: theme.colors.textAlt,
      icon: faCirclePause,
    }
  }
  if (runtime?.running) {
    return {
      label: i18n.t('notesImport_subRunning'),
      color: theme.colors.textAlt,
      icon: null,
      spinner: true,
    }
  }
  return {
    label: i18n.t('notesImport_subQueued'),
    color: theme.colors.textAlt,
    icon: faClock,
  }
}

interface RowProps {
  entry: NotesImportLedgerEntry
  runtime: ImportRuntime | undefined
  active: boolean
  onPress: () => void
  onDelete: () => void
}

/** A compact history row inside the popover: tap to load, trash to delete. */
const HistoryRow = ({
  entry,
  runtime,
  active,
  onPress,
  onDelete,
}: RowProps) => {
  const theme = useTheme()
  const status = useStatusVisual(entry, runtime)
  const title = ledgerEntryTitle(entry) || i18n.t('notesImport_newImport')
  const counts = entry.result ? notesImportCountsLine(entry.result) : ''

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: theme.numbers.borderRadiusSm,
        backgroundColor: active ? theme.colors.accentTranslucent : undefined,
      }}
    >
      <Button
        onPress={onPress}
        accessibilityRole='button'
        accessibilityLabel={`${title}. ${status.label}.${counts ? ` ${counts}.` : ''}`}
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 10,
          paddingLeft: 10,
          paddingRight: 6,
        }}
      >
        <View
          style={{ width: 20, alignItems: 'center', justifyContent: 'center' }}
        >
          {status.spinner ? (
            <Spinner size='small' color={theme.colors.accent} />
          ) : status.readyDot ? (
            <NotesImportReadyDot visible size={9} />
          ) : status.icon ? (
            <FontAwesomeIcon
              icon={status.icon}
              size={16}
              color={status.color}
            />
          ) : null}
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {title}
          </Text>
          <Text
            numberOfLines={1}
            style={{ color: status.color, fontSize: theme.fontSize('xs') }}
          >
            {status.label}
            {counts ? ` · ${counts}` : ''}
          </Text>
        </View>
      </Button>

      <Button
        onPress={onDelete}
        accessibilityRole='button'
        accessibilityLabel={i18n.t('delete')}
        hitSlop={6}
        style={{
          paddingVertical: 10,
          paddingHorizontal: 10,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <FontAwesomeIcon
          icon={faTrashCan}
          size={14}
          color={theme.colors.textAlt}
        />
      </Button>
    </View>
  )
}

/**
 * Composer header actions (ADR 0009): a History popover and a New Import
 * button.
 *
 * Selecting a past import loads it into the composer **in place** via a route
 * param merge (`setParams`) rather than a screen navigation — so swapping
 * between imports never grows the back stack or strands the user mid-flow. The
 * full-screen history list it replaces caused exactly that.
 */
const NotesImportHeaderActions = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const activeHash =
    useRoute<RouteProp<RootStackParamList, 'NotesImportComposer'>>().params
      ?.hash ?? null
  const { width } = useWindowDimensions()
  const entries = useNotesImportManager((s) => s.entries)
  const runtimes = useNotesImportManager((s) => s.runtimes)
  const remove = useNotesImportManager((s) => s.remove)
  const clearCompleted = useNotesImportManager((s) => s.clearCompleted)

  const readyCount = readyImportCount(entries)
  // The dot tracks *unread* Ready imports; the "N ready for review" text below
  // still counts every Ready row (a viewed-but-unaccepted one is still ready).
  const unviewedCount = unviewedReadyImportCount(entries)
  const hasDone = entries.some((e) => e.state === 'done')
  const popoverWidth = Math.min(width - 24, 380)

  const open = (hash: string) => navigation.setParams({ hash })
  const startNew = () => navigation.setParams({ hash: undefined })

  const confirmDelete = (hash: string) => {
    Alert.alert(
      i18n.t('notesImport_deleteConfirmTitle'),
      i18n.t('notesImport_deleteConfirmBody'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('notesImport_delete'),
          style: 'destructive',
          onPress: () => remove(hash),
        },
      ]
    )
  }

  const confirmClearCompleted = () => {
    Alert.alert(
      i18n.t('notesImport_clearCompletedConfirmTitle'),
      i18n.t('notesImport_clearCompletedConfirmBody'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('notesImport_clearCompleted'),
          style: 'destructive',
          onPress: clearCompleted,
        },
      ]
    )
  }

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
      {entries.length > 0 && (
        <AnchoredPopover
          contentWidth={popoverWidth}
          contentStyle={{
            padding: 8,
            backgroundColor: theme.colors.background,
          }}
          // Right-align the list under the clock trigger, clamped to the window.
          resolvePosition={({ anchor, windowWidth, contentWidth }) => {
            const margin = 12
            const preferredLeft = anchor.x + anchor.width - contentWidth
            const left = Math.min(
              Math.max(margin, preferredLeft),
              windowWidth - contentWidth - margin
            )
            return { top: anchor.y + anchor.height + 6, left }
          }}
          renderTrigger={({ onPress, anchorRef }) => (
            <View ref={anchorRef} collapsable={false}>
              <Button
                onPress={onPress}
                accessibilityRole='button'
                accessibilityLabel={
                  readyCount > 0
                    ? `${i18n.t('notesImport_historyTitle')}. ${i18n.t('notesImport_readyCount', { count: readyCount })}.`
                    : i18n.t('notesImport_historyTitle')
                }
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
                <NotesImportReadyDot
                  visible={unviewedCount > 0}
                  style={{ position: 'absolute', top: 1, right: 0 }}
                />
              </Button>
            </View>
          )}
        >
          {({ close }) => (
            <View style={{ gap: 6 }}>
              {readyCount > 0 && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 7,
                    paddingHorizontal: 6,
                    paddingTop: 2,
                  }}
                >
                  <NotesImportReadyDot visible />
                  <Text
                    style={{
                      color: theme.colors.textAlt,
                      fontFamily: theme.fonts.semiBold,
                      fontSize: theme.fontSize('xs'),
                    }}
                  >
                    {i18n.t('notesImport_readyCount', { count: readyCount })}
                  </Text>
                </View>
              )}

              <ScrollView
                style={{ maxHeight: 360 }}
                contentContainerStyle={{ gap: 2 }}
                showsVerticalScrollIndicator={false}
              >
                {entries.map((entry) => (
                  <HistoryRow
                    key={entry.hash}
                    entry={entry}
                    runtime={runtimes[entry.hash]}
                    active={entry.hash === activeHash}
                    onPress={() => {
                      close()
                      open(entry.hash)
                    }}
                    onDelete={() => confirmDelete(entry.hash)}
                  />
                ))}
              </ScrollView>

              {hasDone && (
                <Button
                  onPress={confirmClearCompleted}
                  style={{ alignSelf: 'center', paddingVertical: 8 }}
                >
                  <Text
                    style={{
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('sm'),
                      textDecorationLine: 'underline',
                    }}
                  >
                    {i18n.t('notesImport_clearCompleted')}
                  </Text>
                </Button>
              )}
            </View>
          )}
        </AnchoredPopover>
      )}

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
        <FontAwesomeIcon icon={faPlus} size={15} color={theme.colors.accent} />
      </Button>
    </View>
  )
}

export default NotesImportHeaderActions
