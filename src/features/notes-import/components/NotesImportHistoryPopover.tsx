import {
  CircleCheck as CircleCheckIcon,
  CirclePause as CirclePauseIcon,
  CircleStop as CircleStopIcon,
  Clock as ClockIcon,
  Trash2 as Trash2Icon,
  TriangleAlert as TriangleAlertIcon,
} from 'lucide-react-native'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import type { ReactElement, ReactNode } from 'react'
import { Alert, ScrollView, useWindowDimensions, View } from 'react-native'
import { Spinner } from 'tamagui'
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import Popover from '@/components/ui/Popover'
import { touchTargetFrame } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import { useNotesImportManager } from '@/features/notes-import/hooks/useNotesImportManager'
import type { ImportRuntime } from '@/features/notes-import/lib/notesImportManagerLogic'
import {
  ledgerEntryTitle,
  isUnviewedReady,
  type NotesImportLedgerEntry,
} from '@/features/notes-import/lib/notesImportLedger'
import { notesImportCountsLine } from '@/features/notes-import/lib/notesImportMessages'
import { formatRelative } from '@/lib/dates'
import NotesImportReadyDot from '@/features/notes-import/components/NotesImportReadyDot'

/**
 * An import is "in progress" while its row is Working and not blocked on an
 * error or a user pause — i.e. running, queued, or reconnecting. This is the
 * signal behind the yellow indicator and the in-progress count.
 */
export const isInProgress = (
  entry: NotesImportLedgerEntry,
  runtime: ImportRuntime | undefined
): boolean => entry.state === 'working' && !runtime?.error && !runtime?.paused

export interface NotesImportHistorySummary {
  /** Imports awaiting Accept (Ready), whether or not they've been viewed. */
  readyCount: number
  /** Unread Ready imports — drives the blue unread dot. */
  unviewedCount: number
  /** Imports actively working (running/queued/reconnecting). */
  inProgressCount: number
  hasDone: boolean
  total: number
}

/** One pass over the ledger for the counts the triggers + popover header need. */
export const useNotesImportHistorySummary = (): NotesImportHistorySummary => {
  const entries = useNotesImportManager((s) => s.entries)
  const runtimes = useNotesImportManager((s) => s.runtimes)
  let readyCount = 0
  let unviewedCount = 0
  let inProgressCount = 0
  let hasDone = false
  for (const entry of entries) {
    if (entry.state === 'ready') readyCount += 1
    if (isUnviewedReady(entry)) unviewedCount += 1
    if (isInProgress(entry, runtimes[entry.hash])) inProgressCount += 1
    if (entry.state === 'done') hasDone = true
  }
  return {
    readyCount,
    unviewedCount,
    inProgressCount,
    hasDone,
    total: entries.length,
  }
}

interface StatusVisual {
  label: string
  color: string
  icon: AppIcon | null
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
      icon: CircleCheckIcon,
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
      icon: CircleStopIcon,
    }
  }
  // Working sub-states.
  if (runtime?.error) {
    return {
      label: i18n.t('notesImport_stateError'),
      color: theme.colors.error,
      icon: TriangleAlertIcon,
    }
  }
  if (runtime?.paused) {
    return {
      label: i18n.t('notesImport_subPaused'),
      color: theme.colors.textAlt,
      icon: CirclePauseIcon,
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
    icon: ClockIcon,
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
  const relativeTime = formatRelative(entry.updatedAt)

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
        accessibilityLabel={`${title}. ${status.label}.${counts ? ` ${counts}.` : ''} ${relativeTime}.`}
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
            <LucideIcon icon={status.icon} size={16} color={status.color} />
          ) : null}
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {title}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('xs'),
              }}
            >
              {relativeTime}
            </Text>
          </View>
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
        // A full frame around the 34pt button it was. It's pulled back over
        // the row's own padding only: the list clips anything past its edge.
        style={[
          touchTargetFrame(34),
          { marginEnd: 0, borderRadius: theme.numbers.borderRadiusSm },
        ]}
      >
        <LucideIcon icon={Trash2Icon} size={14} color={theme.colors.textAlt} />
      </Button>
    </View>
  )
}

interface Props {
  /** Renders the press target; call `onPress` to open the popover. */
  renderTrigger: (props: {
    onPress: () => void
    expanded: boolean
  }) => ReactElement
}

/**
 * The Notes Import history popover (ADR 0009): the list of past + in-flight
 * imports, with a ready/in-progress summary and a clear-completed action.
 * Selecting a row loads it into the composer **in place** via a route param
 * merge (`setParams`) — never a screen navigation — so swapping imports never
 * grows the back stack.
 *
 * The composer's bottom callout supplies the trigger.
 */
const NotesImportHistoryPopover = ({ renderTrigger }: Props) => {
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
  const { readyCount, inProgressCount, hasDone } =
    useNotesImportHistorySummary()
  const popoverWidth = Math.min(width - 24, 380)

  const open = (hash: string) => navigation.setParams({ hash })

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

  const summaryLine = (
    color: string,
    label: string,
    dotColor?: string
  ): ReactNode => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingHorizontal: 6,
        paddingTop: 2,
      }}
    >
      <NotesImportReadyDot visible color={dotColor} />
      <Text
        style={{
          color,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('xs'),
        }}
      >
        {label}
      </Text>
    </View>
  )

  return (
    <Popover
      contentWidth={popoverWidth}
      contentStyle={{ padding: 8 }}
      backgroundColor={theme.colors.background}
      renderTrigger={renderTrigger}
    >
      {({ close }) => (
        <View style={{ gap: 6 }}>
          {inProgressCount > 0 &&
            summaryLine(
              theme.colors.warnText,
              // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
              i18n.t('notesImport_inProgressCount', { count: inProgressCount }),
              theme.colors.warn
            )}
          {readyCount > 0 &&
            summaryLine(
              theme.colors.textAlt,
              // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
              i18n.t('notesImport_readyCount', { count: readyCount })
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
    </Popover>
  )
}

export default NotesImportHistoryPopover
